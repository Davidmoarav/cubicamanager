// app/api/informe/route.ts
// Informe ejecutivo por proyecto: agrega KPIs de estados de pago (módulo 1),
// retenciones/devoluciones (módulo 2), proyección de mano de obra (módulo 3)
// y costo real con margen (módulo 4).
//
//   GET ?proyecto_id=X  → informe completo de un proyecto
//   GET (sin proyecto)  → resumen compacto de todos (para tarjetas)
import { createServerSupabase } from '@/lib/supabase-server'
import { getOwnerId } from '@/lib/roles'
import { cargarCostosObras } from '@/lib/costos-server'
import { NextResponse, type NextRequest } from 'next/server'

const BILLED = ['presentado', 'aprobado', 'pagado']

function kpisProyecto(valorContrato: number, eps: any[], devs: any[], proy: any[], montoContrato = 0) {
  const billed = eps.filter(e => BILLED.includes(e.estado))
  const pagados = eps.filter(e => e.estado === 'pagado')

  const brutoAcum      = billed.reduce((s, e) => s + (e.bruto || 0), 0)
  const brutoCobrado   = pagados.reduce((s, e) => s + (e.bruto || 0), 0)
  const totalFacturado = billed.reduce((s, e) => s + (e.total || 0), 0)     // c/IVA
  const totalCobrado   = pagados.reduce((s, e) => s + (e.total || 0), 0)    // c/IVA

  // El avance financiero compara NETO contra NETO.
  // `bruto` del EP es neto; `proyectos.valor` viene CON IVA, así que se usa el
  // monto de contrato neto (o se descuenta el IVA del valor si no está cargado).
  const contratoNeto = montoContrato > 0
    ? montoContrato
    : Math.round((valorContrato || 0) / 1.19)

  const avanceFinanciero = contratoNeto > 0 ? (brutoAcum / contratoNeto) * 100 : 0
  const cobradoPct       = contratoNeto > 0 ? (brutoCobrado / contratoNeto) * 100 : 0
  const saldoPorFacturar = Math.max(0, valorContrato - brutoAcum)

  // Retenciones (módulo 2)
  const epsValidos = eps.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
  const retDescontada = epsValidos.reduce((s, e) => s + (e.retencion_monto || 0), 0)
  const antAmortizado = epsValidos.reduce((s, e) => s + (e.anticipo_desc || 0), 0)
  const retDevuelta = devs.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (d.monto || 0), 0)
  const antDevuelto = devs.filter(d => d.tipo === 'anticipo').reduce((s, d) => s + (d.monto || 0), 0)

  // Mano de obra (módulo 3)
  const hoy = new Date().toISOString().slice(0, 7)
  let costoMoTotal = 0, finiquitos = 0, gastoPendienteMo = 0, dotActual = 0, costoMoActual = 0
  for (const r of proy) {
    const costoMes = (r.dotacion || 0) * (r.costo_unitario || 0)
    costoMoTotal += costoMes
    finiquitos += r.finiquito || 0
    if (r.mes >= hoy) gastoPendienteMo += costoMes + (r.finiquito || 0)
    if (r.mes === hoy) { dotActual = r.dotacion || 0; costoMoActual = costoMes }
  }
  if (!dotActual && proy.length) {
    const fut = proy.find(r => r.mes >= hoy) || proy[0]
    dotActual = fut.dotacion || 0
    costoMoActual = (fut.dotacion || 0) * (fut.costo_unitario || 0)
  }

  return {
    valor_contrato: valorContrato,
    n_estados: eps.length,
    bruto_acumulado: brutoAcum,
    bruto_cobrado: brutoCobrado,
    total_facturado: totalFacturado,
    total_cobrado: totalCobrado,
    avance_financiero_pct: Math.round(avanceFinanciero * 10) / 10,
    cobrado_pct: Math.round(cobradoPct * 10) / 10,
    saldo_por_facturar: saldoPorFacturar,
    // retenciones
    retencion_acumulada: retDescontada,
    retencion_devuelta: retDevuelta,
    retencion_saldo: retDescontada - retDevuelta,
    anticipo_amortizado: antAmortizado,
    anticipo_devuelto: antDevuelto,
    anticipo_saldo: antAmortizado - antDevuelto,
    // mano de obra
    dotacion_actual: dotActual,
    costo_mo_mensual: costoMoActual,
    costo_mo_total: costoMoTotal + finiquitos,
    gasto_mo_pendiente: gastoPendienteMo,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')

  // ─── Resumen compacto de todos los proyectos (para tarjetas) ───
  if (!proyectoId) {
    const [{ data: proyectos }, { data: eps }, { data: devs }, { data: pmo }] = await Promise.all([
      supabase.from('proyectos').select('id, nombre, valor, monto_contrato').eq('user_id', ownerId),
      supabase.from('estados_pago').select('proyecto_id, estado, bruto, total, retencion_monto, anticipo_desc').eq('user_id', ownerId),
      supabase.from('devoluciones').select('proyecto_id, tipo, monto').eq('user_id', ownerId),
      supabase.from('proyeccion_mo').select('proyecto_id, mes, dotacion, costo_unitario, finiquito').eq('user_id', ownerId),
    ])

    const out = (proyectos ?? []).map(p => {
      const k = kpisProyecto(
        p.valor || 0,
        (eps ?? []).filter(e => e.proyecto_id === p.id),
        (devs ?? []).filter(d => d.proyecto_id === p.id),
        (pmo ?? []).filter(r => r.proyecto_id === p.id),
        Number((p as any).monto_contrato) || 0,
      )
      return {
        proyecto_id: p.id,
        avance_financiero_pct: k.avance_financiero_pct,
        cobrado_pct: k.cobrado_pct,
        total_cobrado: k.total_cobrado,
        saldo_por_facturar: k.saldo_por_facturar,
        gasto_mo_pendiente: k.gasto_mo_pendiente,
        retencion_saldo: k.retencion_saldo,
      }
    })
    return NextResponse.json(out)
  }

  // ─── Informe completo de un proyecto ───
  const [{ data: proyecto }, { data: eps }, { data: devs }, { data: pmo }] = await Promise.all([
    supabase.from('proyectos').select('*').eq('id', proyectoId).eq('user_id', ownerId).maybeSingle(),
    supabase.from('estados_pago').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('numero', { ascending: true }),
    supabase.from('devoluciones').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
    supabase.from('proyeccion_mo').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('mes', { ascending: true }),
  ])

  const kpis = kpisProyecto(proyecto?.valor || 0, eps ?? [], devs ?? [], pmo ?? [], Number((proyecto as any)?.monto_contrato) || 0)

  // Costo real y margen (módulo 4): mismo cálculo que Presupuesto y pagos
  let costos: any = null
  if (proyecto) {
    try {
      [costos] = await cargarCostosObras(supabase, ownerId, [proyecto])
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Error calculando costos' }, { status: 500 })
    }
  }

  return NextResponse.json({
    proyecto: proyecto ? { id: proyecto.id, nombre: proyecto.nombre, cliente: proyecto.cliente, direccion: (proyecto as any).direccion } : null,
    kpis,
    costos,
    estados_pago: eps ?? [],
    proyeccion_mo: pmo ?? [],
    devoluciones: devs ?? [],
  })
}
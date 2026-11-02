// app/api/reportes/obras/route.ts
// Comparativo de todas las obras: costo real, margen, cobros y caja.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { cargarBaseCostos, traerTodo } from '@/lib/costos-server'
import { calcularCostosObra, docsDeObra } from '@/lib/costos'
import { calcularFlujoCaja } from '@/lib/flujo-caja'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'finanzas')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { data: proyectos, error } = await supabase.from('proyectos').select('*').eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lista = proyectos ?? []
  if (lista.length === 0) return NextResponse.json([])

  try {
    const [base, eps, devoluciones, proyeccion] = await Promise.all([
      cargarBaseCostos(supabase, ownerId, lista),
      traerTodo<any>((d, h) => supabase.from('estados_pago')
        .select('proyecto_id, estado, fecha, bruto, monto_pagar, retencion_monto, anticipo_desc')
        .eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('devoluciones').select('proyecto_id, tipo, monto, fecha')
        .eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('proyeccion_mo').select('proyecto_id, mes, dotacion, costo_unitario, finiquito')
        .eq('user_id', ownerId).order('id').range(d, h)),
    ])
    const hoy = new Date().toISOString().slice(0, 10)

    return NextResponse.json(lista.map((p: any) => {
      const partidas = base.partidas.filter((x: any) => x.proyecto_id === p.id)
      const c = calcularCostosObra(p, partidas, base.gastos, base.docs, base.pesos)
      const epsObra = eps.filter(e => e.proyecto_id === p.id)
      const devsObra = devoluciones.filter(d => d.proyecto_id === p.id)
      const flujo = calcularFlujoCaja({
        proyecto: p,
        eps: epsObra,
        devoluciones: devsObra,
        gastos: base.gastos.filter((g: any) => g.proyecto_id === p.id),
        docs: docsDeObra(base.docs, p),
        proyeccionMO: proyeccion.filter(r => r.proyecto_id === p.id),
        presupuestoCosto: c.presupuesto_costo,
        gastoReal: c.gasto_real,
        hoy,
      })
      const pagados = epsObra.filter(e => e.estado === 'pagado')
      const validos = epsObra.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
      const retenido = validos.reduce((s, e) => s + (Number(e.retencion_monto) || 0), 0)
      const devuelto = devsObra.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (Number(d.monto) || 0), 0)

      return {
        proyecto_id: p.id,
        nombre: p.nombre,
        cliente: p.cliente,
        estado: p.estado,
        fin: p.fin ?? null,
        avance_fisico: c.avance_fisico,
        contrato: Number(p.monto_contrato) || Math.round((Number(p.valor) || 0) / 1.19),
        presupuesto_costo: c.presupuesto_costo,
        presupuesto_venta: c.presupuesto_venta,
        venta_ejecutada: c.venta_ejecutada,
        gasto_real: c.gasto_real,
        pct_gastado: c.pct_gastado,
        desviacion_ejecutada: c.desviacion_ejecutada,
        ganancia_real: c.ganancia_real,
        margen_real_pct: c.margen_real_pct,
        margen_esperado_pct: c.margen_venta_pct,
        cobrado: pagados.reduce((s, e) => s + (Number(e.monto_pagar) || 0), 0),
        retencion_saldo: Math.max(0, retenido - devuelto),
        saldo_caja: flujo.resumen.saldo_actual,
        saldo_minimo: flujo.resumen.saldo_minimo,
        mes_saldo_minimo: flujo.resumen.mes_saldo_minimo,
      }
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error armando el reporte' }, { status: 500 })
  }
}

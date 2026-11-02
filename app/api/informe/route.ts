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
import { kpisProyecto } from '@/lib/informe'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')

  // ─── Resumen compacto de todos los proyectos (para tarjetas) ───
  if (!proyectoId) {
    const [{ data: proyectos }, { data: eps }, { data: devs }, { data: pmo }] = await Promise.all([
      supabase.from('proyectos').select('*').eq('user_id', ownerId),
      supabase.from('estados_pago').select('proyecto_id, estado, bruto, total, retencion_monto, anticipo_desc').eq('user_id', ownerId),
      supabase.from('devoluciones').select('proyecto_id, tipo, monto').eq('user_id', ownerId),
      supabase.from('proyeccion_mo').select('proyecto_id, mes, dotacion, costo_unitario, finiquito').eq('user_id', ownerId),
    ])

    const out = (proyectos ?? []).map(p => {
      const k = kpisProyecto(
        p,
        (eps ?? []).filter(e => e.proyecto_id === p.id),
        (devs ?? []).filter(d => d.proyecto_id === p.id),
        (pmo ?? []).filter(r => r.proyecto_id === p.id),
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

  const kpis = kpisProyecto(proyecto ?? {}, eps ?? [], devs ?? [], pmo ?? [])

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
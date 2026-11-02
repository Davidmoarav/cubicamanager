// app/api/flujo-caja/route.ts
// Flujo de caja mensual de una obra (cálculo en lib/flujo-caja.ts).
import { createServerSupabase } from '@/lib/supabase-server'
import { getOwnerId } from '@/lib/roles'
import { cargarBaseCostos } from '@/lib/costos-server'
import { calcularCostosObra, docsDeObra } from '@/lib/costos'
import { calcularFlujoCaja } from '@/lib/flujo-caja'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data: proyecto } = await supabase
    .from('proyectos').select('*').eq('id', proyectoId).eq('user_id', ownerId).maybeSingle()
  if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  try {
    const [base, eps, devoluciones, proyeccion] = await Promise.all([
      cargarBaseCostos(supabase, ownerId, [proyecto]),
      supabase.from('estados_pago').select('estado, fecha, bruto, monto_pagar, retencion_monto, anticipo_desc').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
      supabase.from('devoluciones').select('tipo, monto, fecha').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
      supabase.from('proyeccion_mo').select('mes, dotacion, costo_unitario, finiquito').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
    ])
    const error = eps.error || devoluciones.error || proyeccion.error
    if (error) throw new Error(error.message)

    const costos = calcularCostosObra(proyecto, base.partidas, base.gastos, base.docs, base.pesos)
    return NextResponse.json(calcularFlujoCaja({
      proyecto,
      eps: eps.data ?? [],
      devoluciones: devoluciones.data ?? [],
      gastos: base.gastos,
      docs: docsDeObra(base.docs, proyecto),
      proyeccionMO: proyeccion.data ?? [],
      presupuestoCosto: costos.presupuesto_costo,
      gastoReal: costos.gasto_real,
      hoy: new Date().toISOString().slice(0, 10),
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error calculando el flujo de caja' }, { status: 500 })
  }
}

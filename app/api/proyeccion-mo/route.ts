// app/api/proyeccion-mo/route.ts
// Proyección de mano de obra por proyecto: dotación mes a mes,
// costo con imposiciones, finiquitos y gasto pendiente.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId, getRolActual } from '@/lib/roles'
import { NextResponse, type NextRequest } from 'next/server'
import { lectorSueldos } from '@/lib/supabase-admin'
import { MINIMO_PERSONAS } from '@/lib/imputacion-sueldos'

// Factor imposiciones patronales por defecto (SIS, mutual, cesantía ≈ +5%)
const FACTOR_IMPOSICIONES = 0.05

// Genera lista de meses 'YYYY-MM' entre dos fechas (inclusive)
function mesesEntre(desde: Date, hasta: Date): string[] {
  const out: string[] = []
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1)
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
  while (d <= fin) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

function resumen(rows: any[]) {
  const hoy = new Date().toISOString().slice(0, 7)
  let costoTotal = 0, finiquitoTotal = 0, gastoPendiente = 0
  let dotActual = 0, costoMensualActual = 0
  for (const r of rows) {
    const costoMes = (r.dotacion || 0) * (r.costo_unitario || 0)
    costoTotal += costoMes
    finiquitoTotal += r.finiquito || 0
    if (r.mes >= hoy) gastoPendiente += costoMes + (r.finiquito || 0)
    if (r.mes === hoy) { dotActual = r.dotacion || 0; costoMensualActual = costoMes }
  }
  // Si no hay fila para el mes actual, usar la primera futura como "actual"
  if (!dotActual && rows.length) {
    const fut = rows.find(r => r.mes >= hoy) || rows[0]
    dotActual = fut.dotacion || 0
    costoMensualActual = (fut.dotacion || 0) * (fut.costo_unitario || 0)
  }
  return {
    costo_total: costoTotal + finiquitoTotal,
    costo_mo: costoTotal,
    finiquito_total: finiquitoTotal,
    gasto_pendiente: gastoPendiente,
    dotacion_actual: dotActual,
    costo_mensual_actual: costoMensualActual,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  const sugerir    = req.nextUrl.searchParams.get('sugerir')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  // ─── Modo sugerir: arma curva desde empleados reales ───
  if (sugerir) {
    const [{ data: proy }, { data: emps }] = await Promise.all([
      supabase.from('proyectos').select('inicio, fin').eq('id', proyectoId).maybeSingle(),
      lectorSueldos(supabase).from('empleados').select('sueldo, estado').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
    ])

    const activos = (emps ?? []).filter((e: any) => e.estado === 'activo')
    const dotInicial = activos.length
    const sueldoProm = dotInicial > 0
      ? activos.reduce((s: number, e: any) => s + (e.sueldo || 0), 0) / dotInicial
      : 0
    // Con pocas personas, el promedio deja ver sueldos: el jefe de obra no lo recibe
    const info = await getRolActual(supabase)
    const costoUnitario = info?.rol === 'jefe_obra' && dotInicial < MINIMO_PERSONAS ? 0 : Math.round(sueldoProm * (1 + FACTOR_IMPOSICIONES))

    const inicio = proy?.inicio ? new Date(proy.inicio) : new Date()
    const fin = proy?.fin ? new Date(proy.fin) : new Date(inicio.getFullYear(), inicio.getMonth() + 5, 1)
    const hoy = new Date()
    const desde = inicio > hoy ? inicio : hoy
    const meses = mesesEntre(desde, fin)
    const n = meses.length || 1

    // Curva lineal decreciente: de dotInicial a 1
    const filas = meses.map((mes, i) => {
      const frac = n > 1 ? i / (n - 1) : 1
      const dot = Math.max(1, Math.round(dotInicial - frac * (dotInicial - 1)))
      return { mes, dotacion: dotInicial > 0 ? dot : 0, costo_unitario: costoUnitario, finiquito: 0 }
    })

    return NextResponse.json({
      sugerencia: true,
      dotacion_inicial: dotInicial,
      costo_unitario: costoUnitario,
      empleados_asignados: dotInicial,
      filas,
    })
  }

  // ─── Listar proyección guardada + resumen ───
  const { data, error } = await supabase
    .from('proyeccion_mo')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', ownerId)
    .order('mes', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = data ?? []
  return NextResponse.json({ filas: rows, resumen: resumen(rows) })
}

// ─── PUT: guardar la proyección completa (reemplaza) ───
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { proyecto_id, filas } = await req.json()
  if (!proyecto_id) return NextResponse.json({ error: 'proyecto_id requerido' }, { status: 400 })

  // Reemplazo total: borra las filas previas y reinserta
  await supabase.from('proyeccion_mo').delete().eq('proyecto_id', proyecto_id).eq('user_id', ownerId)

  const toInsert = (filas ?? [])
    .filter((f: any) => f.mes)
    .map((f: any) => ({
      user_id: ownerId,
      proyecto_id,
      mes: f.mes,
      dotacion: Number(f.dotacion) || 0,
      costo_unitario: Number(f.costo_unitario) || 0,
      finiquito: Number(f.finiquito) || 0,
    }))

  if (toInsert.length) {
    const { error } = await supabase.from('proyeccion_mo').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, guardadas: toInsert.length, resumen: resumen(toInsert) })
}
// app/api/remuneraciones/route.ts
// Genera/guarda liquidaciones de un período.
// La liquidación se RECALCULA EN EL SERVIDOR desde el empleado + parámetros:
// no se confía en montos enviados por el cliente.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { calcularLiquidacion, REM_DEFAULTS } from '@/types/finanzas'
import { sincronizarGastoSueldo } from '@/lib/imputacion-sueldos'
import { cargarVariablesMes } from '@/lib/tratos-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'remuneraciones')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const periodo = req.nextUrl.searchParams.get('periodo')

  // variables=1: días, horas, trato y semana corrida del mes por trabajador (lo que cambia mes a mes)
  if (req.nextUrl.searchParams.get('variables')) {
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return NextResponse.json({ error: 'Falta el período' }, { status: 400 })
    try {
      const { data: emps, error } = await supabase.from('empleados')
        .select('id, modalidad, sueldo, valor_dia, valor_hora').eq('user_id', ownerId)
      // Sin sql/55 no existen valor_dia ni valor_hora: todos quedan con su sueldo de siempre
      if (error) return NextResponse.json({})
      return NextResponse.json(await cargarVariablesMes(supabase, ownerId, periodo, emps ?? []))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Error leyendo el mes' }, { status: 500 })
    }
  }

  let query = supabase
    .from('liquidaciones')
    .select('*, empleado:empleados(*)')
    .eq('user_id', ownerId)

  if (periodo) query = query.eq('periodo', periodo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Guardar una liquidación calculada (upsert por empleado+periodo)
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'remuneraciones')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  if (!body.empleado_id || !body.periodo) {
    return NextResponse.json({ error: 'Faltan empleado_id y periodo' }, { status: 400 })
  }

  // Cargar empleado y parámetros DE LA ORGANIZACIÓN y recalcular en el servidor
  const [{ data: emp }, { data: params }] = await Promise.all([
    supabase.from('empleados').select('*').eq('id', body.empleado_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('parametros_remuneracion').select('*').eq('user_id', ownerId).maybeSingle(),
  ])
  if (!emp) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  // Lo variable del mes: días y horas del parte diario, tratos aprobados y semana corrida
  let variables = null
  try {
    variables = (await cargarVariablesMes(supabase, ownerId, body.periodo, [emp], params ?? null))[emp.id] ?? null
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer el mes del trabajador: ${e?.message ?? 'error'}` }, { status: 500 })
  }

  // Verificar si ya existe liquidación para ese empleado+periodo
  const { data: existing } = await supabase
    .from('liquidaciones')
    .select('*')
    .eq('empleado_id', body.empleado_id)
    .eq('periodo', body.periodo)
    .eq('user_id', ownerId)
    .maybeSingle()

  if (existing?.estado === 'pagada') {
    return NextResponse.json({ error: 'La liquidación ya está pagada: deshaz el pago antes de modificarla' }, { status: 400 })
  }

  const { trato_monto, semana_corrida, ...calc } = calcularLiquidacion(emp, { ...REM_DEFAULTS, ...(params ?? {}) }, variables)
  // trato_monto y semana_corrida son columnas de sql/55: solo viajan si hay algo que guardar
  // o si la fila ya las tiene (para poder volverlas a cero)
  const conTrato = trato_monto > 0 || semana_corrida > 0 || (existing && 'trato_monto' in existing)
  const fila = {
    empleado_id: body.empleado_id,
    periodo: body.periodo,
    ...calc,
    ...(conTrato ? { trato_monto, semana_corrida } : {}),
    estado: body.estado === 'pagada' ? 'pagada' : 'borrador',
    user_id: ownerId,
  }

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('liquidaciones')
      .update(fila)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await supabase
      .from('liquidaciones')
      .insert(fila)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  // La liquidación ya quedó guardada: si falla la imputación a obras, se avisa sin perderla
  try {
    await sincronizarGastoSueldo(supabase, ownerId, result)
  } catch (e: any) {
    return NextResponse.json({ ...result, aviso: `No se pudo imputar el sueldo a las obras: ${e?.message ?? 'error'}` })
  }
  return NextResponse.json(result)
}

// Marcar como pagada / cambiar estado
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'remuneraciones')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id, estado } = await req.json()
  if (estado !== 'pagada' && estado !== 'borrador') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  const { data, error } = await supabase
    .from('liquidaciones')
    .update({ estado })
    .eq('id', id)
    .eq('user_id', ownerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
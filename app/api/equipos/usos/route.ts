// app/api/equipos/usos/route.ts
// Uso de equipos por obra: cantidad × tarifa es gasto de obra, salvo que tenga factura.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { UsoEquipoSchema, validar } from '@/lib/validar'
import { partidaEsDeProyecto } from '@/lib/costos-server'
import { atribuirFactura, sincronizarGastoUso } from '@/lib/gastos-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('equipo_usos').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId)
    .order('fecha_desde', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(UsoEquipoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { equipo_id, proyecto_id, partida_id, cantidad, factura_id } = v.data

  const [{ data: equipo }, { data: proy }] = await Promise.all([
    supabase.from('equipos').select('nombre, tarifa').eq('id', equipo_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('proyectos').select('nombre').eq('id', proyecto_id).eq('user_id', ownerId).maybeSingle(),
  ])
  if (!equipo) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  if (partida_id && !(await partidaEsDeProyecto(supabase, ownerId, partida_id, proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
  }
  if (v.data.fecha_hasta && v.data.fecha_hasta < v.data.fecha_desde) {
    return NextResponse.json({ error: 'La fecha de término es anterior a la de inicio' }, { status: 400 })
  }

  const tarifa = v.data.tarifa ?? Number(equipo.tarifa) ?? 0
  const { data, error } = await supabase.from('equipo_usos').insert({
    ...v.data, tarifa, monto: Math.round(cantidad * tarifa), user_id: ownerId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    if (factura_id) await atribuirFactura(supabase, ownerId, factura_id, { proyecto_id, proyecto: proy.nombre, partida_id })
    await sincronizarGastoUso(supabase, ownerId, data, equipo.nombre)
  } catch (e: any) {
    return NextResponse.json({ ...data, aviso: `El uso quedó guardado, pero no se pudo actualizar el gasto: ${e?.message ?? 'error'}` })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { data: uso } = await supabase.from('equipo_usos').select('factura_id').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (uso?.factura_id) {
    await supabase.from('facturas').update({ proyecto: null, proyecto_id: null, partida_id: null })
      .eq('id', uso.factura_id).eq('user_id', ownerId)
  }
  await supabase.from('gastos_obra').delete().eq('equipo_uso_id', id).eq('user_id', ownerId)
  const { error } = await supabase.from('equipo_usos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

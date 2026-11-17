// app/api/partidas-proyecto/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { AvancePartidaSchema, PartidaSchema, validar, validarParcial } from '@/lib/validar'
import { recalcTodo, traerPartidas } from '@/lib/avance-server'
import { NextResponse, type NextRequest } from 'next/server'

// ─── GET ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  // Por páginas: una obra con muchas viviendas pasa de las 1000 filas que entrega PostgREST
  try {
    const data = await traerPartidas(supabase, proyectoId, ownerId, '*')
    data.sort((a: any, b: any) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo las partidas' }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(PartidaSchema, await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const body = v.data
  if (!body.proyecto_id) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })
  if (!body.descripcion) return NextResponse.json({ error: 'Falta la descripción' }, { status: 400 })

  // FK: el proyecto (y el grupo, si lo hay) deben pertenecer a ESTA organización
  const [{ data: proyOk }, madre] = await Promise.all([
    supabase.from('proyectos').select('id').eq('id', body.proyecto_id).eq('user_id', ownerId).maybeSingle(),
    body.parent_id
      ? supabase.from('partidas_proyecto').select('id').eq('id', body.parent_id).eq('proyecto_id', body.proyecto_id).eq('user_id', ownerId).maybeSingle()
      : null,
  ])
  if (!proyOk) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  if (madre && !madre.data) return NextResponse.json({ error: 'El grupo no pertenece a esta obra' }, { status: 400 })

  const { data, error } = await supabase
    .from('partidas_proyecto')
    .insert({
      unidad: 'gl', cantidad: 1, precio_unitario: 0, costo_unitario: 0, avance: 0, orden: 0,
      ...body,
      parent_id: body.parent_id || null,
      user_id: ownerId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTodo(supabase, body.proyecto_id, ownerId)
  return NextResponse.json(data)
}

// ─── PUT ──────────────────────────────────────────────────
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  // Lista blanca y solo lo que viene: guardar las notas o el avance no toca cantidad ni precio
  const v = validarParcial(PartidaSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id: _obra, ...cambios } = v.data
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })

  const { data: actual } = await supabase.from('partidas_proyecto').select('id, proyecto_id')
    .eq('id', body.id).eq('user_id', ownerId).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Partida no encontrada' }, { status: 404 })
  // La partida madre debe ser de la misma obra, y no la propia partida
  if (cambios.parent_id) {
    if (cambios.parent_id === body.id) return NextResponse.json({ error: 'Una partida no puede ser su propio grupo' }, { status: 400 })
    const { data: madre } = await supabase.from('partidas_proyecto').select('id')
      .eq('id', cambios.parent_id).eq('proyecto_id', actual.proyecto_id).eq('user_id', ownerId).maybeSingle()
    if (!madre) return NextResponse.json({ error: 'El grupo no pertenece a esta obra' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('partidas_proyecto')
    .update(cambios)
    .eq('id', body.id)
    .eq('user_id', ownerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTodo(supabase, actual.proyecto_id, ownerId)
  return NextResponse.json(data)
}

// ─── PATCH ─── solo el avance, desde Terreno. Puede llegar horas después de registrado:
// no toca el resto de la partida, y con base_avance no pisa lo que otra persona cambió.
export async function PATCH(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(AvancePartidaSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { id, avance, base_avance } = v.data

  const { data: actual, error: eActual } = await supabase.from('partidas_proyecto')
    .select('id, proyecto_id, avance').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (eActual) return NextResponse.json({ error: eActual.message }, { status: 500 })
  if (!actual) return NextResponse.json({ error: 'Esta partida ya no existe' }, { status: 404 })

  const { data: hijos, error: eHijos } = await supabase.from('partidas_proyecto')
    .select('id').eq('parent_id', id).eq('user_id', ownerId).limit(1)
  if (eHijos) return NextResponse.json({ error: eHijos.message }, { status: 500 })
  if ((hijos ?? []).length > 0) {
    return NextResponse.json({ error: 'Esta partida ahora tiene subpartidas: registra el avance en ellas' }, { status: 400 })
  }

  const hoy = Number(actual.avance) || 0
  if (base_avance != null && hoy !== Number(base_avance) && hoy !== avance) {
    return NextResponse.json({ error: `Otra persona dejó esta partida en ${hoy}%` }, { status: 409 })
  }

  const { data, error } = await supabase.from('partidas_proyecto')
    .update({ avance }).eq('id', id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTodo(supabase, actual.proyecto_id, ownerId)
  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id, proyecto_id } = await req.json()
  // CASCADE borra los hijos automáticamente
  const { error } = await supabase
    .from('partidas_proyecto')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (proyecto_id) await recalcTodo(supabase, proyecto_id, ownerId)
  return NextResponse.json({ ok: true })
}
// app/api/documentos/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { DocumentoSchema, validar } from '@/lib/validar'
import { NextResponse, type NextRequest } from 'next/server'

// ─── GET: listar documentos (opcionalmente filtrar por proyecto_id) ──
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')

  let query = supabase
    .from('documentos')
    .select('*')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })

  if (proyectoId) {
    query = query.eq('proyecto_id', proyectoId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST: registrar documento (el archivo ya fue subido al Storage) ──
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(DocumentoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // FK: el proyecto debe pertenecer a ESTA organización
  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Un adjunto debe ser de un registro de la misma obra
  for (const [tabla, id] of [['libro_obra', v.data.libro_id], ['prevencion_registros', v.data.prevencion_id]] as const) {
    if (!id) continue
    const { data: reg } = await supabase
      .from(tabla).select('id').eq('id', id).eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
    if (!reg) return NextResponse.json({ error: 'El registro no pertenece a esta obra' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documentos')
    .insert({ ...v.data, user_id: ownerId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE: eliminar documento + archivo de Storage ──
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()

  // 1. Obtener path del archivo
  const { data: doc, error: e1 } = await supabase
    .from('documentos')
    .select('archivo_path')
    .eq('id', id)
    .eq('user_id', ownerId)
    .single()

  if (e1 || !doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  // 2. Eliminar archivo de Storage
  await supabase.storage.from('proyecto-docs').remove([doc.archivo_path])

  // 3. Eliminar registro de la BD
  const { error: e2 } = await supabase
    .from('documentos')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
// app/api/libro-obra/route.ts
// Libro de obra digital. Es un registro: los folios no se editan ni se borran,
// se anulan con un motivo. Las fotos son documentos de la obra (documentos.libro_id).
//   GET ?proyecto_id=X  → folios, del más nuevo al más antiguo, con sus fotos
//   POST                → nuevo folio
//   PUT { id, motivo }  → anula un folio
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { LibroObraSchema, validar } from '@/lib/validar'
import { traerTodo } from '@/lib/costos-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  try {
    const [folios, docs] = await Promise.all([
      traerTodo<any>((d, h) => supabase.from('libro_obra').select('*')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('folio', { ascending: false }).range(d, h)),
      traerTodo<any>((d, h) => supabase.from('documentos').select('id, nombre, archivo_path, archivo_tipo, libro_id')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).not('libro_id', 'is', null).order('id').range(d, h)),
    ])

    // Enlaces temporales: el bucket es privado
    const urls: Record<string, string> = {}
    if (docs.length > 0) {
      const { data: firmadas } = await supabase.storage.from('proyecto-docs')
        .createSignedUrls(docs.map(d => d.archivo_path), 3600)
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls[f.path] = f.signedUrl
    }

    return NextResponse.json(folios.map(f => ({
      ...f,
      fotos: docs.filter(d => d.libro_id === f.id).map(d => ({ id: d.id, nombre: d.nombre, url: urls[d.archivo_path] ?? null })),
    })))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo el libro de obra' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(LibroObraSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Correlativo por obra. Si otro usuario toma el mismo folio, el índice único lo rechaza y se reintenta.
  for (let intento = 0; intento < 4; intento++) {
    const { data: ultimo } = await supabase.from('libro_obra').select('folio')
      .eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).order('folio', { ascending: false }).limit(1).maybeSingle()
    const { data, error } = await supabase.from('libro_obra')
      .insert({ ...v.data, folio: (ultimo?.folio || 0) + 1, autor: user.email ?? null, user_id: ownerId })
      .select().single()
    if (!error) return NextResponse.json(data)
    if (!/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'No se pudo asignar el folio: inténtalo de nuevo' }, { status: 409 })
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id, motivo } = await req.json()
  const texto = String(motivo ?? '').trim()
  if (!id || !texto) return NextResponse.json({ error: 'Indica el motivo de la anulación' }, { status: 400 })

  const { data, error } = await supabase.from('libro_obra')
    .update({ anulado: true, motivo_anulacion: texto.slice(0, 500) })
    .eq('id', id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

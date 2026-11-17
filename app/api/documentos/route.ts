// app/api/documentos/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, guardModulo, getOwnerId } from '@/lib/roles'
import { DocumentoSchema, TABLA_EVIDENCIA, validar } from '@/lib/validar'
import { NextResponse, type NextRequest } from 'next/server'

// Respaldo de una factura: lo maneja quien lleva la facturación (también el contador).
// Todo lo demás es de la obra: el contador solo lo lee.
async function guardDocumento(supabase: any, entidadTipo?: string | null) {
  return entidadTipo === 'factura' ? guardModulo(supabase, 'facturacion') : guardEscritura(supabase, 'obra')
}

// Las columnas de evidencia llegan con sql/53: si falta, se dice cuál ejecutar
const faltaMigracion = (msg?: string) => /entidad_tipo|entidad_id|partida_id|etapa|tomada_en|subido_por|\blat\b|\blng\b/.test(msg ?? '')
const AVISO_53 = 'Falta activar las evidencias en la base de datos (sql/53_evidencias.sql).'

// ─── GET: listar documentos (opcionalmente filtrar por proyecto_id) ──
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const q = req.nextUrl.searchParams
  const proyectoId = q.get('proyecto_id')
  const entidadTipo = q.get('entidad_tipo')
  const entidadId = q.get('entidad_id')
  const partidaId = q.get('partida_id')

  let query = supabase
    .from('documentos')
    .select('*')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })

  if (proyectoId) query = query.eq('proyecto_id', proyectoId)
  // Evidencia de un registro (un estado de pago, un parte…) o de una partida/vivienda
  if (entidadTipo && entidadId) query = query.eq('entidad_tipo', entidadTipo).eq('entidad_id', entidadId)
  if (partidaId) query = query.eq('partida_id', partidaId)
  // subarbol=<partida>: la carpeta completa de una vivienda o capítulo (la partida y sus descendientes)
  const subarbol = q.get('subarbol')
  if (subarbol && proyectoId) {
    const { data: ps, error: eP } = await supabase.from('partidas_proyecto').select('id, parent_id')
      .eq('proyecto_id', proyectoId).eq('user_id', ownerId)
    if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })
    const ids = new Set<string>([subarbol])
    let crecio = true
    while (crecio) {
      crecio = false
      for (const p of ps ?? []) if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) { ids.add(p.id); crecio = true }
    }
    query = query.in('partida_id', [...ids])
  }
  // Sin obra ni registro no se trae el archivo completo de la empresa
  if (!proyectoId && !entidadId && !partidaId) query = query.limit(500)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: faltaMigracion(error.message) ? AVISO_53 : error.message }, { status: 500 })
  }
  const docs = data ?? []

  // urls=1: enlaces temporales en un solo viaje (el bucket es privado)
  if (q.get('urls') && docs.length > 0) {
    const { data: firmadas } = await supabase.storage.from('proyecto-docs')
      .createSignedUrls(docs.map((d: any) => d.archivo_path), 3600)
    const urls: Record<string, string> = {}
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls[f.path] = f.signedUrl
    return NextResponse.json(docs.map((d: any) => ({ ...d, url: urls[d.archivo_path] ?? null })))
  }
  return NextResponse.json(docs)
}

// ─── POST: registrar documento (el archivo ya fue subido al Storage) ──
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(DocumentoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const ro = await guardDocumento(supabase, v.data.entidad_tipo)
  if (ro) return ro
  // Sin obra no hay partida que validar
  if (!v.data.proyecto_id) delete v.data.partida_id

  // FK: el proyecto debe pertenecer a ESTA organización (un contrato o una factura pueden no tener obra)
  if (v.data.proyecto_id) {
    const { data: proy } = await supabase
      .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
    if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  }

  // Un adjunto debe ser de un registro de la misma obra
  for (const [tabla, id] of [['libro_obra', v.data.libro_id], ['prevencion_registros', v.data.prevencion_id]] as const) {
    if (!id) continue
    const { data: reg } = await supabase
      .from(tabla).select('id').eq('id', id).eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
    if (!reg) return NextResponse.json({ error: 'El registro no pertenece a esta obra' }, { status: 400 })
  }

  // La evidencia debe ser de un registro de esta organización, y la partida, de esta obra
  const { entidad_tipo, entidad_id, partida_id } = v.data
  const esEvidencia = !!(entidad_id || partida_id)
  const tabla = entidad_tipo ? TABLA_EVIDENCIA[entidad_tipo] : null
  const [regOk, partidaOk] = await Promise.all([
    tabla && entidad_id
      ? supabase.from(tabla).select('id').eq('id', entidad_id).eq('user_id', ownerId).maybeSingle()
      : null,
    partida_id
      ? supabase.from('partidas_proyecto').select('id').eq('id', partida_id)
          .eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
      : null,
  ])
  if (regOk && !regOk.data) return NextResponse.json({ error: 'El registro de la evidencia no existe' }, { status: 400 })
  if (partidaOk && !partidaOk.data) return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })

  const { data, error } = await supabase
    .from('documentos')
    .insert({ ...v.data, user_id: ownerId, ...(esEvidencia ? { subido_por: user.id } : {}) })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: faltaMigracion(error.message) ? AVISO_53 : error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// ─── DELETE: eliminar documento + archivo de Storage ──
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  // El permiso depende de qué respalda el documento (sin sql/53 no hay entidad_tipo: es de obra)
  const { data: dueno } = await supabase.from('documentos').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
  const ro = await guardDocumento(supabase, dueno?.entidad_tipo)
  if (ro) return ro

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
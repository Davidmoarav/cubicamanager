// lib/subir-documento.ts
// Sube un archivo al bucket 'proyecto-docs' y lo registra como documento de la obra.
// Carpeta del dueño de la organización: así todos los miembros pueden abrirlo.

export const MAX_SIZE_DOC = 20 * 1024 * 1024 // 20 MB

export async function subirDocumento(
  supabase: any,
  proyectoId: string,
  file: File,
  extra: { categoria?: string; descripcion?: string | null; libro_id?: string | null; prevencion_id?: string | null } = {}
) {
  if (file.size > MAX_SIZE_DOC) throw new Error(`"${file.name}" supera los 20 MB.`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión expirada')

  let ownerId = user.id
  try {
    const rol = await (await fetch('/api/mi-rol')).json()
    if (rol?.owner_id) ownerId = rol.owner_id
  } catch { /* usa user.id */ }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${ownerId}/${proyectoId}/${Date.now()}_${safe}`

  // ArrayBuffer + contentType: evita "No content provided" con File directo
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) throw new Error(`"${file.name}" está vacío o no se pudo leer.`)

  const { error: upErr } = await supabase.storage.from('proyecto-docs').upload(path, buffer, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  })
  if (upErr) throw new Error(upErr.message)

  const res = await fetch('/api/documentos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proyecto_id: proyectoId,
      nombre: file.name,
      categoria: extra.categoria ?? (file.type.startsWith('image/') ? 'foto' : 'general'),
      descripcion: extra.descripcion ?? null,
      libro_id: extra.libro_id ?? null,
      prevencion_id: extra.prevencion_id ?? null,
      archivo_path: path,
      archivo_tipo: file.type || 'application/octet-stream',
      archivo_size: file.size,
    }),
  })
  if (!res.ok) {
    await supabase.storage.from('proyecto-docs').remove([path])
    throw new Error((await res.json().catch(() => ({})))?.error ?? 'No se pudo registrar el documento')
  }
  return res.json()
}

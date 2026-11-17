// lib/subir-documento.ts
// Sube un archivo al bucket 'proyecto-docs' y lo registra como documento de la obra.
// Carpeta del dueño de la organización: así todos los miembros pueden abrirlo.

export const MAX_SIZE_DOC = 20 * 1024 * 1024 // 20 MB

export interface ExtraDocumento {
  categoria?: string
  descripcion?: string | null
  libro_id?: string | null
  prevencion_id?: string | null
  entidad_tipo?: string
  entidad_id?: string
  partida_id?: string | null
  etapa?: 'antes' | 'durante' | 'despues'
  /** Dónde se tomó la foto (solo cámara, si el teléfono lo permite). */
  lat?: number
  lng?: number
}

// La carpeta del dueño no cambia durante la sesión: se pregunta una vez, no en cada archivo
let duenio: Promise<string> | null = null
function carpetaDuenio(supabase: any): Promise<string> {
  if (!duenio) {
    duenio = (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión expirada')
      try {
        const rol = await (await fetch('/api/mi-rol')).json()
        if (rol?.owner_id) return rol.owner_id as string
      } catch { /* usa user.id */ }
      return user.id as string
    })()
    duenio.catch(() => { duenio = null })
  }
  return duenio
}

// Una foto de teléfono pesa 3 a 8 MB; a 2000 px sigue siendo legible (también una boleta)
// y pesa diez veces menos: sube rápido con mala señal y ocupa menos almacenamiento.
const LADO_MAX = 2000
const PESO_SIN_TOCAR = 600 * 1024

export async function aligerarImagen(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= PESO_SIN_TOCAR) return file
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' } as any)
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Fondo blanco: un PNG con transparencia no debe quedar negro al pasar a JPEG
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    img.close?.()
    const blob = await new Promise<Blob | null>(ok => canvas.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    const nombre = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file // si el navegador no puede, se sube tal cual
  }
}

/** Sube varios archivos, de a `enParalelo`, y avisa el progreso. Devuelve los que fallaron. */
export async function subirVarios(
  supabase: any, proyectoId: string | null, files: File[], extra: ExtraDocumento = {},
  alAvanzar?: (listos: number, total: number) => void, enParalelo = 3
): Promise<{ archivo: string; error: string; file: File; causa: unknown }[]> {
  const fallidos: { archivo: string; error: string; file: File; causa: unknown }[] = []
  let siguiente = 0, listos = 0
  const trabajador = async () => {
    while (siguiente < files.length) {
      const f = files[siguiente++]
      try { await subirDocumento(supabase, proyectoId, f, extra) }
      catch (e: any) { fallidos.push({ archivo: f.name, error: e?.message ?? 'No se pudo subir', file: f, causa: e }) }
      alAvanzar?.(++listos, files.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(enParalelo, files.length) }, trabajador))
  return fallidos
}

export async function subirDocumento(
  supabase: any,
  proyectoId: string | null,
  file: File,
  extra: ExtraDocumento = {}
) {
  const tomadaEn = file.lastModified ? new Date(file.lastModified).toISOString() : undefined
  file = await aligerarImagen(file)
  const path = await subirArchivo(supabase, proyectoId, file, extra.entidad_tipo ? 'evidencias' : '')

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
      // Evidencia de un registro (sql/53): solo viaja si se pidió
      ...(extra.entidad_tipo && extra.entidad_id ? { entidad_tipo: extra.entidad_tipo, entidad_id: extra.entidad_id } : {}),
      ...(extra.partida_id ? { partida_id: extra.partida_id } : {}),
      ...(extra.etapa ? { etapa: extra.etapa } : {}),
      ...(extra.lat != null && extra.lng != null ? { lat: extra.lat, lng: extra.lng } : {}),
      ...(extra.entidad_tipo || extra.partida_id ? { tomada_en: tomadaEn } : {}),
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

// Sube el archivo a 'proyecto-docs' (sin registrarlo) y devuelve su ruta.
export async function subirArchivo(supabase: any, proyectoId: string | null, file: File, subcarpeta = '') {
  file = await aligerarImagen(file)
  if (file.size > MAX_SIZE_DOC) throw new Error(`"${file.name}" supera los 20 MB.`)

  const ownerId = await carpetaDuenio(supabase)

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Sin obra (un contrato, una factura): carpeta general de la empresa
  const path = `${ownerId}/${proyectoId || 'general'}/${subcarpeta ? subcarpeta + '/' : ''}${Date.now()}${Math.random().toString(36).slice(2, 6)}_${safe}`

  // ArrayBuffer + contentType: evita "No content provided" con File directo
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) throw new Error(`"${file.name}" está vacío o no se pudo leer.`)

  const { error: upErr } = await supabase.storage.from('proyecto-docs').upload(path, buffer, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  })
  if (upErr) throw new Error(upErr.message)
  return path as string
}

/** Ubicación actual, si el usuario lo permite. No espera más de 5 segundos ni falla. */
export function ubicacionActual(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise(ok => {
    const corte = setTimeout(() => ok(null), 5000)
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(corte); ok({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }) },
      () => { clearTimeout(corte); ok(null) },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 },
    )
  })
}

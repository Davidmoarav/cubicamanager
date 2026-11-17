'use client'
// lib/carpeta-vivienda.tsx
// Arma y descarga la carpeta PDF de una vivienda. Las fotos se bajan y se pasan como
// datos al PDF (no como enlaces), así el documento sirve sin conexión y no expira.
import { createClient } from './supabase'
import { guardarArchivo } from './nativo'
import { armarArbol } from './avance'

const aDatos = async (url: string): Promise<string | null> => {
  try {
    const blob = await (await fetch(url)).blob()
    if (!/^image\/(jpeg|png)$/.test(blob.type)) return null   // el PDF solo incrusta JPEG y PNG
    return await new Promise<string>(ok => { const r = new FileReader(); r.onloadend = () => ok(r.result as string); r.readAsDataURL(blob) })
  } catch { return null }
}

export async function descargarCarpetaVivienda(proyecto: any, vivienda: any, alAvanzar?: (texto: string) => void) {
  alAvanzar?.('Reuniendo fotos…')
  const [{ pdf }, { CarpetaViviendaPDF }, empresa, docs, partidas] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/obra/CarpetaViviendaPDF'),
    fetch('/api/empresa').then(r => r.json()).catch(() => null),
    fetch(`/api/documentos?proyecto_id=${proyecto.id}&subarbol=${vivienda.partida_id}&urls=1`).then(r => r.json()),
    fetch(`/api/partidas-proyecto?proyecto_id=${proyecto.id}`).then(r => r.json()),
  ])
  if (!Array.isArray(docs)) throw new Error(docs?.error ?? 'No se pudieron leer las fotos')

  // Partidas de la vivienda (sus hojas), en orden
  const arbol = armarArbol(Array.isArray(partidas) ? partidas : [])
  const hojas = arbol.subarbol(vivienda.partida_id)
    .filter((p: any) => p.id !== vivienda.partida_id && arbol.hijosDe(p.id).length === 0)
    .sort((a: any, b: any) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((p: any) => ({ descripcion: p.descripcion, unidad: p.unidad, cantidad: Number(p.cantidad), avance: Number(p.avance) || 0 }))

  // Fotos de a 4 en paralelo
  const conImagen: any[] = docs.map((d: any) => ({ ...d, imagen: null }))
  let i = 0, listas = 0
  const imagenes = conImagen.filter(d => d.url && String(d.archivo_tipo || '').startsWith('image/'))
  await Promise.all(Array.from({ length: Math.min(4, imagenes.length) }, async () => {
    while (i < imagenes.length) {
      const d = imagenes[i++]
      d.imagen = await aDatos(d.url)
      alAvanzar?.(`Fotos ${++listas} de ${imagenes.length}…`)
    }
  }))

  let logoUrl: string | null = null
  if (empresa?.logo_path) {
    const { data: { publicUrl } } = createClient().storage.from('empresa-logos').getPublicUrl(empresa.logo_path)
    logoUrl = await aDatos(publicUrl)
  }

  alAvanzar?.('Armando el PDF…')
  const blob = await pdf(
    <CarpetaViviendaPDF proyecto={proyecto} vivienda={vivienda} partidas={hojas} docs={conImagen} empresa={empresa} logoUrl={logoUrl} />
  ).toBlob()
  const limpio = String(vivienda.beneficiario).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_')
  await guardarArchivo(blob, `Carpeta_${limpio}.pdf`)
}

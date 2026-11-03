// lib/nativo.ts
// Lo que cambia cuando la app corre dentro de iOS o Android (Capacitor).
// Sus navegadores internos ignoran <a download>: un archivo se guarda y se comparte.
import { Capacitor } from '@capacitor/core'
import { avisar } from './avisos'

export const esNativo = () => Capacitor.isNativePlatform()

const aBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const lector = new FileReader()
  lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
  lector.onerror = () => reject(lector.error)
  lector.readAsDataURL(blob)
})

export const nombreDeArchivo = (nombre: string) => nombre.replace(/[/\\:*?"<>|]/g, '_').trim() || 'archivo'

export async function guardarArchivo(blob: Blob, nombre: string) {
  if (!esNativo()) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: nombreDeArchivo(nombre),
    data: await aBase64(blob),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title: nombre, files: [uri] })
  } catch (e: any) {
    // Cerrar el menú de compartir no es un error
    if (!/cancel/i.test(String(e?.message ?? e))) throw e
  }
}

// XLSX.writeFile también descarga con <a download>
export async function guardarExcel(XLSX: typeof import('xlsx'), libro: import('xlsx').WorkBook, nombre: string) {
  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' })
  await guardarArchivo(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre)
}

// Para un <a href download> de un archivo publicado: en la app no descargaría nada
export function descargaEnNativo(e: { preventDefault(): void; currentTarget: HTMLAnchorElement }, nombre: string) {
  if (!esNativo()) return
  e.preventDefault()
  fetch(e.currentTarget.href)
    .then(res => { if (!res.ok) throw new Error(); return res.blob() })
    .then(blob => guardarArchivo(blob, nombre))
    .catch(() => avisar('No se pudo descargar el archivo'))
}

// Para lo que debe pasar en el navegador del teléfono: el link del correo de recuperación
// se abre ahí, y el código de verificación debe estar en ese mismo navegador.
export async function abrirEnNavegador(url: string) {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

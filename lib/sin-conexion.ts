// lib/sin-conexion.ts
// Lo que necesita el teléfono para abrir Terreno sin señal: el service worker (public/sw.js)
// y una copia de las obras con que se trabaja. Las copias son de una sola cuenta.
const CACHE_DATOS = 'cubica-datos-v1'     // el mismo de public/sw.js
const CLAVE_USUARIO = 'terreno.usuario'
const DIAS_ATRAS = 7
const MAX_OBRAS = 10

const diaISO = (atras = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - atras)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const soportado = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

// Una copia hecha antes de que el service worker controle la página no quedaría guardada
async function swListo(): Promise<boolean> {
  if (!soportado()) return false
  await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) return true
  await new Promise<void>(resolve => {
    const fin = setTimeout(resolve, 3000)
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(fin); resolve() }, { once: true })
  })
  return !!navigator.serviceWorker.controller
}

export async function prepararSinConexion(usuario?: string) {
  if (!soportado() || process.env.NODE_ENV !== 'production') return
  try {
    await revisarUsuario(usuario)
    await navigator.serviceWorker.register('/sw.js')
    if (!navigator.onLine || !(await swListo()) || yaHecho('terreno.precarga.pagina')) return
    navigator.serviceWorker.controller?.postMessage({ tipo: 'precargar' })
  } catch { /* sin service worker la app sigue funcionando con señal */ }
}

// Si entra otra cuenta sin haber cerrado sesión, no debe ver las copias de la anterior
async function revisarUsuario(usuario?: string) {
  if (!usuario) return
  let anterior: string | null = null
  try {
    anterior = localStorage.getItem(CLAVE_USUARIO)
    localStorage.setItem(CLAVE_USUARIO, usuario)
  } catch { return }
  if (anterior && anterior !== usuario) await borrarCopias()
}

async function borrarCopias() {
  try {
    if ('caches' in window) await caches.delete(CACHE_DATOS)
    Object.keys(sessionStorage).filter(k => k.startsWith('terreno.precarga.')).forEach(k => sessionStorage.removeItem(k))
  } catch { /* sin almacenamiento */ }
}

// La cola de pendientes no se borra: es de esta cuenta y se envía cuando vuelva a entrar.
export async function limpiarAlCerrarSesion() {
  await borrarCopias()
}

function yaHecho(clave: string): boolean {
  try {
    const marca = `${clave}:${diaISO()}`
    if (sessionStorage.getItem(marca)) return true
    sessionStorage.setItem(marca, '1')
  } catch { /* sin almacenamiento: se repite la copia */ }
  return false
}

// Copias para trabajar sin señal: de la obra elegida, toda la semana, para "Copiar último parte"
export async function precargarObras(obraElegida: string, obras: string[]) {
  if (process.env.NODE_ENV !== 'production' || !navigator.onLine || !(await swListo().catch(() => false))) return
  const pedir = async (url: string) => { await fetch(url).catch(() => null) }

  if (!yaHecho(`terreno.precarga.obra.${obraElegida}`)) {
    await pedir(`/api/partidas-proyecto?proyecto_id=${obraElegida}`)
    for (let atras = 0; atras <= DIAS_ATRAS; atras++) {
      await pedir(`/api/parte-diario?proyecto_id=${obraElegida}&fecha=${diaISO(atras)}`)
    }
  }
  if (yaHecho('terreno.precarga.resto')) return
  await pedir('/api/proyectos')
  await pedir('/api/mi-rol')
  for (const id of obras.filter(o => o !== obraElegida).slice(0, MAX_OBRAS)) {
    await pedir(`/api/partidas-proyecto?proyecto_id=${id}`)
    await pedir(`/api/parte-diario?proyecto_id=${id}&fecha=${diaISO()}`)
  }
}

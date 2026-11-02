// public/sw.js
// Permite abrir Terreno sin señal. Siempre prefiere la red: la copia solo se usa si no
// hay conexión. Lo que se registra sin señal no pasa por aquí: va en lib/cola-terreno.ts.

const ESTATICOS = 'cubica-estaticos-v1'
const DATOS = 'cubica-datos-v1'           // lib/sin-conexion.ts lo borra al cerrar sesión
const PAGINA = '/terreno'
const APIS = ['/api/proyectos', '/api/partidas-proyecto', '/api/parte-diario', '/api/mi-rol']
const PUBLICOS = ['/logo.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']
const ESPERA_RED = 4000
const MAX_ESTATICOS = 400
const MAX_DATOS = 300

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const vigentes = [ESTATICOS, DATOS]
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith('cubica-') && !vigentes.includes(nombre)) await caches.delete(nombre)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.tipo === 'precargar') event.waitUntil(precargarPagina().catch(() => {}))
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/_next/static/') || PUBLICOS.includes(url.pathname)) {
    event.respondWith(cachePrimero(req))
  } else if (req.mode === 'navigate') {
    event.respondWith(url.pathname === PAGINA
      ? redPrimero(req, 'text/html', paginaSinConexion)
      : fetch(req).catch(paginaSinConexion))
  } else if (APIS.includes(url.pathname)) {
    event.respondWith(redPrimero(req, 'application/json', () => respaldoApi(url)))
  }
})

async function cachePrimero(req) {
  const cache = await caches.open(ESTATICOS)
  const copia = await cache.match(req, { ignoreVary: true })
  if (copia) return copia
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}

// Con copia no espera a una red mala; sin copia, espera lo que tarde.
async function redPrimero(req, tipo, respaldo) {
  const cache = await caches.open(DATOS)
  const copia = await cache.match(req, { ignoreVary: true })
  const red = fetch(req).then(async res => {
    if (sePuedeGuardar(res, tipo)) {
      await cache.put(req, res.clone())
      await recortar(DATOS, MAX_DATOS)
    }
    return res
  })
  if (!copia) return red.catch(respaldo)
  red.catch(() => {})
  const plazo = new Promise(resolve => setTimeout(() => resolve(copia), ESPERA_RED))
  return Promise.race([red, plazo]).catch(() => copia)
}

// Una sesión vencida responde con una redirección al login: eso no es una copia de Terreno.
function sePuedeGuardar(res, tipo) {
  return res.ok && !res.redirected && res.type === 'basic'
    && (res.headers.get('content-type') || '').includes(tipo)
}

async function recortar(nombre, max) {
  const cache = await caches.open(nombre)
  const claves = await cache.keys()
  for (const clave of claves.slice(0, Math.max(0, claves.length - max))) await cache.delete(clave)
}

// Un día que no está en el teléfono: la lista de trabajadores es de toda la empresa, así que
// sirve la de otro día. sin_copia avisa que no se sabe si ese día ya tenía horas.
async function respaldoApi(url) {
  if (url.pathname === '/api/parte-diario' && url.searchParams.has('fecha')) {
    const cache = await caches.open(DATOS)
    const claves = (await cache.keys()).reverse()
    const parte = claves.find(c => {
      const u = new URL(c.url)
      return u.pathname === '/api/parte-diario' && u.searchParams.has('fecha')
    })
    const copia = parte && await (await cache.match(parte, { ignoreVary: true }))?.json().catch(() => null)
    if (copia?.empleados) {
      return Response.json({ filas: [], empleados: copia.empleados, sin_copia: true })
    }
  }
  return Response.json({ error: 'Sin conexión' }, { status: 503 })
}

function paginaSinConexion() {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title></head>
<body style="font-family:system-ui,sans-serif;background:#F6F4F1;color:#131C2B;text-align:center;padding:64px 24px">
<h1 style="font-size:20px">Sin conexión</h1>
<p style="font-size:14px">Esta pantalla necesita internet. Terreno sigue disponible si ya lo abriste con señal.</p>
<p><a href="${PAGINA}" style="font-weight:600;color:#131C2B">Ir a Terreno</a></p></body></html>`,
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// Deja en el teléfono Terreno y todos sus archivos, aunque la persona no haya entrado todavía.
async function precargarPagina() {
  const res = await fetch(PAGINA, { credentials: 'same-origin' })
  if (!sePuedeGuardar(res, 'text/html')) return
  const html = await res.clone().text()
  await (await caches.open(DATOS)).put(PAGINA, res)

  const archivos = new Set(PUBLICOS)
  for (const [ruta] of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>)]+/g)) {
    archivos.add(ruta.startsWith('/_next/') ? ruta : `/_next/${ruta}`)
  }
  const cache = await caches.open(ESTATICOS)
  for (const ruta of archivos) {
    if (await cache.match(ruta)) continue
    const archivo = await fetch(ruta).catch(() => null)
    if (archivo?.ok) await cache.put(ruta, archivo)
  }
  await recortar(ESTATICOS, MAX_ESTATICOS)
}

// lib/cola-terreno.ts
// Lo registrado en Terreno se guarda primero en el teléfono y luego se envía. Si no hay
// señal, queda en la cola y se envía después. Nada sale de la cola sin que el servidor
// lo confirme, y lo que el servidor rechaza queda a la vista hasta que alguien decida.
//
// La "guarda" dice qué se creía que había en el servidor al registrar: si otra persona
// lo cambió entretanto, el servidor responde 409 en vez de pisarlo.

export type TipoItem = 'parte' | 'avance'

export interface ItemCola {
  id: string
  clave: string                          // un registro por parte o partida: lo nuevo reemplaza
  tipo: TipoItem
  titulo: string
  metodo: 'PUT' | 'PATCH'
  url: string
  cuerpo: Record<string, any>
  guarda: Record<string, any> | null
  guardaResultado: Record<string, any>   // la guarda que vale una vez aplicado este registro
  estado: 'pendiente' | 'conflicto' | 'rechazado'
  error?: string
  creado: string
}

export type Resultado = 'enviado' | 'reintentar' | 'sesion' | 'conflicto' | 'rechazado'
export type EstadoEnvio = 'al_dia' | 'sin_senal' | 'sesion' | 'otra_cuenta'
export type Registro = { estado: 'enviado' | 'guardado' | 'sesion' | 'conflicto' | 'rechazado'; error?: string; aviso?: string }

type Almacen = Pick<Storage, 'getItem' | 'setItem'>
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const PLAZO_ENVIO = 20000

// ─── Identidad de un parte ───
// Misma cuenta en el teléfono y en el servidor, para comparar sin mandar todas las filas.
export function huellaParte(filas: { empleado_id: string; partida_id?: string | null; horas: number | string }[]): string {
  return filas
    .map(f => `${f.empleado_id}|${f.partida_id || ''}|${Number(f.horas)}`)
    .sort()
    .join(';')
}

// ─── Registros ───
export const claveParte = (proyectoId: string, fecha: string) => `parte:${proyectoId}:${fecha}`
export const claveAvance = (partidaId: string) => `avance:${partidaId}`

export function itemParte(d: {
  proyectoId: string; fecha: string; titulo: string
  filas: { empleado_id: string; partida_id: string | null; horas: number }[]
  filasBase: { empleado_id: string; partida_id?: string | null; horas: number | string }[]
}): ItemCola {
  return {
    id: crypto.randomUUID(),
    clave: claveParte(d.proyectoId, d.fecha),
    tipo: 'parte',
    titulo: d.titulo,
    metodo: 'PUT',
    url: '/api/parte-diario',
    cuerpo: { proyecto_id: d.proyectoId, fecha: d.fecha, filas: d.filas },
    guarda: { base: huellaParte(d.filasBase) },
    guardaResultado: { base: huellaParte(d.filas) },
    estado: 'pendiente',
    creado: new Date().toISOString(),
  }
}

export function itemAvance(d: { partidaId: string; proyectoId: string; avance: number; avanceBase: number; titulo: string }): ItemCola {
  return {
    id: crypto.randomUUID(),
    clave: claveAvance(d.partidaId),
    tipo: 'avance',
    titulo: d.titulo,
    metodo: 'PATCH',
    url: '/api/partidas-proyecto',
    cuerpo: { id: d.partidaId, proyecto_id: d.proyectoId, avance: d.avance },
    guarda: { base_avance: d.avanceBase },
    guardaResultado: { base_avance: d.avance },
    estado: 'pendiente',
    creado: new Date().toISOString(),
  }
}

// ─── Operaciones sobre la lista: funciones puras ───
// Corregir algo sin enviar no cambia lo que se creía del servidor: sigue valiendo la primera guarda.
export function agregar(cola: ItemCola[], nuevo: ItemCola): ItemCola[] {
  const previo = cola.find(i => i.clave === nuevo.clave)
  if (!previo) return [...cola, nuevo]
  return cola.map(i => i.clave === nuevo.clave ? { ...nuevo, guarda: previo.guarda, creado: previo.creado } : i)
}

export function aplicarResultado(cola: ItemCola[], item: ItemCola, resultado: Resultado, error?: string): ItemCola[] {
  if (resultado === 'enviado') {
    // Si se corrigió mientras viajaba, la corrección parte de lo recién enviado
    return cola
      .filter(i => i.id !== item.id)
      .map(i => i.clave === item.clave ? { ...i, guarda: item.guardaResultado } : i)
  }
  if (resultado === 'conflicto' || resultado === 'rechazado') {
    return cola.map(i => i.id === item.id ? { ...i, estado: resultado, error } : i)
  }
  // Sigue pendiente, pero se muestra por qué no ha salido
  return cola.map(i => i.id === item.id ? { ...i, error } : i)
}

export const enviarIgual = (cola: ItemCola[], id: string): ItemCola[] =>
  cola.map(i => i.id === id ? { ...i, guarda: null, estado: 'pendiente', error: undefined } : i)

export const quitar = (cola: ItemCola[], id: string): ItemCola[] => cola.filter(i => i.id !== id)

// El login responde 200 con HTML: creerle a ese "ok" borraría el registro sin haberlo guardado.
export function clasificar(res: { ok: boolean; status: number; redirected?: boolean; esJson?: boolean }): Resultado {
  if (res.redirected || res.status === 401) return 'sesion'
  if (res.ok) return res.esJson ? 'enviado' : 'sesion'
  if (res.status === 409) return 'conflicto'
  if (res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500) return 'reintentar'
  return 'rechazado'
}

// ─── Envío ───
export function leer(almacen: Almacen, usuario: string): ItemCola[] {
  try {
    const crudo = almacen.getItem(claveCola(usuario))
    const lista = crudo ? JSON.parse(crudo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

function escribir(almacen: Almacen, usuario: string, cola: ItemCola[]): boolean {
  try {
    almacen.setItem(claveCola(usuario), JSON.stringify(cola))
    return true
  } catch {
    return false
  }
}

const claveCola = (usuario: string) => `terreno.cola:${usuario}`

export async function enviarItem(item: ItemCola, fetchFn: Fetch): Promise<{ resultado: Resultado; error?: string; aviso?: string; sinRed?: boolean }> {
  try {
    const res = await fetchFn(item.url, {
      method: item.metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item.cuerpo, ...(item.guarda ?? {}) }),
      signal: AbortSignal.timeout(PLAZO_ENVIO),
    })
    const esJson = (res.headers.get('content-type') || '').includes('application/json')
    const j = esJson ? await res.json().catch(() => ({})) : {}
    return { resultado: clasificar({ ok: res.ok, status: res.status, redirected: res.redirected, esJson }), error: j.error, aviso: j.aviso }
  } catch {
    return { resultado: 'reintentar', sinRed: true }
  }
}

// Envía en orden. Solo lo manda la misma cuenta que lo registró: en un teléfono compartido,
// las horas de una persona no pueden quedar a nombre de otra.
export async function procesar(d: {
  usuario: string
  almacen: Almacen
  fetch: Fetch
  alCambiar?: () => void
  alEnviar?: (item: ItemCola, aviso?: string) => void
}): Promise<EstadoEnvio> {
  if (!leer(d.almacen, d.usuario).some(i => i.estado === 'pendiente')) return 'al_dia'

  const sesion = await d.fetch('/api/mi-rol').catch(() => null)
  if (!sesion) return 'sin_senal'
  if (sesion.redirected || sesion.status === 401) return 'sesion'
  if (sesion.ok) {
    const j = await sesion.json().catch(() => null)
    if (j?.email && j.email !== d.usuario) return 'otra_cuenta'
  }

  // Un registro que falla en el servidor no debe trabar a los que vienen después
  const saltados = new Set<string>()
  for (;;) {
    const item = leer(d.almacen, d.usuario).find(i => i.estado === 'pendiente' && !saltados.has(i.id))
    if (!item) return saltados.size > 0 ? 'sin_senal' : 'al_dia'
    const { resultado, error, aviso, sinRed } = await enviarItem(item, d.fetch)
    if (sinRed) return 'sin_senal'
    if (resultado === 'sesion') return 'sesion'
    if (resultado === 'reintentar') saltados.add(item.id)

    const texto = error || (resultado === 'conflicto' ? 'Otra persona lo cambió mientras estaba sin enviar' : 'El servidor no lo aceptó')
    // Se relee: pudo corregirse mientras viajaba
    const actual = leer(d.almacen, d.usuario)
    escribir(d.almacen, d.usuario, aplicarResultado(actual, item, resultado, texto))
    if (resultado === 'enviado') d.alEnviar?.(item, aviso)
    d.alCambiar?.()
  }
}

// ─── En el navegador ───
let usuarioActual = ''
let estadoEnvio: EstadoEnvio = 'al_dia'
let envioEnCurso: Promise<EstadoEnvio> | null = null
let crudoCache: string | null = null
let colaCache: ItemCola[] = []
const oyentes = new Set<() => void>()
const avisosEnvio = new Map<string, string>()
const oyentesEnvio = new Set<(item: ItemCola, aviso?: string) => void>()

const almacenNavegador = (): Almacen => window.localStorage
const notificar = () => oyentes.forEach(o => o())

export function fijarUsuarioCola(usuario: string) {
  if (usuario === usuarioActual) return
  usuarioActual = usuario
  crudoCache = null
  notificar()
}

export function suscribirCola(oyente: () => void) {
  oyentes.add(oyente)
  // Otra pestaña pudo cambiarla
  window.addEventListener('storage', oyente)
  return () => { oyentes.delete(oyente); window.removeEventListener('storage', oyente) }
}

export function suscribirEnvios(oyente: (item: ItemCola, aviso?: string) => void) {
  oyentesEnvio.add(oyente)
  return () => { oyentesEnvio.delete(oyente) }
}

const SIN_ITEMS: ItemCola[] = []
export const colaVacia = () => SIN_ITEMS
export const obtenerEstadoEnvio = () => estadoEnvio

// Devuelve siempre la misma lista si no cambió: useSyncExternalStore lo exige
export function obtenerCola(): ItemCola[] {
  if (!usuarioActual) return SIN_ITEMS
  let crudo: string | null = null
  try { crudo = almacenNavegador().getItem(claveCola(usuarioActual)) } catch { return SIN_ITEMS }
  if (crudo !== crudoCache) {
    crudoCache = crudo
    colaCache = leer(almacenNavegador(), usuarioActual)
  }
  return colaCache
}

export function sincronizar(): Promise<EstadoEnvio> {
  if (envioEnCurso) return envioEnCurso
  if (!usuarioActual) return Promise.resolve(estadoEnvio)
  envioEnCurso = procesar({
    usuario: usuarioActual,
    almacen: almacenNavegador(),
    fetch: (url, init) => window.fetch(url, init),
    alCambiar: notificar,
    alEnviar: (item, aviso) => {
      if (aviso) avisosEnvio.set(item.id, aviso)
      oyentesEnvio.forEach(o => o(item, aviso))
    },
  }).then(estado => {
    estadoEnvio = estado
    envioEnCurso = null
    notificar()
    return estado
  }, () => {
    envioEnCurso = null
    return estadoEnvio
  })
  return envioEnCurso
}

// Guarda y trata de enviar de inmediato: con señal se comporta como siempre.
export async function registrar(item: ItemCola): Promise<Registro> {
  const almacen = almacenNavegador()
  const guardado = usuarioActual && escribir(almacen, usuarioActual, agregar(leer(almacen, usuarioActual), item))

  // Sin almacenamiento en este navegador: se envía directo, y si falla se dice
  if (!guardado) {
    const { resultado, error, aviso } = await enviarItem(item, (url, init) => window.fetch(url, init))
    if (resultado === 'enviado') return { estado: 'enviado', aviso }
    if (resultado === 'conflicto' || resultado === 'rechazado') return { estado: resultado, error }
    return { estado: 'rechazado', error: 'No se pudo enviar ni guardar en este teléfono' }
  }
  notificar()

  // Un envío ya en curso pudo leer la cola antes de este registro
  await envioEnCurso?.catch(() => null)
  const estado = await sincronizar()

  const quedo = leer(almacen, usuarioActual).find(i => i.clave === item.clave)
  if (!quedo) {
    const aviso = avisosEnvio.get(item.id)
    avisosEnvio.delete(item.id)
    return { estado: 'enviado', aviso }
  }
  if (quedo.estado !== 'pendiente') return { estado: quedo.estado, error: quedo.error }
  return { estado: estado === 'sesion' || estado === 'otra_cuenta' ? 'sesion' : 'guardado' }
}

export function descartarDeCola(id: string) {
  const almacen = almacenNavegador()
  escribir(almacen, usuarioActual, quitar(leer(almacen, usuarioActual), id))
  notificar()
}

export function enviarIgualDeCola(id: string) {
  const almacen = almacenNavegador()
  escribir(almacen, usuarioActual, enviarIgual(leer(almacen, usuarioActual), id))
  notificar()
  return sincronizar()
}

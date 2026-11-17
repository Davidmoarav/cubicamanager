// lib/fotos-pendientes.ts
// Fotos y respaldos tomados sin señal: quedan en el teléfono (IndexedDB) y se suben solos
// cuando vuelve la conexión. Cada uno recuerda la cuenta que lo tomó: con otra cuenta abierta
// no se sube (iría a otra empresa).
import { aligerarImagen, subirDocumento, type ExtraDocumento } from './subir-documento'

export interface FotoPendiente {
  id: string
  usuario: string
  proyectoId: string | null
  extra: ExtraDocumento
  nombre: string
  tipo: string
  ultimaModificacion: number
  datos: Blob
  creado: string
  intentos: number
  error?: string
}

const BD = 'obramanager-fotos'
const TABLA = 'pendientes'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') return mal(new Error('Este navegador no puede guardar fotos sin conexión'))
    const pedido = indexedDB.open(BD, 1)
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(TABLA)) pedido.result.createObjectStore(TABLA, { keyPath: 'id' })
    }
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => mal(pedido.error)
  })
}

async function operar<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const bd = await abrir()
  return new Promise((ok, mal) => {
    const tx = bd.transaction(TABLA, modo)
    const pedido = fn(tx.objectStore(TABLA))
    tx.oncomplete = () => { bd.close(); ok(pedido.result) }
    tx.onerror = () => { bd.close(); mal(tx.error) }
  })
}

// ─── Aviso a quien muestre la cantidad ───
const oyentes = new Set<() => void>()
let cantidad = 0
const avisarCambio = async () => {
  try { cantidad = (await operar<FotoPendiente[]>('readonly', t => t.getAll())).length } catch { cantidad = 0 }
  oyentes.forEach(o => o())
}
export const suscribirFotos = (fn: () => void) => { oyentes.add(fn); avisarCambio(); return () => { oyentes.delete(fn) } }
export const cantidadFotos = () => cantidad

/** ¿El error es por falta de señal (y vale la pena guardar y reintentar)? */
export const esFaltaDeSenal = (e: any) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  /failed to fetch|load failed|network|networkerror|fetch failed|timeout|sin conexi/i.test(String(e?.message ?? e))

export async function guardarFoto(usuario: string, proyectoId: string | null, file: File, extra: ExtraDocumento) {
  const liviana = await aligerarImagen(file)
  const item: FotoPendiente = {
    id: crypto.randomUUID(), usuario, proyectoId, extra,
    nombre: liviana.name, tipo: liviana.type || 'application/octet-stream',
    // La fecha real de la foto, no la del envío
    ultimaModificacion: file.lastModified || Date.now(),
    datos: liviana, creado: new Date().toISOString(), intentos: 0,
  }
  await operar('readwrite', t => t.put(item))
  await avisarCambio()
}

export async function listarFotos(): Promise<FotoPendiente[]> {
  try { return await operar<FotoPendiente[]>('readonly', t => t.getAll()) } catch { return [] }
}

export async function descartarFoto(id: string) {
  await operar('readwrite', t => t.delete(id))
  await avisarCambio()
}

let enviando: Promise<number> | null = null

/** Sube lo pendiente de esta cuenta. Devuelve cuántas se subieron. */
export function enviarFotos(supabase: any, usuario: string): Promise<number> {
  if (enviando) return enviando
  enviando = (async () => {
    let subidas = 0
    for (const f of await listarFotos()) {
      if (f.usuario !== usuario) continue
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      const file = new File([f.datos], f.nombre, { type: f.tipo, lastModified: f.ultimaModificacion })
      try {
        await subirDocumento(supabase, f.proyectoId, file, f.extra)
        await operar('readwrite', t => t.delete(f.id))
        subidas++
      } catch (e: any) {
        if (esFaltaDeSenal(e)) break
        // El servidor la rechazó (registro borrado, permiso): queda a la vista para decidir
        await operar('readwrite', t => t.put({ ...f, intentos: f.intentos + 1, error: String(e?.message ?? e) }))
      }
    }
    await avisarCambio()
    return subidas
  })().finally(() => { enviando = null })
  return enviando
}

// lib/avance.ts
// Avance ponderado por valor del árbol de partidas (hojas → grupos → obra), a N niveles.
// Criterio único para partidas, matriz de beneficiarios y estados de pago:
//   valor  de un nodo = cantidad × precio si es hoja; suma de sus hijos si es grupo.
//   avance de un nodo = el suyo si es hoja; promedio de sus hijos ponderado por valor si es grupo.
// Lineal en el número de partidas: una obra con muchas viviendas se recorre una sola vez.

export interface NodoAvance {
  id: string
  parent_id?: string | null
  cantidad?: number | string | null
  precio_unitario?: number | string | null
  avance?: number | string | null
}

export interface ArbolAvance<T extends NodoAvance = NodoAvance> {
  raices: T[]
  hijosDe: (id: string) => T[]
  valor: (id: string) => number
  /** Avance sin redondear (0-100). */
  avance: (id: string) => number
  /** Nodo y todos sus descendientes. */
  subarbol: (id: string) => T[]
}

export function armarArbol<T extends NodoAvance>(todas: T[]): ArbolAvance<T> {
  const porId = new Map<string, T>()
  const hijos = new Map<string, T[]>()
  const raices: T[] = []
  for (const p of todas) porId.set(p.id, p)
  for (const p of todas) {
    if (!p.parent_id) { raices.push(p); continue }
    const lista = hijos.get(p.parent_id)
    if (lista) lista.push(p)
    else hijos.set(p.parent_id, [p])
  }
  const SIN_HIJOS: T[] = []
  const hijosDe = (id: string) => hijos.get(id) ?? SIN_HIJOS

  const memoValor = new Map<string, number>()
  const memoAvance = new Map<string, number>()

  const valor = (id: string): number => {
    const ya = memoValor.get(id)
    if (ya !== undefined) return ya
    memoValor.set(id, 0) // corta un ciclo si los datos vinieran corruptos
    const h = hijosDe(id)
    const n = porId.get(id)
    const v = h.length === 0
      ? (Number(n?.cantidad) || 0) * (Number(n?.precio_unitario) || 0)
      : h.reduce((s, c) => s + valor(c.id), 0)
    memoValor.set(id, v)
    return v
  }

  const avance = (id: string): number => {
    const ya = memoAvance.get(id)
    if (ya !== undefined) return ya
    memoAvance.set(id, 0)
    const h = hijosDe(id)
    let a: number
    if (h.length === 0) {
      a = Number(porId.get(id)?.avance) || 0
    } else {
      const total = h.reduce((s, c) => s + valor(c.id), 0)
      a = total > 0
        ? h.reduce((s, c) => s + avance(c.id) * (valor(c.id) / total), 0)
        : h.reduce((s, c) => s + avance(c.id), 0) / h.length
    }
    memoAvance.set(id, a)
    return a
  }

  const subarbol = (id: string): T[] => {
    const out: T[] = []
    const pila = [id]
    const vistos = new Set<string>()
    while (pila.length) {
      const actual = pila.pop() as string
      if (vistos.has(actual)) continue
      vistos.add(actual)
      const n = porId.get(actual)
      if (n) out.push(n)
      for (const c of hijosDe(actual)) pila.push(c.id)
    }
    return out
  }

  return { raices, hijosDe, valor, avance, subarbol }
}

export interface ResultadoAvance {
  /** Grupos cuyo avance guardado difiere del calculado. */
  cambios: { id: string; avance: number }[]
  /** Avance de la obra, 0-100 entero. */
  avanceProyecto: number
}

export function calcularAvances(todas: NodoAvance[]): ResultadoAvance {
  const arbol = armarArbol(todas)
  const cambios: { id: string; avance: number }[] = []
  for (const n of todas) {
    if (arbol.hijosDe(n.id).length === 0) continue
    const av = Math.round(arbol.avance(n.id))
    if (av !== (Number(n.avance) || 0)) cambios.push({ id: n.id, avance: av })
  }
  let totalValor = 0, totalPond = 0
  for (const r of arbol.raices) {
    const v = arbol.valor(r.id)
    totalValor += v
    totalPond += v * arbol.avance(r.id) / 100
  }
  return { cambios, avanceProyecto: totalValor > 0 ? Math.round((totalPond / totalValor) * 100) : 0 }
}

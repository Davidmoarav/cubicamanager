// lib/bodega.ts
// Stock y valorización de la bodega de una obra: funciones puras.
// El costo se lleva por promedio ponderado móvil.

export interface MovimientoBodega {
  material: string
  unidad?: string | null
  cantidad: number | string
  costo_unitario?: number | string | null
  fecha?: string | null
  created_at?: string | null
}

export interface LineaStock {
  clave: string
  material: string
  unidad: string
  stock: number
  costo_promedio: number
  valor: number
  consumido: number
}

const redondear = (n: number) => Math.round(n * 100) / 100

// Mismo material aunque cambien mayúsculas o espacios.
export const claveMaterial = (material: string, unidad?: string | null) =>
  `${(material || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${(unidad || 'un').trim().toLowerCase()}`

export function calcularStock(movimientos: MovimientoBodega[]): LineaStock[] {
  const orden = [...movimientos].sort((a, b) =>
    String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')) ||
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))

  const lineas = new Map<string, LineaStock>()
  for (const m of orden) {
    const clave = claveMaterial(m.material, m.unidad)
    const l = lineas.get(clave) ?? {
      clave, material: m.material.trim(), unidad: m.unidad || 'un', stock: 0, costo_promedio: 0, valor: 0, consumido: 0,
    }
    const cant = Number(m.cantidad) || 0
    const costo = Number(m.costo_unitario) || 0
    if (cant > 0 && costo > 0) {
      // Una entrada con costo mueve el promedio; un stock negativo previo no pesa
      const base = Math.max(l.stock, 0)
      l.costo_promedio = (base * l.costo_promedio + cant * costo) / (base + cant)
    }
    l.stock = redondear(l.stock + cant)
    if (cant < 0) l.consumido = redondear(l.consumido - cant)
    lineas.set(clave, l)
  }

  return [...lineas.values()]
    .map(l => ({ ...l, costo_promedio: Math.round(l.costo_promedio), valor: Math.round(l.stock * l.costo_promedio) }))
    .sort((a, b) => a.material.localeCompare(b.material))
}

export function stockDe(movimientos: MovimientoBodega[], material: string, unidad?: string | null) {
  const clave = claveMaterial(material, unidad)
  return calcularStock(movimientos).find(l => l.clave === clave) ?? null
}

// Si todo lo que entró de un material venía de una sola partida, un traspaso le
// devuelve el costo a esa partida. Si eran varias, no se puede saber: queda sin partida.
export function partidaUnicaDeEntradas(
  movimientos: (MovimientoBodega & { tipo?: string; partida_id?: string | null })[],
  material: string, unidad?: string | null
): string | null {
  const clave = claveMaterial(material, unidad)
  const entradas = movimientos.filter(m => m.tipo === 'entrada' && claveMaterial(m.material, m.unidad) === clave)
  const partidas = new Set(entradas.map(m => m.partida_id || null))
  return partidas.size === 1 ? [...partidas][0] : null
}

// ¿Quitar estos movimientos deja stock negativo? Devuelve el material afectado, o null.
export function materialQueQuedaNegativo(movimientos: (MovimientoBodega & { id?: string })[], idsQuitados: string[]): string | null {
  const quitados = movimientos.filter(m => m.id && idsQuitados.includes(m.id))
  const restantes = movimientos.filter(m => !(m.id && idsQuitados.includes(m.id)))
  const stock = calcularStock(restantes)
  for (const q of quitados) {
    const clave = claveMaterial(q.material, q.unidad)
    const l = stock.find(x => x.clave === clave)
    if (l && l.stock < 0) return l.material
  }
  return null
}

// lib/recepciones.ts
// Recepción por línea y conciliación de órdenes de compra: funciones puras.
//
//   El gasto de una OC es lo RECIBIDO valorizado, por partida.
//   Al asociar la factura, cuenta solo la factura (evita el doble conteo).

export interface LineaOC {
  id: string
  material?: string
  unidad?: string
  cantidad?: number | null
  precio_unitario?: number | null
  partida_id?: string | null
}

export interface RecepcionOC {
  linea_id: string
  cantidad?: number | null
  fecha?: string | null
}

export function recibidoPorLinea(recepciones: RecepcionOC[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of recepciones) out[r.linea_id] = redondear((out[r.linea_id] || 0) + (Number(r.cantidad) || 0))
  return out
}

const redondear = (n: number) => Math.round(n * 100) / 100

// Valida una recepción nueva. Devuelve el mensaje de error, o null si está bien.
export function validarRecepcion(
  lineas: LineaOC[],
  recepciones: RecepcionOC[],
  items: { linea_id: string; cantidad: number }[]
): string | null {
  if (items.length === 0) return 'Indica al menos una cantidad recibida'
  const recibido = recibidoPorLinea(recepciones)
  const vistos = new Set<string>()
  for (const it of items) {
    const linea = lineas.find(l => l.id === it.linea_id)
    if (!linea) return 'La línea no pertenece a esta orden de compra'
    if (vistos.has(it.linea_id)) return `"${linea.material}" está repetida en la recepción`
    vistos.add(it.linea_id)
    if (!(Number(it.cantidad) > 0)) return `La cantidad de "${linea.material}" debe ser mayor que 0`
    const pendiente = redondear((Number(linea.cantidad) || 0) - (recibido[it.linea_id] || 0))
    if (it.cantidad > pendiente) return `"${linea.material}": se recibirían más de las ${pendiente} pendientes`
  }
  return null
}

// Lo que falta por recibir de cada línea (para "recibir todo").
export function pendientes(lineas: LineaOC[], recepciones: RecepcionOC[]) {
  const recibido = recibidoPorLinea(recepciones)
  return lineas
    .map(l => ({ linea_id: l.id, cantidad: redondear((Number(l.cantidad) || 0) - (recibido[l.id] || 0)) }))
    .filter(p => p.cantidad > 0)
}

// El estado se deriva de lo recibido: parcial y recibida no se eligen a mano.
export function estadoSegunRecepciones(estadoActual: string, lineas: LineaOC[], recepciones: RecepcionOC[]): string {
  if (recepciones.length === 0) {
    return estadoActual === 'parcial' || estadoActual === 'recibida' ? 'enviada' : estadoActual
  }
  return pendientes(lineas, recepciones).length === 0 ? 'recibida' : 'parcial'
}

// Valor recibido por partida. La partida de la línea manda sobre la de la cabecera.
export function recibidoPorPartida(oc: { partida_id?: string | null }, lineas: LineaOC[], recepciones: RecepcionOC[]) {
  const recibido = recibidoPorLinea(recepciones)
  const grupos = new Map<string | null, number>()
  for (const l of lineas) {
    const cant = recibido[l.id] || 0
    if (cant <= 0) continue
    const partida = l.partida_id || oc.partida_id || null
    grupos.set(partida, (grupos.get(partida) || 0) + Math.round(cant * (Number(l.precio_unitario) || 0)))
  }
  return [...grupos.entries()].map(([partida_id, monto]) => ({ partida_id, monto }))
}

// Gastos que debe tener la OC: nada si está anulada, sin obra o ya facturada.
export function gastosDeOC(
  oc: { proyecto_id?: string | null; partida_id?: string | null; factura_id?: string | null; estado?: string; fecha?: string | null },
  lineas: LineaOC[],
  recepciones: RecepcionOC[]
) {
  if (!oc.proyecto_id || oc.factura_id || oc.estado === 'anulada') return []
  const fecha = recepciones.reduce<string | null>((max, r) => (r.fecha && (!max || r.fecha > max)) ? r.fecha : max, null) ?? oc.fecha ?? null
  return recibidoPorPartida(oc, lineas, recepciones)
    .filter(g => g.monto !== 0)
    .map(g => ({ ...g, proyecto_id: oc.proyecto_id as string, fecha }))
}

// Valida editar las líneas de una OC que ya tiene recepciones.
// Lo recibido ya entró a bodega y al gasto: no puede cambiar por debajo.
export function validarEdicionLineas(
  actuales: LineaOC[],
  recepciones: RecepcionOC[],
  nuevas: { id?: string; material?: string; unidad?: string; cantidad?: number; precio_unitario?: number }[]
): string | null {
  const recibido = recibidoPorLinea(recepciones)
  for (const a of actuales) {
    const cant = recibido[a.id] || 0
    if (cant <= 0) continue
    const n = nuevas.find(x => x.id === a.id)
    if (!n) return `"${a.material}" ya tiene recepciones: revierte la recepción antes de quitarla`
    if (n.material !== a.material || (n.unidad || 'un') !== (a.unidad || 'un') || Number(n.precio_unitario) !== Number(a.precio_unitario)) {
      return `"${a.material}" ya tiene recepciones: no se puede cambiar su material, unidad ni precio`
    }
    if (Number(n.cantidad) < cant) return `"${a.material}": ya se recibieron ${cant}, no se puede pedir menos`
  }
  return null
}

// ─── Conciliación OC ↔ factura ─────────────────────────────
export type EstadoConciliacion = 'sin_factura' | 'cuadra' | 'factura_mayor' | 'factura_menor'

const TOLERANCIA = 10 // pesos: diferencias de redondeo entre documentos

export function conciliar(
  ordenes: { neto?: number | null; lineas: LineaOC[]; recepciones: RecepcionOC[] }[],
  facturado: number | null
) {
  const neto_oc = ordenes.reduce((s, o) => s + (Number(o.neto) || 0), 0)
  const recibido = ordenes.reduce(
    (s, o) => s + recibidoPorPartida({}, o.lineas, o.recepciones).reduce((t, g) => t + g.monto, 0), 0)
  if (facturado === null) {
    return { neto_oc, recibido, facturado: null, diferencia: null, estado: 'sin_factura' as EstadoConciliacion }
  }
  const diferencia = facturado - recibido
  const estado: EstadoConciliacion = Math.abs(diferencia) <= TOLERANCIA ? 'cuadra'
    : diferencia > 0 ? 'factura_mayor' : 'factura_menor'
  return { neto_oc, recibido, facturado, diferencia, estado }
}

// Pesos para repartir una factura entre partidas, según lo recibido en sus OCs
// (o lo pedido, si aún no se recibe nada).
export function pesosFacturaPorPartida(ordenes: { partida_id?: string | null; lineas: LineaOC[]; recepciones: RecepcionOC[] }[]) {
  const pesos = new Map<string, number>()
  for (const o of ordenes) {
    const grupos = o.recepciones.length > 0
      ? recibidoPorPartida(o, o.lineas, o.recepciones)
      : recibidoPorPartida(o, o.lineas, o.lineas.map(l => ({ linea_id: l.id, cantidad: l.cantidad })))
    for (const g of grupos) {
      if (g.partida_id) pesos.set(g.partida_id, (pesos.get(g.partida_id) || 0) + g.monto)
    }
    // Lo que no tiene partida también pesa: esa parte queda sin partida
    const sinPartida = grupos.filter(g => !g.partida_id).reduce((s, g) => s + g.monto, 0)
    if (sinPartida) pesos.set('', (pesos.get('') || 0) + sinPartida)
  }
  return [...pesos.entries()].map(([partida_id, peso]) => ({ partida_id: partida_id || null, peso }))
}

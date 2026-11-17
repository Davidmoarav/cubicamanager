// lib/estado-pago.ts
// Estado de pago al mandante según la modalidad del contrato. Funciones puras.
//
//   suma_alzada    → una línea por partida raíz (o vivienda): valor × avance − lo ya cobrado.
//   serie_precios  → una línea por partida hoja: (cantidad medida acumulada − la ya cobrada) × precio.
//                    La cantidad medida puede pasar de la presupuestada (es lo que se mide en obra).
//   administracion → costo real de la obra no rendido en estados anteriores + honorario %.
//
// Lo ya cobrado se lleva en MONTO, no en %: si alguien cobró menos de lo sugerido,
// el saldo queda disponible para el estado siguiente.
import { armarArbol, type NodoAvance } from './avance'

export type ModalidadContrato = 'suma_alzada' | 'serie_precios' | 'administracion'
export const MODALIDADES_CONTRATO: { value: ModalidadContrato; label: string; ayuda: string }[] = [
  { value: 'suma_alzada',    label: 'Suma alzada',     ayuda: 'Se cobra el % de avance de cada partida sobre su valor contratado' },
  { value: 'serie_precios',  label: 'Serie de precios unitarios', ayuda: 'Se cobra la cantidad medida en obra × el precio unitario; puede pasar de lo presupuestado' },
  { value: 'administracion', label: 'Administración (costo + honorario)', ayuda: 'Se cobra el costo real de la obra más un honorario %' },
]

export interface PartidaEP extends NodoAvance {
  descripcion?: string | null
  unidad?: string | null
}

export interface DetallePrevio {
  partida_id: string | null
  monto?: number | string | null
  cantidad_actual?: number | string | null
}

export interface LineaEP {
  partida_id: string | null
  descripcion: string
  unidad?: string | null
  valor_partida: number
  avance_anterior: number
  avance_actual: number
  avance_periodo: number
  monto: number
  /** Tope de lo que se puede cobrar en esta línea. */
  maximo: number
  // Serie de precios
  precio_unitario?: number
  cantidad_presupuestada?: number
  cantidad_anterior?: number
  cantidad_actual?: number
}

const n = (v: unknown) => Number(v) || 0
const r1 = (v: number) => Math.round(v * 10) / 10

/** Ids de la vivienda/raíz y sus descendientes, para cada raíz en alcance. */
function enAlcance(partidas: PartidaEP[], alcance: string[]) {
  const arbol = armarArbol(partidas)
  const raices = alcance.length > 0 ? arbol.raices.filter(r => alcance.includes(r.id)) : arbol.raices
  return { arbol, raices }
}

export function lineasSumaAlzada(partidas: PartidaEP[], previos: DetallePrevio[], alcance: string[] = []): LineaEP[] {
  const { arbol, raices } = enAlcance(partidas, alcance)
  const cobradoPorId = new Map<string, number>()
  for (const d of previos) if (d.partida_id) cobradoPorId.set(d.partida_id, (cobradoPorId.get(d.partida_id) || 0) + n(d.monto))

  return raices.map(r => {
    const valor = Math.round(arbol.valor(r.id))
    // Lo cobrado de una raíz incluye lo cobrado a sus partidas (si alguna vez se cobró por serie)
    const cobrado = arbol.subarbol(r.id).reduce((s, p) => s + (cobradoPorId.get(p.id) || 0), 0)
    const avance = arbol.avance(r.id)
    const maximo = Math.max(0, Math.round(valor * avance / 100) - cobrado)
    const anterior = valor > 0 ? cobrado / valor * 100 : 0
    return {
      partida_id: r.id,
      descripcion: String(r.descripcion ?? ''),
      valor_partida: valor,
      avance_anterior: r1(anterior),
      avance_actual: r1(avance),
      avance_periodo: r1(Math.max(0, avance - anterior)),
      monto: maximo,
      maximo,
    }
  })
}

export function lineasSeriePrecios(partidas: PartidaEP[], previos: DetallePrevio[], alcance: string[] = []): LineaEP[] {
  const { arbol, raices } = enAlcance(partidas, alcance)
  // Cantidad ya cobrada por partida: la última cantidad acumulada registrada
  const cantPrev = new Map<string, number>()
  const montoPrev = new Map<string, number>()
  for (const d of previos) {
    if (!d.partida_id) continue
    if (d.cantidad_actual != null) cantPrev.set(d.partida_id, Math.max(cantPrev.get(d.partida_id) || 0, n(d.cantidad_actual)))
    montoPrev.set(d.partida_id, (montoPrev.get(d.partida_id) || 0) + n(d.monto))
  }
  const hojas: PartidaEP[] = []
  for (const r of raices) for (const p of arbol.subarbol(r.id)) if (arbol.hijosDe(p.id).length === 0) hojas.push(p)

  return hojas.map(h => {
    const precio = n(h.precio_unitario)
    const presup = n(h.cantidad)
    const valor = Math.round(precio * presup)
    // Si nunca se midió por cantidad, se parte de lo cobrado en monto
    const anterior = cantPrev.has(h.id) ? cantPrev.get(h.id)! : (precio > 0 ? (montoPrev.get(h.id) || 0) / precio : 0)
    const sugerida = Math.max(anterior, presup * n(h.avance) / 100)
    const monto = Math.max(0, Math.round((sugerida - anterior) * precio))
    const pct = (c: number) => presup > 0 ? r1(c / presup * 100) : 0
    return {
      partida_id: h.id,
      descripcion: String(h.descripcion ?? ''),
      unidad: h.unidad ?? null,
      valor_partida: valor,
      precio_unitario: precio,
      cantidad_presupuestada: presup,
      cantidad_anterior: Math.round(anterior * 1000) / 1000,
      cantidad_actual: Math.round(sugerida * 1000) / 1000,
      avance_anterior: pct(anterior),
      avance_actual: pct(sugerida),
      avance_periodo: r1(Math.max(0, pct(sugerida) - pct(anterior))),
      monto,
      // En serie de precios el tope lo pone la cantidad medida, no el presupuesto
      maximo: Number.POSITIVE_INFINITY,
    }
  })
}

export interface Cascada {
  avance_obra: number
  honorario_monto: number
  bruto: number
  anticipo_desc: number
  retencion_monto: number
  total_neto: number
  iva: number
  total: number
}

export function cascadaEP(avanceObra: number, p: { honorario_pct?: number; anticipo_pct?: number; retencion_pct?: number; descuentos?: number; multas?: number }, ivaPct = 19): Cascada {
  const avance_obra = Math.round(n(avanceObra))
  const honorario_monto = Math.round(avance_obra * n(p.honorario_pct) / 100)
  const bruto = avance_obra + honorario_monto
  const anticipo_desc = Math.round(bruto * n(p.anticipo_pct) / 100)
  const retencion_monto = Math.round(bruto * n(p.retencion_pct) / 100)
  const total_neto = bruto - Math.round(n(p.descuentos)) - anticipo_desc - Math.round(n(p.multas)) - retencion_monto
  const iva = Math.round(total_neto * ivaPct / 100)
  return { avance_obra, honorario_monto, bruto, anticipo_desc, retencion_monto, total_neto, iva, total: total_neto + iva }
}

/**
 * Aplica lo que el usuario editó sobre las líneas calculadas en el servidor.
 * Suma alzada: puede bajar el monto, no pasar del tope. Serie de precios: indica la
 * cantidad acumulada medida (no menor que la ya cobrada). Las líneas que no vienen quedan en 0.
 */
export function aplicarEdicion(
  modalidad: ModalidadContrato, lineas: LineaEP[],
  editadas: { partida_id: string | null; monto?: number | string | null; cantidad_actual?: number | string | null }[]
): { lineas: LineaEP[]; error?: string } {
  const porId = new Map(lineas.map(l => [l.partida_id, l]))
  const out: LineaEP[] = []
  for (const e of editadas) {
    const base = porId.get(e.partida_id ?? null)
    if (!base) return { lineas: [], error: 'Hay líneas que no pertenecen a esta obra o a este alcance' }
    if (modalidad === 'serie_precios') {
      const cant = n(e.cantidad_actual ?? base.cantidad_actual)
      if (cant < n(base.cantidad_anterior) - 1e-9) {
        return { lineas: [], error: `"${base.descripcion}": la cantidad acumulada no puede ser menor que la ya cobrada (${base.cantidad_anterior})` }
      }
      const presup = n(base.cantidad_presupuestada)
      const pct = (c: number) => presup > 0 ? r1(c / presup * 100) : 0
      out.push({
        ...base, cantidad_actual: cant,
        avance_actual: pct(cant), avance_periodo: r1(pct(cant) - n(base.avance_anterior)),
        monto: Math.round((cant - n(base.cantidad_anterior)) * n(base.precio_unitario)),
      })
    } else {
      const monto = Math.round(n(e.monto))
      if (monto < 0) return { lineas: [], error: `"${base.descripcion}": el monto no puede ser negativo` }
      if (monto > base.maximo) {
        return { lineas: [], error: `"${base.descripcion}": se pueden cobrar hasta ${base.maximo.toLocaleString('es-CL')}, según su avance` }
      }
      const pctPeriodo = base.valor_partida > 0 ? r1(monto / base.valor_partida * 100) : 0
      out.push({ ...base, monto, avance_periodo: pctPeriodo, avance_actual: r1(n(base.avance_anterior) + pctPeriodo) })
    }
  }
  return { lineas: out.filter(l => l.monto > 0) }
}

// lib/subcontratos.ts
// Estados de pago de subcontratos: funciones puras.
//
//   bruto         = valor del avance de este EP (acumulado − lo ya cobrado)
//   retencion     = bruto × % de retención
//   anticipo_desc = amortización proporcional al avance
//   neto          = bruto − retencion − anticipo_desc
//   Cuenta como gasto de obra el BRUTO de los EP aprobados o pagados: la retención
//   es plata que se debe, y el anticipo es adelanto de lo mismo.

export type ModalidadSubcontrato = 'suma_alzada' | 'precios_unitarios' | 'por_tiempo' | 'administracion'
export const MODALIDADES_SUBCONTRATO: { value: ModalidadSubcontrato; label: string; ayuda: string }[] = [
  { value: 'suma_alzada',       label: 'Suma alzada',            ayuda: 'Monto cerrado; cada estado de pago es un % de avance acumulado' },
  { value: 'precios_unitarios', label: 'Precios unitarios',      ayuda: 'Ítems con precio unitario; se paga la cantidad medida acumulada' },
  { value: 'por_tiempo',        label: 'Por hora o por día',     ayuda: 'Tarifa por hora o día; se paga el tiempo trabajado en el período' },
  { value: 'administracion',    label: 'Administración',         ayuda: 'Se paga el costo rendido con respaldo más un honorario %' },
]

export interface ItemSubcontrato {
  id: string
  descripcion: string
  unidad?: string | null
  cantidad: number
  precio_unitario: number
}

export interface Subcontrato {
  monto_contrato: number
  retencion_pct?: number | null
  anticipo?: number | null
  retencion_devuelta?: number | null
  modalidad?: ModalidadSubcontrato | string | null
  items?: ItemSubcontrato[] | null
  tarifa?: number | null
  unidad_tiempo?: 'hora' | 'dia' | string | null
  honorario_pct?: number | null
}

/** Monto de referencia del contrato: en precios unitarios, la suma de sus ítems. */
export function montoContratoSub(sub: Subcontrato): number {
  if (sub.modalidad === 'precios_unitarios' && Array.isArray(sub.items) && sub.items.length > 0) {
    return Math.round(sub.items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0))
  }
  return Number(sub.monto_contrato) || 0
}

export interface EPSubcontrato {
  numero?: number
  avance_acumulado: number
  cantidad?: number | null
  cantidades?: Record<string, number> | null
  costo?: number | null
  bruto: number
  retencion: number
  anticipo_desc: number
  neto: number
  estado?: string
}

export interface EntradaEPSub {
  /** Suma alzada: % acumulado. */
  avance_acumulado?: number | null
  /** Por tiempo: horas o días del período. */
  cantidad?: number | null
  /** Precios unitarios: cantidad medida ACUMULADA por ítem. */
  cantidades?: Record<string, number> | null
  /** Administración: costo rendido en el período. */
  costo?: number | null
}

type ResultadoEP = { error: string } | {
  bruto: number; retencion: number; anticipo_desc: number; neto: number; avance_acumulado: number
  cantidad?: number; cantidades?: Record<string, number>; costo?: number
}

/** Estado de pago de un subcontrato según su modalidad. */
export function calcularEPSub(sub: Subcontrato, previos: EPSubcontrato[], e: EntradaEPSub): ResultadoEP {
  const modalidad = (sub.modalidad || 'suma_alzada') as ModalidadSubcontrato
  if (modalidad === 'suma_alzada') return calcularEP(sub, previos, Number(e.avance_acumulado) || 0)

  let bruto = 0
  const extra: { cantidad?: number; cantidades?: Record<string, number>; costo?: number } = {}
  if (modalidad === 'por_tiempo') {
    const cant = Number(e.cantidad) || 0
    if (cant <= 0) return { error: `Indica las ${sub.unidad_tiempo === 'dia' ? 'jornadas' : 'horas'} del período` }
    bruto = Math.round(cant * (Number(sub.tarifa) || 0))
    extra.cantidad = cant
  } else if (modalidad === 'precios_unitarios') {
    const items = Array.isArray(sub.items) ? sub.items : []
    const anterior: Record<string, number> = {}
    for (const p of previos) for (const [k, v] of Object.entries(p.cantidades ?? {})) anterior[k] = Math.max(anterior[k] || 0, Number(v) || 0)
    const acum: Record<string, number> = {}
    for (const it of items) {
      const nueva = e.cantidades?.[it.id]
      const previa = anterior[it.id] || 0
      const cant = nueva == null || nueva === ('' as any) ? previa : Number(nueva)
      if (!(cant >= 0)) return { error: `"${it.descripcion}": cantidad inválida` }
      if (cant < previa - 1e-9) return { error: `"${it.descripcion}": la cantidad acumulada no puede bajar de ${previa}` }
      acum[it.id] = cant
      bruto += Math.round((cant - previa) * (Number(it.precio_unitario) || 0))
    }
    if (bruto <= 0) return { error: 'No hay cantidades nuevas que pagar' }
    extra.cantidades = acum
  } else {
    const costo = Math.round(Number(e.costo) || 0)
    if (costo <= 0) return { error: 'Indica el costo rendido del período' }
    bruto = costo + Math.round(costo * (Number(sub.honorario_pct) || 0) / 100)
    extra.costo = costo
  }

  const contrato = montoContratoSub(sub)
  const brutoPrevio = previos.reduce((s, p) => s + (Number(p.bruto) || 0), 0)
  const anticipo = Number(sub.anticipo) || 0
  const anticipoPrevio = previos.reduce((s, p) => s + (Number(p.anticipo_desc) || 0), 0)
  // El anticipo se amortiza en proporción a lo ejecutado sobre el contrato, sin pasar del saldo
  const anticipo_desc = contrato > 0
    ? Math.min(anticipo - anticipoPrevio, Math.max(0, Math.round(anticipo * Math.min(1, (brutoPrevio + bruto) / contrato)) - anticipoPrevio))
    : 0
  const retencion = Math.round(bruto * (Number(sub.retencion_pct) || 0) / 100)
  const avance_acumulado = contrato > 0 ? Math.round((brutoPrevio + bruto) / contrato * 10000) / 100 : 0
  return { bruto, retencion, anticipo_desc, neto: bruto - retencion - anticipo_desc, avance_acumulado, ...extra }
}

export function calcularEP(sub: Subcontrato, previos: EPSubcontrato[], avanceAcumulado: number) {
  const avance = Number(avanceAcumulado) || 0
  const ultimo = previos.reduce((m, e) => Math.max(m, Number(e.avance_acumulado) || 0), 0)
  if (avance <= 0 || avance > 100) return { error: 'El avance acumulado debe estar entre 0 y 100%' as const }
  if (avance <= ultimo) return { error: `El avance acumulado debe superar el ${ultimo}% del estado de pago anterior` }

  const contrato = Number(sub.monto_contrato) || 0
  const anticipo = Number(sub.anticipo) || 0
  const brutoPrevio = previos.reduce((s, e) => s + (Number(e.bruto) || 0), 0)
  const anticipoPrevio = previos.reduce((s, e) => s + (Number(e.anticipo_desc) || 0), 0)

  const bruto = Math.round(contrato * avance / 100) - brutoPrevio
  const retencion = Math.round(bruto * (Number(sub.retencion_pct) || 0) / 100)
  const anticipo_desc = Math.round(anticipo * avance / 100) - anticipoPrevio
  return { bruto, retencion, anticipo_desc, neto: bruto - retencion - anticipo_desc, avance_acumulado: avance }
}

export const epCuentaComoGasto = (ep: { estado?: string; factura_id?: string | null }) =>
  (ep.estado === 'aprobado' || ep.estado === 'pagado') && !ep.factura_id

export function resumenSubcontrato(sub: Subcontrato, eps: EPSubcontrato[]) {
  const vigentes = eps.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
  const pagados = eps.filter(e => e.estado === 'pagado')
  const suma = (filas: EPSubcontrato[], c: 'bruto' | 'retencion' | 'anticipo_desc' | 'neto') =>
    filas.reduce((s, e) => s + (Number(e[c]) || 0), 0)

  const ejecutado = suma(vigentes, 'bruto')
  const retenido = suma(vigentes, 'retencion')
  const devuelta = Number(sub.retencion_devuelta) || 0
  const contrato = montoContratoSub(sub)
  return {
    avance: vigentes.reduce((m, e) => Math.max(m, Number(e.avance_acumulado) || 0), 0),
    ejecutado,
    saldo_contrato: contrato - ejecutado,
    pagado: suma(pagados, 'neto'),
    por_pagar: suma(vigentes, 'neto') - suma(pagados, 'neto'),
    retenido,
    retencion_saldo: retenido - devuelta,
    anticipo_amortizado: suma(vigentes, 'anticipo_desc'),
    anticipo_saldo: (Number(sub.anticipo) || 0) - suma(vigentes, 'anticipo_desc'),
  }
}

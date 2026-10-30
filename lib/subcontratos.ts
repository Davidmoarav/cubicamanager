// lib/subcontratos.ts
// Estados de pago de subcontratos: funciones puras.
//
//   bruto         = valor del avance de este EP (acumulado − lo ya cobrado)
//   retencion     = bruto × % de retención
//   anticipo_desc = amortización proporcional al avance
//   neto          = bruto − retencion − anticipo_desc
//   Cuenta como gasto de obra el BRUTO de los EP aprobados o pagados: la retención
//   es plata que se debe, y el anticipo es adelanto de lo mismo.

export interface Subcontrato {
  monto_contrato: number
  retencion_pct?: number | null
  anticipo?: number | null
  retencion_devuelta?: number | null
}

export interface EPSubcontrato {
  numero?: number
  avance_acumulado: number
  bruto: number
  retencion: number
  anticipo_desc: number
  neto: number
  estado?: string
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
  const contrato = Number(sub.monto_contrato) || 0
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

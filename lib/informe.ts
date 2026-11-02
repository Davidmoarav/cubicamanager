// lib/informe.ts
// KPIs financieros de una obra: estados de pago, retenciones y mano de obra.
// Funciones puras, compartidas por el informe y la pestaña de pagos.

const BILLED = ['presentado', 'aprobado', 'pagado']

export interface ProyectoContrato {
  valor?: number | null          // con IVA; en UF si la obra se contrató en UF
  monto_contrato?: number | null // neto, en pesos
  moneda?: string | null
  valor_uf?: number | null
}

// El bruto de un estado de pago es neto: todo lo que se compara con él usa este valor
export function contratoNeto(p: ProyectoContrato): number {
  const monto = Number(p.monto_contrato) || 0
  if (monto > 0) return monto
  const valor = p.moneda === 'uf' ? (Number(p.valor) || 0) * (Number(p.valor_uf) || 0) : Number(p.valor) || 0
  return Math.round(valor / 1.19)
}

// Cobrado: bruto de los estados de pago pagados sobre el contrato, ambos netos
export function pctCobrado(eps: { estado?: string; bruto?: number | null }[], contrato: number): number {
  if (contrato <= 0) return 0
  const cobrado = eps.filter(e => e.estado === 'pagado').reduce((s, e) => s + (Number(e.bruto) || 0), 0)
  return Math.round((cobrado / contrato) * 1000) / 10
}

export function kpisProyecto(proyecto: ProyectoContrato, eps: any[], devs: any[], proy: any[]) {
  const billed = eps.filter(e => BILLED.includes(e.estado))
  const pagados = eps.filter(e => e.estado === 'pagado')

  const brutoAcum      = billed.reduce((s, e) => s + (e.bruto || 0), 0)
  const brutoCobrado   = pagados.reduce((s, e) => s + (e.bruto || 0), 0)
  const totalFacturado = billed.reduce((s, e) => s + (e.total || 0), 0)     // c/IVA
  const totalCobrado   = pagados.reduce((s, e) => s + (e.total || 0), 0)    // c/IVA

  const contrato = contratoNeto(proyecto)
  const avanceFinanciero = contrato > 0 ? (brutoAcum / contrato) * 100 : 0
  const saldoPorFacturar = Math.max(0, contrato - brutoAcum)

  // Retenciones (módulo 2)
  const epsValidos = eps.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
  const retDescontada = epsValidos.reduce((s, e) => s + (e.retencion_monto || 0), 0)
  const antAmortizado = epsValidos.reduce((s, e) => s + (e.anticipo_desc || 0), 0)
  const retDevuelta = devs.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (d.monto || 0), 0)
  const antDevuelto = devs.filter(d => d.tipo === 'anticipo').reduce((s, d) => s + (d.monto || 0), 0)

  // Mano de obra (módulo 3)
  const hoy = new Date().toISOString().slice(0, 7)
  let costoMoTotal = 0, finiquitos = 0, gastoPendienteMo = 0, dotActual = 0, costoMoActual = 0
  for (const r of proy) {
    const costoMes = (r.dotacion || 0) * (r.costo_unitario || 0)
    costoMoTotal += costoMes
    finiquitos += r.finiquito || 0
    if (r.mes >= hoy) gastoPendienteMo += costoMes + (r.finiquito || 0)
    if (r.mes === hoy) { dotActual = r.dotacion || 0; costoMoActual = costoMes }
  }
  if (!dotActual && proy.length) {
    const fut = proy.find(r => r.mes >= hoy) || proy[0]
    dotActual = fut.dotacion || 0
    costoMoActual = (fut.dotacion || 0) * (fut.costo_unitario || 0)
  }

  return {
    valor_contrato: contrato,
    n_estados: eps.length,
    bruto_acumulado: brutoAcum,
    bruto_cobrado: brutoCobrado,
    total_facturado: totalFacturado,
    total_cobrado: totalCobrado,
    avance_financiero_pct: Math.round(avanceFinanciero * 10) / 10,
    cobrado_pct: pctCobrado(eps, contrato),
    saldo_por_facturar: saldoPorFacturar,
    // retenciones
    retencion_acumulada: retDescontada,
    retencion_devuelta: retDevuelta,
    retencion_saldo: retDescontada - retDevuelta,
    anticipo_amortizado: antAmortizado,
    anticipo_devuelto: antDevuelto,
    anticipo_saldo: antAmortizado - antDevuelto,
    // mano de obra
    dotacion_actual: dotActual,
    costo_mo_mensual: costoMoActual,
    costo_mo_total: costoMoTotal + finiquitos,
    gasto_mo_pendiente: gastoPendienteMo,
  }
}

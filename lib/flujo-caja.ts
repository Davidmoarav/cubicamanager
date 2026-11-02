// lib/flujo-caja.ts
// Flujo de caja mensual de una obra, en neto (sin IVA): función pura.
//
//   Real (hasta el mes actual)
//     entradas = anticipo + estados de pago pagados + devoluciones de retención y anticipo
//     salidas  = gastos de obra y documentos de compra, en la fecha en que se registran
//   Proyección (desde el mes siguiente, hasta el término de la obra)
//     entradas = EP presentados o aprobados + lo que falta facturar, en partes iguales
//                + la retención por devolver, en el último mes
//     salidas  = proyección de mano de obra + el resto del presupuesto de costo, en partes iguales

import { netoConSigno, type DocCompra } from './costos'

export interface EntradaFlujo {
  proyecto: {
    inicio?: string | null
    fin?: string | null
    anticipo?: number | null
    valor?: number | null
    monto_contrato?: number | null
  }
  eps: {
    estado?: string; fecha?: string | null; bruto?: number | null; monto_pagar?: number | null
    retencion_monto?: number | null; anticipo_desc?: number | null
  }[]
  devoluciones: { tipo?: string; monto?: number | null; fecha?: string | null }[]
  gastos: { monto?: number | null; fecha?: string | null }[]
  docs: (DocCompra & { emision?: string | null })[]
  proyeccionMO: { mes?: string; dotacion?: number | null; costo_unitario?: number | null; finiquito?: number | null }[]
  presupuestoCosto: number
  gastoReal: number
  hoy: string
}

export interface FilaFlujo {
  mes: string
  entradas: number
  salidas: number
  neto: number
  saldo: number
  proyectado: boolean
}

const mesDe = (fecha?: string | null) => (fecha ? String(fecha).slice(0, 7) : '')

export function mesSiguiente(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let m = desde; m <= hasta; m = mesSiguiente(m)) out.push(m)
  return out
}

// Reparte un monto en n partes enteras que suman exacto
function enPartes(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0))
}

export function calcularFlujoCaja(e: EntradaFlujo) {
  const mesActual = mesDe(e.hoy)
  const entradas: Record<string, number> = {}
  const salidas: Record<string, number> = {}
  const sumar = (t: Record<string, number>, mes: string, monto: number) => {
    if (mes && monto) t[mes] = (t[mes] || 0) + monto
  }

  // ── Real ──
  const anticipo = Number(e.proyecto.anticipo) || 0
  sumar(entradas, mesDe(e.proyecto.inicio) || mesActual, anticipo)
  for (const ep of e.eps) {
    if (ep.estado === 'pagado') sumar(entradas, mesDe(ep.fecha) || mesActual, Number(ep.monto_pagar) || 0)
  }
  for (const d of e.devoluciones) sumar(entradas, mesDe(d.fecha) || mesActual, Number(d.monto) || 0)
  for (const g of e.gastos) sumar(salidas, mesDe(g.fecha) || mesActual, Number(g.monto) || 0)
  for (const d of e.docs) sumar(salidas, mesDe(d.emision) || mesActual, netoConSigno(d))

  // ── Lo que falta por entrar ──
  const contrato = Number(e.proyecto.monto_contrato) || Math.round((Number(e.proyecto.valor) || 0) / 1.19)
  const facturables = e.eps.filter(ep => ep.estado && ep.estado !== 'borrador')
  const validos = e.eps.filter(ep => ep.estado === 'aprobado' || ep.estado === 'pagado')
  const facturado = facturables.reduce((s, ep) => s + (Number(ep.bruto) || 0), 0)
  const amortizado = validos.reduce((s, ep) => s + (Number(ep.anticipo_desc) || 0), 0)
  const retenido = validos.reduce((s, ep) => s + (Number(ep.retencion_monto) || 0), 0)
  const devuelto = e.devoluciones.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (Number(d.monto) || 0), 0)
  const porFacturar = Math.max(0, contrato - facturado - Math.max(0, anticipo - amortizado))
  const retencionSaldo = Math.max(0, retenido - devuelto)
  const porCobrarEP = e.eps
    .filter(ep => ep.estado === 'presentado' || ep.estado === 'aprobado')
    .reduce((s, ep) => s + (Number(ep.monto_pagar) || 0), 0)

  // ── Lo que falta por salir ──
  const moFutura = e.proyeccionMO.filter(r => (r.mes || '') > mesActual)
  const costoMoFutura = (r: EntradaFlujo['proyeccionMO'][number]) =>
    (Number(r.dotacion) || 0) * (Number(r.costo_unitario) || 0) + (Number(r.finiquito) || 0)
  const totalMoFutura = moFutura.reduce((s, r) => s + costoMoFutura(r), 0)
  const restoCosto = Math.max(0, Math.round(e.presupuestoCosto - e.gastoReal - totalMoFutura))

  // ── Horizonte ──
  const siguiente = mesSiguiente(mesActual)
  const mesFin = mesDe(e.proyecto.fin)
  const futuros = mesFin && mesFin >= siguiente ? mesesEntre(siguiente, mesFin) : []
  const hayPendiente = porFacturar + porCobrarEP + retencionSaldo + restoCosto > 0

  if (futuros.length > 0) {
    sumar(entradas, futuros[0], porCobrarEP)
    enPartes(porFacturar, futuros.length).forEach((m, i) => sumar(entradas, futuros[i], m))
    sumar(entradas, futuros[futuros.length - 1], retencionSaldo)
    enPartes(restoCosto, futuros.length).forEach((m, i) => sumar(salidas, futuros[i], m))
    for (const r of moFutura) {
      // Un mes proyectado después del término de la obra se cobra al último mes
      const mes = futuros.includes(r.mes as string) ? (r.mes as string) : futuros[futuros.length - 1]
      sumar(salidas, mes, Math.round(costoMoFutura(r)))
    }
  }

  // ── Filas continuas, mes a mes ──
  const conDatos = [...Object.keys(entradas), ...Object.keys(salidas)].sort()
  if (conDatos.length === 0) {
    return { filas: [] as FilaFlujo[], resumen: resumenVacio(hayPendiente) }
  }
  const primero = conDatos[0]
  const ultimo = conDatos[conDatos.length - 1]
  let saldo = 0
  const filas: FilaFlujo[] = mesesEntre(primero, ultimo > mesActual ? ultimo : mesActual).map(mes => {
    const ent = Math.round(entradas[mes] || 0)
    const sal = Math.round(salidas[mes] || 0)
    saldo += ent - sal
    return { mes, entradas: ent, salidas: sal, neto: ent - sal, saldo, proyectado: mes > mesActual }
  })

  const reales = filas.filter(f => !f.proyectado)
  const proyectadas = filas.filter(f => f.proyectado)
  const minima = filas.reduce((m, f) => (f.saldo < m.saldo ? f : m), filas[0])
  const suma = (t: FilaFlujo[], c: 'entradas' | 'salidas') => t.reduce((s, f) => s + f[c], 0)
  return {
    filas,
    resumen: {
      entradas_reales: suma(reales, 'entradas'),
      salidas_reales: suma(reales, 'salidas'),
      saldo_actual: reales.length > 0 ? reales[reales.length - 1].saldo : 0,
      entradas_proyectadas: suma(proyectadas, 'entradas'),
      salidas_proyectadas: suma(proyectadas, 'salidas'),
      saldo_final: filas[filas.length - 1].saldo,
      saldo_minimo: minima.saldo,
      mes_saldo_minimo: minima.mes,
      // Queda plata por entrar o salir, pero la obra no tiene meses futuros donde ponerla
      sin_horizonte: futuros.length === 0 && hayPendiente,
    },
  }
}

function resumenVacio(sinHorizonte: boolean) {
  return {
    entradas_reales: 0, salidas_reales: 0, saldo_actual: 0,
    entradas_proyectadas: 0, salidas_proyectadas: 0, saldo_final: 0,
    saldo_minimo: 0, mes_saldo_minimo: null as string | null, sin_horizonte: sinHorizonte,
  }
}

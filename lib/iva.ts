// lib/iva.ts
// Cálculo puro del resumen de IVA por período (testeable, sin BD).
//
//   IVA Débito (ventas)   = IVA facturas venta + IVA notas débito venta − IVA notas crédito venta
//   IVA Crédito (compras) = IVA facturas compra + IVA notas débito compra − IVA notas crédito compra
//   IVA determinado = Débito − Crédito
//   Remanente: si el crédito supera al débito, el excedente se arrastra al mes siguiente.
//   PPM = tasa% × ventas netas del mes (se paga siempre, aunque el IVA quede en 0).

export interface FacturaParaIVA {
  periodo?: string | null
  emision?: string | null
  tipo?: string | null        // 'venta' | 'compra'
  doc_tipo?: string | null    // 'factura' | 'nota_credito' | 'nota_debito' | 'boleta'
  iva?: number | null
  neto?: number | null
}

export interface PPMConfigPorPeriodo {
  [periodo: string]: { regimen: string; tasa: number }
}

export interface ResumenPeriodoIVA {
  periodo: string
  iva_debito: number
  iva_credito: number
  neto_ventas: number
  neto_compras: number
  n_ventas: number
  n_compras: number
  iva_nc_venta: number
  iva_nd_venta: number
  iva_nc_compra: number
  iva_nd_compra: number
  iva_determinado: number
  remanente_usado: number
  remanente: number
  iva_a_pagar: number
  ppm_tasa: number
  ppm_regimen: string
  ppm: number
  total_a_pagar: number
}

export function calcularResumenIVA(
  facturas: FacturaParaIVA[],
  ppmPorPeriodo: PPMConfigPorPeriodo = {}
): ResumenPeriodoIVA[] {
  type Acc = Omit<ResumenPeriodoIVA,
    'iva_determinado' | 'remanente_usado' | 'remanente' | 'iva_a_pagar' | 'ppm_tasa' | 'ppm_regimen' | 'ppm' | 'total_a_pagar'>

  const periodos: Record<string, Acc> = {}

  for (const f of facturas) {
    const per = f.periodo || (f.emision ? String(f.emision).slice(0, 7) : 'sin-periodo')
    if (!periodos[per]) {
      periodos[per] = {
        periodo: per, iva_debito: 0, iva_credito: 0,
        neto_ventas: 0, neto_compras: 0, n_ventas: 0, n_compras: 0,
        iva_nc_venta: 0, iva_nd_venta: 0, iva_nc_compra: 0, iva_nd_compra: 0,
      }
    }
    const p = periodos[per]
    const iva = Number(f.iva) || 0
    const neto = Number(f.neto) || 0
    const docTipo = f.doc_tipo || 'factura'
    const esVenta = f.tipo !== 'compra'

    if (docTipo === 'nota_credito') {
      if (esVenta) { p.iva_debito -= iva; p.iva_nc_venta += iva }
      else         { p.iva_credito -= iva; p.iva_nc_compra += iva }
    } else if (docTipo === 'nota_debito') {
      if (esVenta) { p.iva_debito += iva; p.iva_nd_venta += iva }
      else         { p.iva_credito += iva; p.iva_nd_compra += iva }
    } else {
      if (esVenta) { p.iva_debito += iva; p.neto_ventas += neto; p.n_ventas += 1 }
      else         { p.iva_credito += iva; p.neto_compras += neto; p.n_compras += 1 }
    }
  }

  // Orden cronológico para arrastrar el remanente de crédito fiscal
  let remanenteAcum = 0
  return Object.values(periodos)
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map(p => {
      const cfg = ppmPorPeriodo[p.periodo] ?? { regimen: 'pro_pyme_general', tasa: 0 }
      const ppm = Math.round(p.neto_ventas * (cfg.tasa / 100))

      const ivaDeterminado = p.iva_debito - p.iva_credito
      const posicion = ivaDeterminado - remanenteAcum
      let iva_a_pagar: number
      let remanente: number
      if (posicion > 0) { iva_a_pagar = posicion; remanente = 0 }
      else              { iva_a_pagar = 0;        remanente = -posicion }

      const remanente_usado = remanenteAcum > 0
        ? Math.min(remanenteAcum, Math.max(0, ivaDeterminado))
        : 0
      remanenteAcum = remanente

      return {
        ...p,
        iva_determinado: ivaDeterminado,
        remanente_usado,
        remanente,
        iva_a_pagar,
        ppm_tasa: cfg.tasa,
        ppm_regimen: cfg.regimen,
        ppm,
        total_a_pagar: iva_a_pagar + ppm,
      }
    })
    .sort((a, b) => b.periodo.localeCompare(a.periodo))   // descendente para mostrar
}

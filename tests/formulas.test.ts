// tests/formulas.test.ts
// Tests de las fórmulas críticas (funciones puras).
// Correr con: npm test
import { describe, it, expect } from 'vitest'
import { impuestoUnico, calcularLiquidacion, REM_DEFAULTS, type EmpleadoPrevisional } from '../types/finanzas'
import { calcularResumenIVA } from '../lib/iva'

const UTM = 68000

// ─── Impuesto Único de Segunda Categoría ──────────────────
describe('impuestoUnico', () => {
  it('exento hasta 13,5 UTM', () => {
    expect(impuestoUnico(13.5 * UTM, UTM)).toBe(0)
    expect(impuestoUnico(500_000, UTM)).toBe(0)
    expect(impuestoUnico(0, UTM)).toBe(0)
    expect(impuestoUnico(-100, UTM)).toBe(0)
  })

  it('es continuo en los bordes de cada tramo (sin saltos)', () => {
    // En el límite entre tramos, ambas fórmulas deben dar (casi) lo mismo
    const bordes = [13.5, 30, 50, 70, 90, 120, 310]
    for (const b of bordes) {
      const abajo  = impuestoUnico(b * UTM - 1, UTM)
      const arriba = impuestoUnico(b * UTM + 1, UTM)
      expect(Math.abs(arriba - abajo)).toBeLessThan(5) // solo el redondeo
    }
  })

  it('tramo 2: 4% con rebaja de 0,54 UTM', () => {
    const base = 20 * UTM
    expect(impuestoUnico(base, UTM)).toBe(Math.round((20 * 0.04 - 0.54) * UTM))
  })

  it('tramo máximo: 40% con rebaja de 38,82 UTM', () => {
    const base = 400 * UTM
    expect(impuestoUnico(base, UTM)).toBe(Math.round((400 * 0.40 - 38.82) * UTM))
  })
})

// ─── Liquidación de sueldo ────────────────────────────────
const empleadoBase: EmpleadoPrevisional = {
  id: 'x', nombre: 'Test', sueldo: 800_000, horas_extra: 0,
  estado: 'activo', tipo: 'planta', contrato_tipo: 'indefinido',
  salud_sistema: 'Fonasa',
}

describe('calcularLiquidacion', () => {
  it('caso base: gratificación 25% topada, cotizaciones sobre imponible', () => {
    const r = calcularLiquidacion(empleadoBase, REM_DEFAULTS)
    // Gratificación: 25% de 800.000 = 200.000 (< tope 209.396)
    expect(r.gratificacion).toBe(200_000)
    const imponible = 1_000_000
    expect(r.total_imponible).toBe(imponible)
    expect(r.desc_afp).toBe(Math.round(imponible * 11.44 / 100))
    expect(r.desc_salud).toBe(Math.round(imponible * 7 / 100))
    expect(r.desc_afc).toBe(Math.round(imponible * 0.6 / 100))
    // Líquido = haberes − descuentos, cuadratura exacta
    expect(r.liquido_pagar).toBe(r.total_haberes - r.total_descuentos)
  })

  it('horas extra usan el factor legal DT según jornada', () => {
    const emp = { ...empleadoBase, horas_extra: 10 }
    const r42 = calcularLiquidacion(emp, { ...REM_DEFAULTS, jornada_semanal: 42 })
    const r45 = calcularLiquidacion(emp, { ...REM_DEFAULTS, jornada_semanal: 45 })
    expect(r42.horas_extra_monto).toBe(Math.round(800_000 * (28 / (30 * 4 * 42)) * 1.5 * 10))
    expect(r45.horas_extra_monto).toBe(Math.round(800_000 * (28 / (30 * 4 * 45)) * 1.5 * 10))
    expect(r42.horas_extra_monto).toBeGreaterThan(r45.horas_extra_monto) // menos jornada → hora más cara
  })

  it('AFC solo con contrato indefinido', () => {
    const plazoFijo = calcularLiquidacion({ ...empleadoBase, contrato_tipo: 'plazo_fijo' }, REM_DEFAULTS)
    expect(plazoFijo.desc_afc).toBe(0)
  })

  it('AFC usa su tope propio (131,9 UF), no el de AFP (87,8 UF)', () => {
    // Sueldo altísimo: AFP/salud topan en 87,8 UF; AFC en 131,9 UF
    const rico = calcularLiquidacion({ ...empleadoBase, sueldo: 10_000_000 }, REM_DEFAULTS)
    const topeAfp = Math.round(87.8 * REM_DEFAULTS.uf_valor)
    const topeAfc = Math.round(131.9 * REM_DEFAULTS.uf_valor)
    expect(rico.total_imponible).toBe(topeAfp)
    expect(rico.desc_afp).toBe(Math.round(topeAfp * 11.44 / 100))
    // imponible bruto (10M + grat topada) > tope AFC → AFC cotiza por el tope AFC
    expect(rico.desc_afc).toBe(Math.round(topeAfc * 0.6 / 100))
  })

  it('Isapre: se descuenta el mayor entre el plan pactado y el 7% legal', () => {
    const planCaro = calcularLiquidacion(
      { ...empleadoBase, salud_sistema: 'Isapre', salud_uf: 5 },  // 5 UF = 195.000 > 7% de 1M
      REM_DEFAULTS
    )
    expect(planCaro.desc_salud).toBe(Math.round(5 * REM_DEFAULTS.uf_valor))
    const planBarato = calcularLiquidacion(
      { ...empleadoBase, salud_sistema: 'Isapre', salud_uf: 1 },  // 1 UF < 7% de 1M
      REM_DEFAULTS
    )
    expect(planBarato.desc_salud).toBe(Math.round(1_000_000 * 0.07))
  })

  it('el impuesto único se calcula sobre bruto − cotizaciones', () => {
    const r = calcularLiquidacion({ ...empleadoBase, sueldo: 2_000_000 }, REM_DEFAULTS)
    const esperadoBase = (2_000_000 + Math.min(500_000, REM_DEFAULTS.gratificacion_tope))
    const baseTrib = esperadoBase - r.desc_afp - r.desc_salud - r.desc_afc
    expect(r.desc_impuesto).toBe(impuestoUnico(baseTrib, REM_DEFAULTS.utm_valor))
  })
})

// ─── IVA con remanente y PPM ──────────────────────────────
describe('calcularResumenIVA', () => {
  it('débito − crédito del mes, con PPM sobre ventas netas', () => {
    const r = calcularResumenIVA([
      { periodo: '2026-01', tipo: 'venta',  iva: 190_000, neto: 1_000_000 },
      { periodo: '2026-01', tipo: 'compra', iva: 95_000,  neto: 500_000 },
    ], { '2026-01': { regimen: 'pro_pyme_general', tasa: 0.25 } })

    const p = r[0]
    expect(p.iva_determinado).toBe(95_000)
    expect(p.iva_a_pagar).toBe(95_000)
    expect(p.ppm).toBe(Math.round(1_000_000 * 0.0025))
    expect(p.total_a_pagar).toBe(95_000 + 2_500)
  })

  it('el remanente de crédito se arrastra al mes siguiente (nunca IVA negativo)', () => {
    const r = calcularResumenIVA([
      { periodo: '2026-01', tipo: 'compra', iva: 300_000, neto: 1_500_000 },  // mes 1: puro crédito
      { periodo: '2026-02', tipo: 'venta',  iva: 190_000, neto: 1_000_000 },  // mes 2: débito 190k
    ])
    const ene = r.find(x => x.periodo === '2026-01')!
    const feb = r.find(x => x.periodo === '2026-02')!
    expect(ene.iva_a_pagar).toBe(0)
    expect(ene.remanente).toBe(300_000)
    expect(feb.remanente_usado).toBe(190_000)
    expect(feb.iva_a_pagar).toBe(0)
    expect(feb.remanente).toBe(110_000)   // 300k − 190k sigue al mes 3
  })

  it('notas de crédito de venta restan débito; de compra restan crédito', () => {
    const r = calcularResumenIVA([
      { periodo: '2026-03', tipo: 'venta',  iva: 190_000, neto: 1_000_000 },
      { periodo: '2026-03', tipo: 'venta',  doc_tipo: 'nota_credito', iva: 19_000 },
      { periodo: '2026-03', tipo: 'compra', iva: 57_000, neto: 300_000 },
      { periodo: '2026-03', tipo: 'compra', doc_tipo: 'nota_credito', iva: 9_500 },
    ])
    const p = r[0]
    expect(p.iva_debito).toBe(171_000)    // 190k − 19k
    expect(p.iva_credito).toBe(47_500)    // 57k − 9,5k
    expect(p.iva_a_pagar).toBe(123_500)
  })

  it('el PPM se paga aunque el IVA quede en cero por remanente', () => {
    const r = calcularResumenIVA([
      { periodo: '2026-01', tipo: 'compra', iva: 500_000, neto: 2_000_000 },
      { periodo: '2026-02', tipo: 'venta',  iva: 190_000, neto: 1_000_000 },
    ], { '2026-02': { regimen: 'pro_pyme_general', tasa: 1 } })
    const feb = r.find(x => x.periodo === '2026-02')!
    expect(feb.iva_a_pagar).toBe(0)
    expect(feb.ppm).toBe(10_000)
    expect(feb.total_a_pagar).toBe(10_000)
  })
})

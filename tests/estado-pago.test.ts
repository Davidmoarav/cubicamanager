// Estado de pago por modalidad de contrato.
import { describe, it, expect } from 'vitest'
import { aplicarEdicion, cascadaEP, lineasSeriePrecios, lineasSumaAlzada } from '../lib/estado-pago'

const programa = [
  { id: 'V1', parent_id: null, descripcion: 'Vivienda Rosa' },
  { id: 'V1a', parent_id: 'V1', descripcion: 'EIFS', unidad: 'm2', cantidad: 100, precio_unitario: 10000, avance: 50 },
  { id: 'V2', parent_id: null, descripcion: 'Vivienda Ana' },
  { id: 'V2a', parent_id: 'V2', descripcion: 'EIFS', unidad: 'm2', cantidad: 100, precio_unitario: 10000, avance: 100 },
]

describe('suma alzada', () => {
  it('una línea por vivienda con su valor y avance', () => {
    const l = lineasSumaAlzada(programa, [])
    expect(l.map(x => [x.partida_id, x.valor_partida, x.monto])).toEqual([['V1', 1000000, 500000], ['V2', 1000000, 1000000]])
  })
  it('descuenta lo ya cobrado en monto, aunque se haya cobrado menos de lo sugerido', () => {
    const l = lineasSumaAlzada(programa, [{ partida_id: 'V1', monto: 200000 }])
    expect(l[0]).toMatchObject({ avance_anterior: 20, avance_actual: 50, monto: 300000, maximo: 300000 })
  })
  it('lo cobrado a una partida cuenta para su vivienda', () => {
    expect(lineasSumaAlzada(programa, [{ partida_id: 'V2a', monto: 1000000 }])[1].monto).toBe(0)
  })
  it('alcance: solo las viviendas pedidas', () => {
    expect(lineasSumaAlzada(programa, [], ['V2']).map(x => x.partida_id)).toEqual(['V2'])
  })
  it('se puede cobrar menos, no más que el avance', () => {
    const l = lineasSumaAlzada(programa, [])
    expect(aplicarEdicion('suma_alzada', l, [{ partida_id: 'V1', monto: 100000 }]).lineas[0]).toMatchObject({ monto: 100000, avance_periodo: 10 })
    expect(aplicarEdicion('suma_alzada', l, [{ partida_id: 'V1', monto: 600000 }]).error).toMatch(/hasta/)
    expect(aplicarEdicion('suma_alzada', l, [{ partida_id: 'X', monto: 1 }]).error).toMatch(/no pertenecen/)
  })
  it('líneas en cero no se guardan', () => {
    const l = lineasSumaAlzada(programa, [])
    expect(aplicarEdicion('suma_alzada', l, [{ partida_id: 'V1', monto: 0 }, { partida_id: 'V2', monto: 5 }]).lineas.map(x => x.partida_id)).toEqual(['V2'])
  })
})

describe('serie de precios', () => {
  it('una línea por partida hoja, sugerida desde el avance', () => {
    const l = lineasSeriePrecios(programa, [])
    expect(l.map(x => [x.partida_id, x.cantidad_actual, x.monto])).toEqual([['V1a', 50, 500000], ['V2a', 100, 1000000]])
  })
  it('se cobra lo medido, aunque pase de lo presupuestado', () => {
    const l = lineasSeriePrecios(programa, [{ partida_id: 'V2a', cantidad_actual: 100, monto: 1000000 }])
    expect(l[1]).toMatchObject({ cantidad_anterior: 100, monto: 0 })
    const r = aplicarEdicion('serie_precios', l, [{ partida_id: 'V2a', cantidad_actual: 112 }])
    expect(r.lineas[0]).toMatchObject({ monto: 120000, avance_actual: 112 })
  })
  it('no deja bajar de lo ya cobrado', () => {
    const l = lineasSeriePrecios(programa, [{ partida_id: 'V1a', cantidad_actual: 40, monto: 400000 }])
    expect(aplicarEdicion('serie_precios', l, [{ partida_id: 'V1a', cantidad_actual: 30 }]).error).toMatch(/menor/)
  })
  it('si antes se cobró por monto, parte de ese monto', () => {
    expect(lineasSeriePrecios(programa, [{ partida_id: 'V1a', monto: 300000 }])[0]).toMatchObject({ cantidad_anterior: 30, monto: 200000 })
  })
})

describe('cascada', () => {
  it('suma alzada: sin honorario', () => {
    expect(cascadaEP(1000000, { anticipo_pct: 10, retencion_pct: 5, multas: 10000 })).toEqual({
      avance_obra: 1000000, honorario_monto: 0, bruto: 1000000, anticipo_desc: 100000, retencion_monto: 50000,
      total_neto: 840000, iva: 159600, total: 999600,
    })
  })
  it('administración: costo + honorario', () => {
    const c = cascadaEP(2000000, { honorario_pct: 12 })
    expect(c).toMatchObject({ honorario_monto: 240000, bruto: 2240000, total: 2665600 })
  })
})

// tests/privacidad-sueldos.test.ts
// Lo que ve el jefe de obra de la mano de obra no permite sacar el sueldo de nadie.
import { describe, it, expect } from 'vitest'
import { ocultarSueldos } from '../lib/imputacion-sueldos'

const sueldo = (liq: string, monto: number, partida: string | null, fecha = '2026-10-01', obra = 'p1') =>
  ({ id: `${liq}-${partida}-${fecha}`, proyecto_id: obra, partida_id: partida, fecha, liquidacion_id: liq, monto, descripcion: `Sueldo ${liq}` })

describe('mano de obra para el jefe de obra', () => {
  it('con menos de 3 personas en el mes no muestra ni suma el monto', () => {
    const r = ocultarSueldos([sueldo('a', 900000, 'x'), sueldo('b', 700000, 'x')])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ monto: 0, reservado: true, partida_id: null })
    expect(JSON.stringify(r)).not.toContain('900000')
  })
  it('una sola persona tampoco se puede deducir', () => {
    const r = ocultarSueldos([sueldo('a', 900000, 'x'), sueldo('a', 100000, 'y')])
    expect(r.reduce((s, g: any) => s + g.monto, 0)).toBe(0)
  })
  it('con 3 o más por partida, el detalle por partida', () => {
    const r = ocultarSueldos([
      sueldo('a', 1, 'x'), sueldo('b', 2, 'x'), sueldo('c', 3, 'x'),
      sueldo('a', 10, 'y'), sueldo('b', 20, 'y'), sueldo('c', 30, 'y'),
    ])
    expect(r.map((g: any) => [g.partida_id, g.monto]).sort()).toEqual([['x', 6], ['y', 60]])
  })
  it('si una partida tiene menos de 3, el mes va en una sola línea', () => {
    const r = ocultarSueldos([
      sueldo('a', 1, 'x'), sueldo('b', 2, 'x'), sueldo('c', 3, 'x'),
      sueldo('a', 10, 'y'),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ partida_id: null, monto: 16 })
  })
  it('cada obra y cada mes se agrupan por separado', () => {
    const r = ocultarSueldos([
      sueldo('a', 1, null), sueldo('b', 1, null), sueldo('c', 1, null),
      sueldo('a', 5, null, '2026-11-01'),
      sueldo('d', 7, null, '2026-10-01', 'p2'),
    ])
    expect(r.filter((g: any) => g.reservado)).toHaveLength(2)
    expect(r.find((g: any) => !g.reservado)).toMatchObject({ proyecto_id: 'p1', monto: 3 })
  })
  it('nunca entrega nombres ni descripciones de liquidaciones', () => {
    const r = ocultarSueldos([sueldo('a', 1, 'x'), sueldo('b', 2, 'x'), sueldo('c', 3, 'x')])
    expect(r.every((g: any) => !g.liquidacion_id && !String(g.descripcion).includes('Sueldo'))).toBe(true)
  })
  it('los demás gastos pasan sin cambios', () => {
    const material = { id: 'm', proyecto_id: 'p1', fecha: '2026-10-05', monto: 5000, liquidacion_id: null }
    expect(ocultarSueldos([material])).toEqual([material])
  })
})

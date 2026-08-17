// tests/minvu.test.ts
// El itemizado MINVU/DOM: numeración jerárquica, subtotales por grupo
// y cuadratura NETO + IVA = TOTAL.
import { describe, it, expect } from 'vitest'
import { filasMINVU, type PartidaMin } from '../lib/minvu'

const PARTIDAS: PartidaMin[] = [
  { id: 'g1', parent_id: null, orden: 0, descripcion: 'Albañilería', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p1', parent_id: 'g1', orden: 1, descripcion: 'Porcelanato 60×60', unidad: 'm²', cantidad: 10, precio_unitario: 25000 },
  { id: 'p2', parent_id: 'g1', orden: 2, descripcion: 'Adhesivo saco 25kg', unidad: 'saco', cantidad: 5, precio_unitario: 14000 },
  { id: 'g2', parent_id: null, orden: 3, descripcion: 'Mano de obra', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p3', parent_id: 'g2', orden: 4, descripcion: 'Maestro', unidad: 'día', cantidad: 4, precio_unitario: 65000 },
]
// g1 = 250.000 + 70.000 = 320.000 · g2 = 260.000 · neto 580.000 · IVA 110.200

describe('filasMINVU', () => {
  const filas = filasMINVU('Baño Las Condes', PARTIDAS, '01-08-2026')

  it('numera grupos 1..n y hojas n.m', () => {
    const g1 = filas.find(f => f[1] === 'ALBAÑILERÍA')!
    const p1 = filas.find(f => String(f[1]).includes('Porcelanato'))!
    const g2 = filas.find(f => f[1] === 'MANO DE OBRA')!
    expect(g1[0]).toBe('1')
    expect(p1[0]).toBe('1.1')
    expect(g2[0]).toBe('2')
  })

  it('calcula subtotal del grupo desde sus hojas', () => {
    const g1 = filas.find(f => f[1] === 'ALBAÑILERÍA')!
    expect(g1[5]).toBe(320000)
  })

  it('cuadra NETO + IVA = TOTAL', () => {
    const neto = filas.find(f => f[1] === 'COSTO DIRECTO (NETO)')!
    const iva = filas.find(f => String(f[1]).startsWith('IVA'))!
    const total = filas.find(f => f[1] === 'TOTAL PRESUPUESTO')!
    expect(neto[5]).toBe(580000)
    expect(iva[5]).toBe(110200)
    expect(total[5]).toBe(690200)
    expect(Number(neto[5]) + Number(iva[5])).toBe(total[5])
  })

  it('hoja suelta sin grupo también se numera', () => {
    const conSuelta = filasMINVU('X', [
      ...PARTIDAS,
      { id: 'p9', parent_id: null, orden: 9, descripcion: 'Flete', unidad: 'gl', cantidad: 1, precio_unitario: 30000 },
    ])
    const flete = conSuelta.find(f => f[1] === 'Flete')!
    expect(flete[0]).toBe('3')
    expect(flete[5]).toBe(30000)
  })

  it('anidamiento de 3 niveles numera n.m.k', () => {
    const tres = filasMINVU('X', [
      { id: 'a', parent_id: null, orden: 0, descripcion: 'Obra gruesa', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
      { id: 'b', parent_id: 'a', orden: 1, descripcion: 'Radier', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
      { id: 'c', parent_id: 'b', orden: 2, descripcion: 'Hormigón G25', unidad: 'm³', cantidad: 3, precio_unitario: 95000 },
    ])
    const horm = tres.find(f => String(f[1]).includes('Hormigón'))!
    expect(horm[0]).toBe('1.1.1')
    const radier = tres.find(f => f[1] === 'RADIER')!
    expect(radier[5]).toBe(285000)
  })
})

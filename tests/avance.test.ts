// Avance ponderado del árbol de partidas: obra única y programa con viviendas.
import { describe, it, expect } from 'vitest'
import { armarArbol, calcularAvances } from '../lib/avance'

describe('obra única (partidas planas y capítulos)', () => {
  const partidas = [
    { id: 'A', parent_id: null, cantidad: 10, precio_unitario: 100, avance: 100 },  // 1.000
    { id: 'B', parent_id: null, cantidad: 1, precio_unitario: 3000, avance: 0 },    // 3.000
  ]
  it('pondera por valor, no promedia', () => {
    expect(calcularAvances(partidas).avanceProyecto).toBe(25)
  })
  it('sin partidas la obra queda en 0', () => {
    expect(calcularAvances([])).toEqual({ cambios: [], avanceProyecto: 0 })
  })
})

describe('programa con viviendas (beneficiario → partidas)', () => {
  // El grupo no lleva cantidad ni precio: su valor es la suma de sus partidas
  const partidas = [
    { id: 'V1', parent_id: null, cantidad: 0, precio_unitario: 0, avance: 0 },
    { id: 'V1a', parent_id: 'V1', cantidad: 50, precio_unitario: 1000, avance: 100 }, // 50.000
    { id: 'V1b', parent_id: 'V1', cantidad: 1, precio_unitario: 50000, avance: 0 },   // 50.000
    { id: 'V2', parent_id: null, cantidad: 0, precio_unitario: 0, avance: 0 },
    { id: 'V2a', parent_id: 'V2', cantidad: 1, precio_unitario: 100000, avance: 100 },
  ]
  const arbol = armarArbol(partidas)

  it('el valor de la vivienda es la suma de sus partidas', () => {
    expect(arbol.valor('V1')).toBe(100000)
    expect(arbol.valor('V2')).toBe(100000)
  })
  it('avance por vivienda y de la obra', () => {
    expect(arbol.avance('V1')).toBe(50)
    expect(arbol.avance('V2')).toBe(100)
    const r = calcularAvances(partidas)
    expect(r.avanceProyecto).toBe(75)
    expect(r.cambios).toEqual([{ id: 'V1', avance: 50 }, { id: 'V2', avance: 100 }])
  })
  it('no reescribe los grupos que ya están al día', () => {
    const alDia = partidas.map(p => p.id === 'V1' ? { ...p, avance: 50 } : p.id === 'V2' ? { ...p, avance: 100 } : p)
    expect(calcularAvances(alDia).cambios).toEqual([])
  })
  it('subárbol de una vivienda', () => {
    expect(arbol.subarbol('V1').map(p => p.id).sort()).toEqual(['V1', 'V1a', 'V1b'])
  })
})

describe('tres niveles y casos borde', () => {
  it('propaga a cualquier profundidad', () => {
    const r = calcularAvances([
      { id: 'G', parent_id: null },
      { id: 'S', parent_id: 'G' },
      { id: 'H1', parent_id: 'S', cantidad: 1, precio_unitario: 100, avance: 40 },
      { id: 'H2', parent_id: 'S', cantidad: 3, precio_unitario: 100, avance: 80 },
    ])
    expect(r.avanceProyecto).toBe(70)
    expect(r.cambios).toEqual([{ id: 'G', avance: 70 }, { id: 'S', avance: 70 }])
  })
  it('hijos sin valor: promedio simple', () => {
    const arbol = armarArbol([
      { id: 'G', parent_id: null },
      { id: 'a', parent_id: 'G', avance: 100 },
      { id: 'b', parent_id: 'G', avance: 0 },
    ])
    expect(arbol.avance('G')).toBe(50)
  })
  it('3.000 partidas se calculan sin demora', () => {
    const muchas: any[] = []
    for (let v = 0; v < 100; v++) {
      muchas.push({ id: `V${v}`, parent_id: null })
      for (let p = 0; p < 30; p++) muchas.push({ id: `V${v}-${p}`, parent_id: `V${v}`, cantidad: 1, precio_unitario: 1000, avance: 50 })
    }
    const t = Date.now()
    expect(calcularAvances(muchas).avanceProyecto).toBe(50)
    expect(Date.now() - t).toBeLessThan(200)
  })
})

describe('partidas sin precio', () => {
  it('el avance de la obra es el promedio simple, no 0', () => {
    const r = calcularAvances([
      { id: 'a', parent_id: null, cantidad: 1, precio_unitario: 0, avance: 100 },
      { id: 'b', parent_id: null, cantidad: 1, precio_unitario: 0, avance: 50 },
    ])
    expect(r.avanceProyecto).toBe(75)
  })
})

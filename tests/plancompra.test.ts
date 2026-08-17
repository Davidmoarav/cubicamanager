// tests/plancompra.test.ts
// Motor del plan de compra: matching, mejor oferta, exclusión de MO/servicios,
// agrupación por proveedor y cálculo de ahorro.
import { describe, it, expect } from 'vitest'
import { generarPlanCompra, mejorOferta, type PartidaPlan, type ProductoProv } from '../lib/plancompra'

const PARTIDAS: PartidaPlan[] = [
  { id: 'g1', parent_id: null, orden: 0, descripcion: 'REVESTIMIENTOS', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p1', parent_id: 'g1', orden: 1, descripcion: 'Porcelanato piso/muro 60×60cm', unidad: 'm²', cantidad: 13, precio_unitario: 25990 },
  { id: 'p2', parent_id: 'g1', orden: 2, descripcion: 'Adhesivo flexible para porcelanato, saco 25kg', unidad: 'saco', cantidad: 7, precio_unitario: 14600 },
  { id: 'g2', parent_id: null, orden: 3, descripcion: 'MANO DE OBRA', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p3', parent_id: 'g2', orden: 4, descripcion: 'Maestro especialista', unidad: 'día', cantidad: 6, precio_unitario: 65000 },
  { id: 'g3', parent_id: null, orden: 5, descripcion: 'ARTEFACTOS', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p4', parent_id: 'g3', orden: 6, descripcion: 'Vanitorio con cubierta y espejo', unidad: 'un', cantidad: 1, precio_unitario: 149990 },
  { id: 'p5', parent_id: 'g3', orden: 7, descripcion: 'Producto rarísimo inexistente XYZ', unidad: 'un', cantidad: 2, precio_unitario: 9990 },
]

const PRODUCTOS: ProductoProv[] = [
  // Sodimac: porcelanato más caro, adhesivo más barato
  { id: 'a1', proveedor_id: 'sodimac', descripcion: 'Porcelanato piso muro 60x60 cm caja', precio: 24990, unidad: 'm²' },
  { id: 'a2', proveedor_id: 'sodimac', descripcion: 'Adhesivo flexible porcelanato saco 25kg', precio: 13990, unidad: 'saco' },
  // Easy: porcelanato más barato
  { id: 'b1', proveedor_id: 'easy', descripcion: 'Porcelanato piso muro 60x60 cm', precio: 22990, unidad: 'm²' },
  { id: 'b2', proveedor_id: 'easy', descripcion: 'Vanitorio cubierta espejo incluido', precio: 139990, unidad: 'un' },
]

const PROVEEDORES = [
  { id: 'sodimac', nombre: 'Sodimac' },
  { id: 'easy', nombre: 'Easy' },
]

describe('mejorOferta', () => {
  it('elige el producto más barato a igual similitud', () => {
    const of = mejorOferta('Porcelanato piso/muro 60×60cm', PRODUCTOS)
    expect(of?.proveedor_id).toBe('easy')
    expect(of?.precio).toBe(22990)
  })

  it('sin match razonable devuelve undefined', () => {
    expect(mejorOferta('Producto rarísimo inexistente XYZ', PRODUCTOS)).toBeUndefined()
  })
})

describe('generarPlanCompra', () => {
  const plan = generarPlanCompra(PARTIDAS, PRODUCTOS, PROVEEDORES)

  it('excluye mano de obra y jornadas', () => {
    expect(plan.noComprables).toBe(1) // Maestro (día, grupo MANO DE OBRA)
    const todos = plan.porProveedor.flatMap(g => g.items.map(i => i.material))
    expect(todos.some(m => m.includes('Maestro'))).toBe(false)
  })

  it('agrupa por proveedor con neto correcto', () => {
    const easy = plan.porProveedor.find(g => g.proveedor === 'Easy')!
    const sodimac = plan.porProveedor.find(g => g.proveedor === 'Sodimac')!
    // Easy: porcelanato 13×22.990 + vanitorio 1×139.990
    expect(easy.neto).toBe(13 * 22990 + 139990)
    // Sodimac: adhesivo 7×13.990
    expect(sodimac.neto).toBe(7 * 13990)
  })

  it('calcula el ahorro vs presupuesto', () => {
    const easy = plan.porProveedor.find(g => g.proveedor === 'Easy')!
    const porcelanato = easy.items.find(i => i.material.includes('Porcelanato'))!
    expect(porcelanato.ahorro).toBe((25990 - 22990) * 13)
    expect(plan.resumen.ahorro).toBeGreaterThan(0)
  })

  it('lo que no tiene oferta queda en sinOferta', () => {
    expect(plan.sinOferta).toHaveLength(1)
    expect(plan.sinOferta[0].material).toContain('rarísimo')
  })

  it('resumen cuadra: materiales = conOferta + sinOferta', () => {
    expect(plan.resumen.materiales).toBe(plan.resumen.conOferta + plan.sinOferta.length)
    const sumaNetos = plan.porProveedor.reduce((s, g) => s + g.neto, 0)
    expect(plan.resumen.netoPlan).toBe(sumaNetos)
  })

  it('sin productos cargados → todo queda sin oferta', () => {
    const vacio = generarPlanCompra(PARTIDAS, [], PROVEEDORES)
    expect(vacio.porProveedor).toHaveLength(0)
    expect(vacio.sinOferta.length).toBe(vacio.resumen.materiales)
  })
})

// tests/copiloto-demo.test.ts
// El modo demo del Copiloto debe producir SIEMPRE datos válidos contra el schema,
// usar precios del catálogo cuando calzan, y traducir instrucciones a operaciones.
import { describe, it, expect } from 'vitest'
import { generarDemo, editarDemo, parseNumCL, type CatItem, type PartidaActual } from '../lib/copiloto/demo'
import { PresupuestoIASchema, EdicionIASchema, netoDe } from '../lib/copiloto/schema'

const CATALOGO: CatItem[] = [
  { descripcion: 'Porcelanato piso/muro 60×60cm, estándar', unidad: 'm²', precio_unitario_ref: 25990 },
  { descripcion: 'Adhesivo flexible para porcelanato, saco 25kg', unidad: 'saco', precio_unitario_ref: 14600 },
  { descripcion: 'Vanitorio con cubierta y espejo', unidad: 'un', precio_unitario_ref: 149990 },
]

const PARTIDAS: PartidaActual[] = [
  { id: 'g1', parent_id: null, descripcion: 'MANO DE OBRA', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p1', parent_id: 'g1', descripcion: 'Maestro especialista', unidad: 'día', cantidad: 6, precio_unitario: 65000 },
  { id: 'g2', parent_id: null, descripcion: 'REVESTIMIENTOS', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p2', parent_id: 'g2', descripcion: 'Porcelanato piso/muro 60×60cm', unidad: 'm²', cantidad: 13, precio_unitario: 25990 },
]

describe('generarDemo', () => {
  it('genera un presupuesto de baño válido contra el schema', () => {
    const pres = generarDemo('Necesito remodelar un baño de 5m², cambiar cerámica e instalar vanitorio', CATALOGO)
    const v = PresupuestoIASchema.safeParse(pres)
    expect(v.success).toBe(true)
    expect(pres.nombre_proyecto).toContain('Baño')
    expect(pres.grupos.length).toBeGreaterThanOrEqual(4)
    expect(netoDe(pres)).toBeGreaterThan(0)
    // Incluye mano de obra siempre
    expect(pres.grupos.some(g => g.nombre.includes('MANO DE OBRA'))).toBe(true)
  })

  it('usa el precio del catálogo cuando el ítem calza', () => {
    const pres = generarDemo('remodelar baño de 5m2', CATALOGO)
    const todas = pres.grupos.flatMap(g => g.partidas)
    const vanitorio = todas.find(p => p.descripcion.toLowerCase().includes('vanitorio'))
    expect(vanitorio?.precio_unitario).toBe(149990)          // del catálogo, no la referencia 120000
    expect(vanitorio?.origen_precio).toBe('catalogo')
  })

  it('escala cantidades según los m² y usa genérica sin keywords', () => {
    const chico = generarDemo('baño de 4m2', [])
    const grande = generarDemo('baño de 12m2', [])
    const porcChico = chico.grupos.flatMap(g => g.partidas).find(p => p.descripcion.includes('Porcelanato'))!
    const porcGrande = grande.grupos.flatMap(g => g.partidas).find(p => p.descripcion.includes('Porcelanato'))!
    expect(porcGrande.cantidad).toBeGreaterThan(porcChico.cantidad)

    const gen = generarDemo('trabajo de gasfitería general en local comercial', [])
    expect(PresupuestoIASchema.safeParse(gen).success).toBe(true)
  })
})

describe('editarDemo', () => {
  it('"sube la mano de obra 10%" → ajustar_pct válido', () => {
    const ed = editarDemo('sube la mano de obra un 10%', PARTIDAS, CATALOGO)
    expect(EdicionIASchema.safeParse(ed).success).toBe(true)
    expect(ed.ops[0]).toMatchObject({ accion: 'ajustar_pct', pct: 10 })
    expect((ed.ops[0] as any).filtro).toContain('mano de obra')
  })

  it('"agrega 3 sacos de adhesivo" → toma precio y unidad del catálogo', () => {
    const ed = editarDemo('agrega 3 sacos de adhesivo flexible porcelanato', PARTIDAS, CATALOGO)
    expect(ed.ops[0]).toMatchObject({ accion: 'agregar', cantidad: 3, precio_unitario: 14600 })
  })

  it('"elimina el porcelanato" → eliminar con id correcto', () => {
    const ed = editarDemo('elimina el porcelanato', PARTIDAS, CATALOGO)
    expect(ed.ops[0]).toMatchObject({ accion: 'eliminar', id: 'p2' })
  })

  it('"cambia el precio de maestro a $70.000" → modificar con CLP parseado', () => {
    const ed = editarDemo('cambia el precio de maestro a $70.000', PARTIDAS, CATALOGO)
    expect(ed.ops[0]).toMatchObject({ accion: 'modificar', id: 'p1', precio_unitario: 70000 })
  })

  it('instrucción no entendida → ops vacías con ayuda, nunca error', () => {
    const ed = editarDemo('hola qué tal', PARTIDAS, CATALOGO)
    expect(ed.ops).toHaveLength(0)
    expect(EdicionIASchema.safeParse(ed).success).toBe(true)
  })
})

describe('parseNumCL', () => {
  it('parsea formatos chilenos', () => {
    expect(parseNumCL('15.000')).toBe(15000)
    expect(parseNumCL('1.234.567')).toBe(1234567)
    expect(parseNumCL('12,5')).toBe(12.5)
  })
})

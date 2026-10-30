// tests/costos.test.ts
// Motor del costo real por obra (funciones puras).
import { describe, it, expect } from 'vitest'
import {
  calcularCostosObra, moRealPorMes, netoConSigno, opcionesPartida, resolverDocumentosCompra,
} from '../lib/costos'

const proy = { id: 'P1', nombre: 'Obra Uno', avance: 50 }

// Árbol de 3 niveles: Grupo → Subgrupo → Hoja
const partidas = [
  { id: 'G', parent_id: null, orden: 1, descripcion: 'Grupo' },
  { id: 'S', parent_id: 'G', orden: 1, descripcion: 'Subgrupo' },
  { id: 'H', parent_id: 'S', orden: 1, descripcion: 'Hoja', cantidad: 10, costo_unitario: 100, precio_unitario: 150, avance: 50 },
  { id: 'R', parent_id: null, orden: 2, descripcion: 'Raíz sola', cantidad: 1, costo_unitario: 1000, precio_unitario: 1200, avance: 0 },
]

describe('netoConSigno', () => {
  it('la nota de crédito resta aunque venga en positivo o negativo', () => {
    expect(netoConSigno({ doc_tipo: 'nota_credito', neto: 100 })).toBe(-100)
    expect(netoConSigno({ doc_tipo: 'nota_credito', neto: -100 })).toBe(-100)
  })
  it('factura, boleta y nota de débito suman', () => {
    expect(netoConSigno({ doc_tipo: 'factura', neto: 100 })).toBe(100)
    expect(netoConSigno({ doc_tipo: 'boleta', neto: 100 })).toBe(100)
    expect(netoConSigno({ doc_tipo: 'nota_debito', neto: 100 })).toBe(100)
  })
})

describe('resolverDocumentosCompra', () => {
  it('la nota sin obra hereda la imputación de su factura', () => {
    const [fac, nota] = resolverDocumentosCompra([
      { id: 'F', doc_tipo: 'factura', proyecto_id: 'P1', partida_id: 'H', neto: 100 },
      { id: 'N', doc_tipo: 'nota_credito', factura_ref: 'F', neto: 30 },
    ])
    expect(fac.proyecto_id).toBe('P1')
    expect(nota.proyecto_id).toBe('P1')
    expect(nota.partida_id).toBe('H')
  })

  it('la nota sigue a la factura aunque tenga otra obra escrita', () => {
    const [, nota] = resolverDocumentosCompra([
      { id: 'F', doc_tipo: 'factura', proyecto_id: 'P2', neto: 100 },
      { id: 'N', doc_tipo: 'nota_credito', factura_ref: 'F', proyecto_id: 'P1', neto: 30 },
    ])
    expect(nota.proyecto_id).toBe('P2')
  })

  it('si la factura no tiene obra, la nota conserva la suya', () => {
    const [, nota] = resolverDocumentosCompra([
      { id: 'F', doc_tipo: 'factura', neto: 100 },
      { id: 'N', doc_tipo: 'nota_credito', factura_ref: 'F', proyecto_id: 'P1', neto: 30 },
    ])
    expect(nota.proyecto_id).toBe('P1')
  })

  it('un documento sin doc_tipo cuenta como factura; otros tipos se descartan', () => {
    const docs = resolverDocumentosCompra([{ id: 'A', neto: 1 }, { id: 'B', doc_tipo: 'guia', neto: 1 }])
    expect(docs.map(d => d.id)).toEqual(['A'])
  })
})

describe('calcularCostosObra', () => {
  const gastos = [
    { proyecto_id: 'P1', monto: 100, partida_id: 'H' },                         // manual
    { proyecto_id: 'P1', monto: 200, orden_compra_id: 'OC', partida_id: 'R' },  // orden de compra
    { proyecto_id: 'P1', monto: 300, liquidacion_id: 'L', partida_id: null },   // sueldo sin partida
    { proyecto_id: 'OTRA', monto: 999 },
  ]
  const docs = [
    { id: 'F', doc_tipo: 'factura', proyecto_id: 'P1', partida_id: 'H', neto: 400 },
    { id: 'N', doc_tipo: 'nota_credito', proyecto_id: 'P1', partida_id: 'H', neto: 50 },
    { id: 'V', doc_tipo: 'factura', proyecto: 'Obra Uno', neto: 10 },           // enlace antiguo por nombre
    { id: 'X', doc_tipo: 'factura', proyecto_id: 'P2', neto: 7777 },
  ]
  const c = calcularCostosObra(proy, partidas, gastos, docs)

  it('el gasto real suma todas las fuentes y resta las notas de crédito', () => {
    expect(c.gasto_manual).toBe(100)
    expect(c.gasto_ordenes).toBe(200)
    expect(c.gasto_sueldos).toBe(300)
    expect(c.gasto_facturas).toBe(360)
    expect(c.gasto_real).toBe(960)
  })

  it('consumo por partida acumula toda la rama, con documentos', () => {
    const grupo = c.detalle_partidas.find(d => d.id === 'G')!
    expect(grupo.gastado).toBe(450)            // 100 manual + 400 factura − 50 nota, en la hoja nieta
    expect(grupo.presupuesto_costo).toBe(1000) // viene de la hoja, no del grupo
    expect(grupo.pct_gastado).toBe(45)
    expect(c.detalle_partidas.find(d => d.id === 'R')!.gastado).toBe(200)
  })

  it('reporta lo que quedó sin partida', () => {
    expect(c.gasto_sin_partida).toBe(310)      // sueldo 300 + factura antigua 10
    expect(c.gasto_sin_partida + 450 + 200).toBe(c.gasto_real)
  })

  it('una partida de otra obra o ya borrada cuenta como sin partida', () => {
    const r = calcularCostosObra(proy, partidas, [{ proyecto_id: 'P1', monto: 70, partida_id: 'BORRADA' }], [])
    expect(r.gasto_sin_partida).toBe(70)
  })

  it('margen real = venta ejecutada − gasto real', () => {
    expect(c.venta_ejecutada).toBe(750)        // 10 × 150 al 50%
    expect(c.ganancia_real).toBe(750 - 960)
    expect(c.margen_real_pct).toBe(-28)
  })

  it('sin venta ejecutada no divide por cero', () => {
    expect(calcularCostosObra(proy, [], [], []).margen_real_pct).toBe(0)
  })
})

describe('moRealPorMes', () => {
  it('agrupa por mes solo la mano de obra, con la clave nueva y la antigua', () => {
    expect(moRealPorMes([
      { categoria: 'mano_obra', fecha: '2026-09-01', monto: 100 },
      { categoria: 'mano de obra', fecha: '2026-09-15', monto: 50 },
      { categoria: 'mano_obra', fecha: '2026-10-01', monto: 25 },
      { categoria: 'materiales', fecha: '2026-09-01', monto: 999 },
    ])).toEqual({ '2026-09': 150, '2026-10': 25 })
  })
})

describe('opcionesPartida', () => {
  it('respeta el orden de árbol y sangra por nivel', () => {
    expect(opcionesPartida(partidas).map(o => o.label)).toEqual(['Grupo', '— Subgrupo', '— — Hoja', 'Raíz sola'])
  })
  it('tolera una respuesta que no es lista', () => {
    expect(opcionesPartida({ error: 'x' } as any)).toEqual([])
  })
})

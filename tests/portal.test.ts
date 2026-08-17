// tests/portal.test.ts
// Snapshot del portal: totales cuadrados, EPs internos ocultos y árbol aplanado.
import { describe, it, expect } from 'vitest'
import { armarSnapshot, type PartidaSnap } from '../lib/portal'

const PARTIDAS: PartidaSnap[] = [
  { id: 'g1', parent_id: null, orden: 0, descripcion: 'Revestimientos', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true, avance: 50, fecha_inicio: '2026-08-01', fecha_fin: '2026-08-10' },
  { id: 'p1', parent_id: 'g1', orden: 1, descripcion: 'Porcelanato', unidad: 'm²', cantidad: 10, precio_unitario: 25000 },
  { id: 'sub', parent_id: 'g1', orden: 2, descripcion: 'Subgrupo', unidad: 'gl', cantidad: 0, precio_unitario: 0, es_grupo: true },
  { id: 'p2', parent_id: 'sub', orden: 3, descripcion: 'Fragua', unidad: 'saco', cantidad: 2, precio_unitario: 7000 },
]

const EPS = [
  { numero: 1, estado: 'pagado', total: 100000, fecha: '2026-08-01' },
  { numero: 2, estado: 'presentado', total: 50000 },
  { numero: 3, estado: 'borrador', total: 999999 },
  { numero: 4, estado: 'rechazado', total: 888888 },
]

describe('armarSnapshot', () => {
  const snap = armarSnapshot({
    proyecto: { nombre: 'Baño', estado: 'activo', avance: 42 },
    partidas: PARTIDAS,
    eps: EPS,
    empresa: { razon_social: 'La Casa del Eifs' },
    cliente: { razon_social: 'Cliente Feliz' },
    ahora: '2026-08-11T12:00:00Z',
  })

  it('totales cuadran (neto 264.000 + IVA = total)', () => {
    expect(snap.montos.neto).toBe(264000)   // 250.000 + 14.000
    expect(snap.montos.iva).toBe(Math.round(264000 * 0.19))
    expect(snap.montos.total).toBe(snap.montos.neto + snap.montos.iva)
  })

  it('oculta EPs en borrador y rechazados', () => {
    expect(snap.cobros).toHaveLength(2)
    expect(snap.cobros.map(c => c.numero)).toEqual([1, 2])
  })

  it('pagado y saldo desde los EPs visibles', () => {
    expect(snap.montos.pagado).toBe(100000)
    expect(snap.montos.saldo).toBe(snap.montos.total - 100000)
  })

  it('aplana subgrupos: el grupo lista todas sus hojas', () => {
    const g = snap.presupuesto.grupos[0]
    expect(g.nombre).toBe('Revestimientos')
    expect(g.subtotal).toBe(264000)
    expect(g.items.map(i => i.descripcion)).toEqual(['Porcelanato', 'Fragua'])
  })

  it('etapas para la gantt del cliente con fechas y avance', () => {
    expect(snap.etapas).toHaveLength(1)
    expect(snap.etapas[0]).toMatchObject({ nombre: 'Revestimientos', avance: 50, fecha_inicio: '2026-08-01' })
  })

  it('sin cliente ni empresa no revienta', () => {
    const s = armarSnapshot({ proyecto: { nombre: 'X', estado: 'cotizacion' }, partidas: [], eps: [] })
    expect(s.empresa.nombre).toBe('Contratista')
    expect(s.cliente).toBeNull()
    expect(s.montos.total).toBe(0)
  })
})

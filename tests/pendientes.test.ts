// tests/pendientes.test.ts
// Pendientes por rol, primeros pasos y avisos de la app.
import { describe, it, expect } from 'vitest'
import { calcularPendientes, mesAnterior, pendientesObra, primerosPasos } from '../lib/pendientes'
import { textoAceptar } from '../lib/avisos'

const HOY = '2026-11-02'
const base = {
  hoy: HOY,
  proyectos: [
    { id: 'a', nombre: 'Norte', estado: 'activo', fin: '2026-10-01', avance: 50 },
    { id: 'b', nombre: 'Sur', estado: 'activo', fin: '2027-01-01', avance: 0 },
    { id: 'c', nombre: 'Lista', estado: 'activo', fin: '2026-01-01', avance: 100 },
  ],
  facturas: [
    { id: 1, tipo: 'venta', estado: 'vencida', monto: 100, periodo: '2026-09' },
    { id: 2, tipo: 'venta', estado: 'pendiente', vencimiento: '2026-10-30', monto: 50, periodo: '2026-10' },
    { id: 3, tipo: 'venta', estado: 'pendiente', vencimiento: '2026-12-01', monto: 999 },
    { id: 4, tipo: 'venta', estado: 'pagada', vencimiento: '2026-01-01', monto: 999 },
    { id: 5, tipo: 'compra', proyecto_id: null, periodo: '2026-10' },
    { id: 6, tipo: 'compra', doc_tipo: 'nota_credito', proyecto_id: null, periodo: '2026-10' },
    { id: 7, tipo: 'compra', proyecto_id: 'a', periodo: '2026-10' },
  ],
  ordenes: [{ estado: 'enviada' }, { estado: 'parcial' }, { estado: 'borrador' }, { estado: 'recibida' }],
  estadosPago: [{ estado: 'aprobado', numero: 2, proyecto_id: 'a' }, { estado: 'aprobado', numero: 3, proyecto_id: 'a', factura_id: 'x' }],
  empleados: [{ id: 'e1', estado: 'activo' }, { id: 'e2', estado: 'activo' }, { id: 'e3', estado: 'inactivo' }],
  liquidaciones: [{ empleado_id: 'e1' }],
  incidentes: [{ id: 'i', tipo: 'incidente', estado: 'abierto', proyecto_id: 'a', titulo: 'Caída' }, { id: 'j', tipo: 'incidente', estado: 'cerrado', proyecto_id: 'a' }],
}
const ids = (rol: string, extra = {}) => calcularPendientes({ ...base, rol, ...extra }).map(p => p.id)

describe('pendientes de la empresa', () => {
  it('el administrador ve todo, con lo urgente primero', () => {
    const lista = calcularPendientes({ ...base, rol: 'admin' })
    expect(lista.map(p => p.id).sort()).toEqual(['atrasada-a', 'ep-a-2', 'incidente-i', 'liquidaciones', 'por_recibir', 'sin_obra', 'vencidas'].sort())
    expect(lista.slice(0, 3).every(p => p.urgente)).toBe(true)
  })
  it('suma las vencidas por estado o por fecha', () => {
    const v = calcularPendientes({ ...base, rol: 'admin' }).find(p => p.id === 'vencidas')
    expect(v?.texto).toBe('2 facturas vencidas por cobrar')
    expect(v?.detalle).toBe('$150')
    expect(v?.href).toBe('/facturacion?periodo=2026-09')
  })
  it('una nota no cuenta como compra sin obra', () => {
    const s = calcularPendientes({ ...base, rol: 'admin' }).find(p => p.id === 'sin_obra')
    expect(s?.texto).toBe('1 compra sin obra')
    expect(s?.href).toBe('/facturacion?periodo=2026-10&sin_obra=1')
  })
  it('el jefe de obra no recibe pendientes de finanzas ni sueldos', () => {
    expect(ids('jefe_obra')).not.toEqual(expect.arrayContaining(['vencidas']))
    expect(ids('jefe_obra')).not.toContain('sin_obra')
    expect(ids('jefe_obra')).not.toContain('liquidaciones')
    expect(ids('jefe_obra')).toContain('por_recibir')
  })
  it('el contador no recibe pendientes de ejecución', () => {
    expect(ids('contador').sort()).toEqual(['liquidaciones', 'sin_obra', 'vencidas'])
  })
  it('una lista que no se pudo leer no inventa pendientes', () => {
    expect(ids('admin', { liquidaciones: null })).not.toContain('liquidaciones')
    expect(ids('admin', { facturas: null })).not.toContain('vencidas')
  })
  it('una obra terminada al 100% no está atrasada', () => {
    expect(ids('admin')).not.toContain('atrasada-c')
  })
  it('el mes anterior cruza el año', () => {
    expect(mesAnterior('2026-01-15')).toBe('2025-12')
    expect(mesAnterior(HOY)).toBe('2026-10')
  })
})

describe('primeros pasos', () => {
  const completa = { rol: 'admin', empresa: { razon_social: 'X', rut: '1-9' }, clientes: 1, obras: 1, empleados: 1 }
  it('desaparecen cuando la cuenta tiene lo básico', () => {
    expect(primerosPasos(completa)).toEqual([])
  })
  it('marca lo que falta', () => {
    const pasos = primerosPasos({ ...completa, obras: 0 })
    expect(pasos.find(p => p.id === 'obra')?.hecho).toBe(false)
    expect(pasos.find(p => p.id === 'cliente')?.hecho).toBe(true)
  })
  it('solo los ve el administrador', () => {
    expect(primerosPasos({ ...completa, rol: 'contador', obras: 0 })).toEqual([])
  })
})

describe('qué falta en una obra', () => {
  const proyecto = { id: 'a', cliente_id: 'c', estado: 'activo', fin: '2027-01-01', avance: 10 }
  it('sin fecha de término, la pide', () => {
    const partidas = [{ id: 'p', fecha_inicio: '2026-01-01', avance: 10 }]
    expect(pendientesObra({ proyecto: { ...proyecto, fin: null }, partidas, estadosPago: [], hoy: HOY }).map(p => p.id)).toEqual(['termino'])
  })
  it('sin partidas, pide cargarlas', () => {
    expect(pendientesObra({ proyecto, partidas: [], estadosPago: [], hoy: HOY }).map(p => p.id)).toEqual(['partidas'])
  })
  it('con todo al día, no pide nada', () => {
    const partidas = [{ id: 'p', fecha_inicio: '2026-01-01', avance: 10 }]
    expect(pendientesObra({ proyecto, partidas, estadosPago: [], ordenes: [], hoy: HOY })).toEqual([])
  })
  it('lleva a la pestaña que corresponde, con lo urgente primero', () => {
    const lista = pendientesObra({
      proyecto: { ...proyecto, cliente_id: null, fin: '2026-01-01' },
      partidas: [{ id: 'p', avance: 0 }],
      estadosPago: [{ estado: 'aprobado', numero: 4 }],
      ordenes: [{ estado: 'enviada' }],
      hoy: HOY,
    })
    expect(lista[0].id).toBe('atrasada')
    expect(lista.find(p => p.id === 'fechas')?.tab).toBe('gantt')
    expect(lista.find(p => p.id === 'cliente')?.tab).toBe('cliente')
    expect(lista.find(p => p.id === 'ep-4')?.tab).toBe('pagos')
    expect(lista.find(p => p.id === 'ordenes')?.href).toBe('/ordenes-compra')
  })
})

describe('confirmaciones', () => {
  it('el botón repite el verbo de la pregunta', () => {
    expect(textoAceptar('¿Eliminar factura?')).toBe('Eliminar')
    expect(textoAceptar('¿Quitar el acceso de ana@x.cl?')).toBe('Quitar')
    expect(textoAceptar('Se creará una obra')).toBe('Aceptar')
  })
})

// tests/portal-pagos.test.ts
// El portal muestra los cobros al día y deja informar pagos solo de lo que está por pagar.
import { describe, it, expect } from 'vitest'
import { cobrosPortal, puedeInformarPago } from '../lib/portal'
import { calcularPendientes } from '../lib/pendientes'

const foto = {
  montos: { neto: 1000, iva: 190, total: 1190, pagado: 0, saldo: 1190 },
  cobros: [{ numero: 1, estado: 'presentado', total: 300 }],
}

describe('cobros del portal', () => {
  it('con la función al día, manda lo vivo y no la foto', () => {
    const r = cobrosPortal(foto, {
      cobros: [
        { numero: 2, estado: 'aprobado', total: 400, factura: 'EP-2', vencimiento: '2026-11-30' },
        { numero: 1, estado: 'pagado', total: 300 },
      ],
      banco: { banco: 'Banco Estado', numero_cuenta: '123' },
    })
    expect(r.alDia).toBe(true)
    expect(r.cobros.map(c => c.numero)).toEqual([1, 2])
    expect(r.pagado).toBe(300)
    expect(r.porPagar).toBe(400)
    expect(r.saldo).toBe(890)
    expect(r.banco?.banco).toBe('Banco Estado')
  })
  it('sin la función, usa la foto y no ofrece pagar ni datos bancarios', () => {
    const r = cobrosPortal(foto, null)
    expect(r.alDia).toBe(false)
    expect(r.cobros).toHaveLength(1)
    expect(r.banco).toBeNull()
  })
  it('sin número de cuenta no muestra datos bancarios', () => {
    expect(cobrosPortal(foto, { cobros: [], banco: { banco: 'X', numero_cuenta: '' } }).banco).toBeNull()
  })
  it('nunca muestra borradores ni rechazados', () => {
    const r = cobrosPortal(foto, { cobros: [{ numero: 1, estado: 'borrador', total: 1 }, { numero: 2, estado: 'rechazado', total: 1 }] })
    expect(r.cobros).toEqual([])
  })
  it('se informa pago de lo que está por pagar y no tiene un aviso en revisión', () => {
    expect(puedeInformarPago({ numero: 1, estado: 'aprobado', total: 1 })).toBe(true)
    expect(puedeInformarPago({ numero: 1, estado: 'presentado', total: 1, aviso: { estado: 'rechazado', monto: 1, fecha_pago: '2026-11-01' } })).toBe(true)
    expect(puedeInformarPago({ numero: 1, estado: 'aprobado', total: 1, aviso: { estado: 'pendiente', monto: 1, fecha_pago: '2026-11-01' } })).toBe(false)
    expect(puedeInformarPago({ numero: 1, estado: 'pagado', total: 1 })).toBe(false)
  })
})

describe('pendiente en el panel', () => {
  it('todos los roles ven el pago informado, con enlace a la obra', () => {
    for (const rol of ['admin', 'contador', 'jefe_obra']) {
      const lista = calcularPendientes({
        rol, hoy: '2026-11-03', proyectos: [{ id: 'p1', nombre: 'Norte' }],
        avisosPago: [{ id: 'a1', proyecto_id: 'p1', monto: 400, estado_pago: { numero: 2 } }],
      })
      const p = lista.find(x => x.id === 'aviso-pago-a1')
      expect(p?.texto).toBe('Norte: el cliente informó un pago')
      expect(p?.href).toBe('/obra/p1?tab=pagos')
      expect(p?.detalle).toContain('N°2')
    }
  })
})

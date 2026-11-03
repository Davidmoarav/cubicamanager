// tests/usabilidad.test.ts
// Cifras del informe, estado de liquidaciones, formatos y rutas con acceso restringido.
import { describe, it, expect } from 'vitest'
import { contratoBruto, contratoNeto, kpisProyecto, pctCobrado } from '../lib/informe'
import { estadoLiquidacion, valoresLiquidacion } from '../lib/liquidaciones'
import { fmt, fmtFecha, fmtPeriodo } from '../lib/format'
import { avisoSoloLectura, rutaPermitida, rutaProtegida } from '../lib/nav'

const eps = [
  { estado: 'pagado', bruto: 500000, total: 535500 },
  { estado: 'aprobado', bruto: 400000, total: 428400 },
  { estado: 'borrador', bruto: 900000, total: 1 },
]

describe('contrato neto', () => {
  it('usa el monto neto si está cargado', () => {
    expect(contratoNeto({ valor: 3000000, monto_contrato: 2500000 })).toBe(2500000)
  })
  it('si no, le saca el IVA al valor', () => {
    expect(contratoNeto({ valor: 1190000 })).toBe(1000000)
  })
  it('un contrato en UF se lleva a pesos antes de sacar el IVA', () => {
    expect(contratoNeto({ valor: 100, moneda: 'uf', valor_uf: 40000 })).toBe(Math.round(4000000 / 1.19))
  })
  it('el contrato con IVA de una obra en UF se muestra en pesos', () => {
    expect(contratoBruto({ valor: 722, moneda: 'uf', valor_uf: 39500 })).toBe(28519000)
    expect(contratoBruto({ valor: 1190000 })).toBe(1190000)
  })
})

describe('kpis del informe', () => {
  const k = kpisProyecto({ valor: 3000000, monto_contrato: 2500000 }, eps, [], [])
  it('el valor rotulado como neto es neto', () => {
    expect(k.valor_contrato).toBe(2500000)
  })
  it('por facturar compara neto con neto', () => {
    expect(k.saldo_por_facturar).toBe(1600000)
  })
  it('por facturar no baja de cero', () => {
    expect(kpisProyecto({ monto_contrato: 100 }, eps, [], []).saldo_por_facturar).toBe(0)
  })
  it('cobrado es bruto pagado sobre contrato neto, también en la pestaña de pagos', () => {
    expect(k.cobrado_pct).toBe(20)
    expect(pctCobrado(eps, contratoNeto({ valor: 3000000, monto_contrato: 2500000 }))).toBe(20)
    expect(pctCobrado(eps, 0)).toBe(0)
  })
})

describe('estado de la liquidación', () => {
  const calc = { liquido_pagar: 800000, total_imponible: 1000000 }
  it('sin fila guardada, no llegó al costo de las obras', () => {
    expect(estadoLiquidacion(null, calc)).toBe('sin_guardar')
  })
  it('guardada con el mismo líquido', () => {
    expect(estadoLiquidacion({ estado: 'borrador', liquido_pagar: 800000 }, calc)).toBe('guardada')
    expect(estadoLiquidacion({ estado: 'borrador', liquido_pagar: 800001 }, calc)).toBe('guardada')
  })
  it('avisa si los datos cambiaron después de guardar', () => {
    expect(estadoLiquidacion({ estado: 'borrador', liquido_pagar: 700000 }, calc)).toBe('desactualizada')
  })
  it('pagada no se considera desactualizada', () => {
    expect(estadoLiquidacion({ estado: 'pagada', liquido_pagar: 700000 }, calc)).toBe('pagada')
  })
  it('muestra lo guardado, y lo calculado solo donde no hay dato', () => {
    expect(valoresLiquidacion({ liquido_pagar: 700000 }, calc)).toEqual({ liquido_pagar: 700000, total_imponible: 1000000 })
    expect(valoresLiquidacion(null, calc)).toEqual(calc)
  })
})

describe('formatos', () => {
  it('montos completos, con el signo antes del peso', () => {
    expect(fmt(357000)).toBe('$357.000')
    expect(fmt(-200000)).toBe('-$200.000')
    expect(fmt(0)).toBe('$0')
    expect(fmt(NaN)).toBe('$0')
    expect(fmt(1234.6)).toBe('$1.235')
  })
  it('fechas legibles, sin correrse de día', () => {
    expect(fmtFecha('2026-10-08')).toBe('8 oct 2026')
    expect(fmtFecha('2026-01-01T00:00:00Z')).toBe('1 ene 2026')
    expect(fmtFecha(null)).toBe('—')
    expect(fmtFecha('s/f')).toBe('s/f')
  })
  it('períodos', () => {
    expect(fmtPeriodo('2026-10')).toBe('octubre 2026')
    expect(fmtPeriodo(null)).toBe('—')
  })
})

describe('aviso de solo lectura', () => {
  it('el contador lo ve donde el servidor le rechaza cambios', () => {
    expect(avisoSoloLectura('/obra/abc', 'contador')).toContain('no modificarla')
    expect(avisoSoloLectura('/ordenes-compra', 'contador')).toContain('no modificarla')
  })
  it('no aparece donde el contador sí trabaja', () => {
    expect(avisoSoloLectura('/facturacion', 'contador')).toBeNull()
    expect(avisoSoloLectura('/remuneraciones', 'contador')).toBeNull()
  })
  it('el jefe de obra edita la obra, pero no la empresa', () => {
    expect(avisoSoloLectura('/obra/abc', 'jefe_obra')).toBeNull()
    expect(avisoSoloLectura('/configuracion', 'jefe_obra')).toContain('administrador')
  })
  it('el administrador nunca lo ve', () => {
    expect(avisoSoloLectura('/configuracion', 'admin')).toBeNull()
  })
})

describe('rutas restringidas', () => {
  it('el jefe de obra no entra a lo financiero ni a sueldos', () => {
    for (const r of ['/facturacion', '/finanzas', '/reportes', '/remuneraciones', '/rrhh']) {
      expect(rutaPermitida(r, 'jefe_obra')).toBe(false)
    }
  })
  it('el contador sí, pero no a usuarios ni bitácora', () => {
    expect(rutaPermitida('/facturacion', 'contador')).toBe(true)
    expect(rutaPermitida('/usuarios', 'contador')).toBe(false)
    expect(rutaPermitida('/auditoria', 'contador')).toBe(false)
  })
  it('el administrador entra a todo', () => {
    for (const r of ['/facturacion', '/usuarios', '/auditoria']) expect(rutaPermitida(r, 'admin')).toBe(true)
  })
  it('Proyectos y Terreno quedan fuera: el contador los ve en solo lectura', () => {
    expect(rutaProtegida('/proyectos')).toBe(false)
    expect(rutaProtegida('/terreno')).toBe(false)
    expect(rutaPermitida('/proyectos', 'contador')).toBe(true)
  })
  it('no confunde rutas con el mismo prefijo', () => {
    expect(rutaProtegida('/finanzas/detalle')).toBe(true)
    expect(rutaProtegida('/finanzas-otra')).toBe(false)
  })
})

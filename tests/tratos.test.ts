// Tratos, formas de pago y semana corrida (funciones puras).
import { describe, it, expect } from 'vitest'
import {
  calcularAvanceTrato, errorAvanceTrato, montoPactado, repartirTrato, resumenTrato,
  semanaCorrida, separarCostoTratos, sueldoMensualEstimado, unirTramos, variablesDelMes,
} from '../lib/tratos'
import { calcularLiquidacion, REM_DEFAULTS } from '../types/finanzas'

const diasHabiles = (periodo: string, desde: number, hasta: number) => {
  const out: string[] = []
  const [y, m] = periodo.split('-').map(Number)
  for (let d = desde; d <= hasta; d++) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    if (dow >= 1 && dow <= 5) out.push(`${periodo}-${String(d).padStart(2, '0')}`)
  }
  return out
}

describe('valor de un avance', () => {
  it('por unidad: precio × cantidad, con retención', () => {
    const t = { tipo: 'unidad' as const, precio_unitario: 4500, cantidad_pactada: 200, retencion_pct: 10 }
    expect(montoPactado(t)).toBe(900000)
    expect(calcularAvanceTrato(t, 80)).toEqual({ bruto: 360000, retencion: 36000, neto: 324000 })
  })
  it('suma alzada y por vivienda: % del monto fijo', () => {
    const t = { tipo: 'vivienda' as const, monto_fijo: 650000 }
    expect(montoPactado(t)).toBe(650000)
    expect(calcularAvanceTrato(t, 50).bruto).toBe(325000)
  })
  it('por hora y por día: tarifa × cantidad', () => {
    expect(calcularAvanceTrato({ tipo: 'por_hora', precio_unitario: 6000 }, 7.5).bruto).toBe(45000)
    expect(calcularAvanceTrato({ tipo: 'por_dia', precio_unitario: 35000 }, 3).bruto).toBe(105000)
  })
  it('no deja pasar de lo pactado', () => {
    const unidad = { tipo: 'unidad' as const, precio_unitario: 1000, cantidad_pactada: 100 }
    expect(errorAvanceTrato(unidad, [{ cantidad: 90 }], 10)).toBeNull()
    expect(errorAvanceTrato(unidad, [{ cantidad: 90 }], 11)).toMatch(/pactado/)
    expect(errorAvanceTrato({ tipo: 'suma_alzada', monto_fijo: 1 }, [{ cantidad: 60 }], 50)).toMatch(/100%/)
    expect(errorAvanceTrato(unidad, [], 0)).toMatch(/mayor que cero/)
    // Sin cantidad cerrada (por hora abierto) no hay tope
    expect(errorAvanceTrato({ tipo: 'por_hora', precio_unitario: 1 }, [{ cantidad: 500 }], 500)).toBeNull()
  })
  it('resumen: solo lo aprobado o pagado es ejecutado', () => {
    const t = { tipo: 'unidad' as const, precio_unitario: 1000, cantidad_pactada: 100, retencion_pct: 10 }
    const r = resumenTrato(t, [
      { cantidad: 40, bruto: 40000, retencion: 4000, neto: 36000, estado: 'pagado' },
      { cantidad: 20, bruto: 20000, retencion: 2000, neto: 18000, estado: 'aprobado' },
      { cantidad: 10, bruto: 10000, retencion: 1000, neto: 9000, estado: 'borrador' },
    ])
    expect(r).toMatchObject({ pactado: 100000, ejecutado: 60000, avance: 60, por_aprobar: 10000, retenido: 6000, pagado: 36000, por_pagar: 18000, saldo: 40000 })
  })
})

describe('reparto en la cuadrilla', () => {
  const tres = [{ empleado_id: 'a' }, { empleado_id: 'b' }, { empleado_id: 'c' }]
  it('partes iguales que suman exacto', () => {
    const r = repartirTrato(100000, tres, 'iguales')
    expect(r.reduce((s, p) => s + p.monto, 0)).toBe(100000)
    expect(r.map(p => p.monto).sort()).toEqual([33333, 33333, 33334])
  })
  it('por porcentaje (maestro 50, ayudantes 25)', () => {
    const r = repartirTrato(200000, [{ empleado_id: 'm', porcentaje: 50 }, { empleado_id: 'a', porcentaje: 25 }, { empleado_id: 'b', porcentaje: 25 }], 'porcentaje')
    expect(r).toEqual([{ empleado_id: 'm', monto: 100000 }, { empleado_id: 'a', monto: 50000 }, { empleado_id: 'b', monto: 50000 }])
  })
  it('por días trabajados; quien no fue no cobra', () => {
    const r = repartirTrato(90000, [{ empleado_id: 'a', dias: 4 }, { empleado_id: 'b', dias: 2 }, { empleado_id: 'c', dias: 0 }], 'dias')
    expect(r).toEqual([{ empleado_id: 'a', monto: 60000 }, { empleado_id: 'b', monto: 30000 }])
  })
  it('sin porcentajes ni días cargados: partes iguales', () => {
    expect(repartirTrato(100, [{ empleado_id: 'a' }, { empleado_id: 'b' }], 'porcentaje').map(p => p.monto)).toEqual([50, 50])
  })
})

describe('semana corrida', () => {
  it('mes completo: un día de promedio por cada domingo de semana trabajada', () => {
    // Noviembre 2026: 21 días hábiles; 4 semanas completas con su domingo
    const ganado = Object.fromEntries(diasHabiles('2026-11', 1, 30).map(f => [f, 50000]))
    expect(semanaCorrida(ganado, '2026-11')).toBe(200000)
  })
  it('un festivo en día hábil también se paga', () => {
    // Semana del 7 al 13 de diciembre de 2026: martes 8 festivo → 4 días trabajados, 2 descansos
    const ganado = { '2026-12-07': 40000, '2026-12-09': 40000, '2026-12-10': 40000, '2026-12-11': 40000 }
    expect(semanaCorrida(ganado, '2026-12')).toBe(80000)
  })
  it('faltar baja el promedio de la semana', () => {
    // 3 de 5 días: 150.000 / 5 = 30.000 por el domingo
    const ganado = { '2026-11-02': 50000, '2026-11-03': 50000, '2026-11-04': 50000 }
    expect(semanaCorrida(ganado, '2026-11')).toBe(30000)
  })
  it('sin ganancia no hay semana corrida', () => {
    expect(semanaCorrida({}, '2026-11')).toBe(0)
  })
})

describe('lo variable del mes según la forma de pago', () => {
  const partes = diasHabiles('2026-11', 1, 30).map(fecha => ({ fecha, horas: 8 }))

  it('mensual: sueldo de siempre; el trato aprobado se suma', () => {
    const v = variablesDelMes({ modalidad: 'mensual', sueldo: 700000 }, partes, [{ fecha: '2026-11-10', monto: 80000 }], '2026-11')
    expect(v).toMatchObject({ trato_monto: 80000, semana_corrida: 0, dias: 21, horas: 168 })
    expect(v.sueldo_base).toBeUndefined()
  })
  it('por día: valor día × días, con semana corrida', () => {
    const v = variablesDelMes({ modalidad: 'diario', valor_dia: 50000 }, partes, [], '2026-11')
    expect(v).toMatchObject({ sueldo_base: 1050000, semana_corrida: 200000, dias: 21 })
  })
  it('por hora: valor hora × horas del parte', () => {
    const v = variablesDelMes({ modalidad: 'por_hora', valor_hora: 5000 }, partes, [], '2026-11')
    expect(v.sueldo_base).toBe(840000)
    expect(v.semana_corrida).toBe(160000) // 40.000 diarios × 4 domingos
  })
  it('a trato: si no alcanza el mínimo garantizado, se completa', () => {
    const v = variablesDelMes({ modalidad: 'trato', sueldo: 529000 }, [], [{ fecha: '2026-11-03', monto: 100000 }], '2026-11')
    expect(v.trato_monto).toBe(100000)
    expect(v.semana_corrida).toBe(20000)
    expect(v.sueldo_base).toBe(409000)
    const sobra = variablesDelMes({ modalidad: 'trato', sueldo: 529000 }, [], [{ fecha: '2026-11-03', monto: 900000 }], '2026-11')
    expect(sobra.sueldo_base).toBe(0)
  })
  it('mixto: sueldo fijo y semana corrida solo sobre el trato', () => {
    const v = variablesDelMes({ modalidad: 'mixto', sueldo: 600000 }, partes, [{ fecha: '2026-11-03', monto: 100000 }], '2026-11')
    expect(v.sueldo_base).toBeUndefined()
    expect(v.semana_corrida).toBe(20000)
  })
  it('ignora partes y tratos de otros meses', () => {
    const v = variablesDelMes({ modalidad: 'diario', valor_dia: 50000 }, [{ fecha: '2026-10-30', horas: 8 }], [{ fecha: '2026-12-01', monto: 5 }], '2026-11')
    expect(v).toMatchObject({ sueldo_base: 0, trato_monto: 0, dias: 0 })
  })
})

describe('liquidación con trato', () => {
  const emp: any = { id: 'e', nombre: 'X', sueldo: 600000, horas_extra: 0, estado: 'activo', tipo: 'planta', contrato_tipo: 'obra_faena' }
  it('sin variables no cambia', () => {
    const l = calcularLiquidacion(emp, REM_DEFAULTS)
    expect(l.sueldo_base).toBe(600000)
    expect(l.trato_monto).toBe(0)
    expect(l.semana_corrida).toBe(0)
  })
  it('trato y semana corrida son imponibles', () => {
    // Con sueldo de 1.000.000 la gratificación ya está en su tope: el imponible sube justo lo del trato
    const alto = { ...emp, sueldo: 1000000 }
    const base = calcularLiquidacion(alto, REM_DEFAULTS)
    const con = calcularLiquidacion(alto, REM_DEFAULTS, { trato_monto: 100000, semana_corrida: 20000 })
    expect(con.total_imponible - base.total_imponible).toBe(120000)
    // Bajo el tope, además sube la gratificación (25% de lo devengado)
    const bajo = calcularLiquidacion(emp, REM_DEFAULTS, { trato_monto: 100000, semana_corrida: 20000 })
    expect(bajo.total_imponible - calcularLiquidacion(emp, REM_DEFAULTS).total_imponible).toBe(150000)
    expect(con.desc_afp).toBeGreaterThan(base.desc_afp)
  })
  it('por día: la base del mes reemplaza al sueldo', () => {
    const l = calcularLiquidacion({ ...emp, sueldo: 0 }, REM_DEFAULTS, { sueldo_base: 1050000, semana_corrida: 200000 })
    expect(l.sueldo_base).toBe(1050000)
    expect(l.total_haberes).toBe(1050000 + 200000 + l.gratificacion)
  })
})

describe('costo del trato a su partida', () => {
  it('la parte del trato va a su partida con sus aportes; el resto se reparte por horas', () => {
    const { tramos, resto } = separarCostoTratos(1100000, 1000000, [
      { proyecto_id: 'P', partida_id: 'A', monto: 300000 },
      { proyecto_id: 'P', partida_id: 'B', monto: 100000 },
    ])
    expect(tramos).toEqual([
      { proyecto_id: 'P', partida_id: 'A', horas: 0, monto: 330000 },
      { proyecto_id: 'P', partida_id: 'B', horas: 0, monto: 110000 },
    ])
    expect(resto).toBe(660000)
  })
  it('sin tratos todo es resto', () => {
    expect(separarCostoTratos(500, 400, [])).toEqual({ tramos: [], resto: 500 })
  })
  it('une tramos de la misma partida', () => {
    expect(unirTramos([
      { proyecto_id: 'P', partida_id: 'A', horas: 0, monto: 10 },
      { proyecto_id: 'P', partida_id: 'A', horas: 8, monto: 5 },
      { proyecto_id: 'P', partida_id: null, horas: 2, monto: 1 },
    ])).toEqual([
      { proyecto_id: 'P', partida_id: 'A', horas: 8, monto: 15 },
      { proyecto_id: 'P', partida_id: null, horas: 2, monto: 1 },
    ])
  })
})

describe('ingreso mínimo y estimación mensual', () => {
  it('a trato: el piso es el mayor entre el mínimo pactado y el ingreso mínimo', () => {
    const v = variablesDelMes({ modalidad: 'trato', sueldo: 300000 }, [], [], '2026-11', 5, 539000)
    expect(v.sueldo_base).toBe(539000)
  })
  it('estimación de un mes normal según la forma de pago', () => {
    expect(sueldoMensualEstimado({ modalidad: 'diario', valor_dia: 30000 })).toBe(Math.round(30000 * 6 * 52 / 12))
    expect(sueldoMensualEstimado({ modalidad: 'por_hora', valor_hora: 5000 }, { jornada_semanal: 40, dias_laborales: 5 })).toBe(Math.round(5000 * 8 * 6 * 52 / 12))
    expect(sueldoMensualEstimado({ modalidad: 'trato', sueldo: 0 }, { ingreso_minimo: 539000 })).toBe(539000)
    expect(sueldoMensualEstimado({ modalidad: 'mensual', sueldo: 840000, horas_extra: 10 }, { jornada_semanal: 42 })).toBe(840000 + 70000)
  })
})

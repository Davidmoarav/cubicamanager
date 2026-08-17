// tests/gantt.test.ts
// Motor de la Carta Gantt: rango, posiciones, estados, fase actual,
// días restantes y plan automático.
import { describe, it, expect } from 'vitest'
import { calcularGantt, planAutomatico, sumarDias, type EtapaGantt } from '../lib/gantt'

const ETAPAS: EtapaGantt[] = [
  { id: 'e1', nombre: 'Demolición', avance: 100, valor: 200000, fecha_inicio: '2026-07-06', fecha_fin: '2026-07-10' },
  { id: 'e2', nombre: 'Instalaciones', avance: 50, valor: 300000, fecha_inicio: '2026-07-11', fecha_fin: '2026-07-15' },
  { id: 'e3', nombre: 'Terminaciones', avance: 0, valor: 500000, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-21' },
]

describe('calcularGantt', () => {
  const g = calcularGantt(ETAPAS, '2026-07-12')

  it('detecta el rango completo del proyecto', () => {
    expect(g.desde).toBe('2026-07-06')
    expect(g.hasta).toBe('2026-07-21')
    expect(g.totalDias).toBe(16)
  })

  it('posiciona HOY dentro del rango', () => {
    expect(g.hoyPct).not.toBeNull()
    expect(g.hoyPct!).toBeGreaterThan(30)
    expect(g.hoyPct!).toBeLessThan(50)
  })

  it('HOY fuera de rango → null', () => {
    expect(calcularGantt(ETAPAS, '2026-09-01').hoyPct).toBeNull()
  })

  it('estados: completa, encurso, pendiente y atrasada', () => {
    const [e1, e2, e3] = g.etapas
    expect(e1.estado).toBe('completa')
    expect(e2.estado).toBe('encurso')
    expect(e3.estado).toBe('pendiente')
    const atrasado = calcularGantt(ETAPAS, '2026-07-30')
    expect(atrasado.etapas[1].estado).toBe('atrasada')
  })

  it('barras cubren el rango sin salirse (0-100%)', () => {
    for (const e of g.etapas) {
      expect(e.iniPct).toBeGreaterThanOrEqual(0)
      expect(e.iniPct + e.anchoPct).toBeLessThanOrEqual(100.01)
    }
    // La primera parte en 0 y la última termina en 100
    expect(g.etapas[0].iniPct).toBeCloseTo(0, 5)
    expect(g.etapas[2].iniPct + g.etapas[2].anchoPct).toBeCloseTo(100, 5)
  })

  it('fase actual = primera etapa incompleta por fecha', () => {
    expect(g.faseActual?.nombre).toBe('Instalaciones')
    expect(g.faseActual?.avance).toBe(50)
  })

  it('días restantes hasta la entrega', () => {
    expect(g.diasRestantes).toBe(9)   // 12 jul → 21 jul
    expect(g.fechaEntrega).toBe('2026-07-21')
  })

  it('avance global ponderado por valor', () => {
    // (100×200 + 50×300 + 0×500) / 1000 = 35
    expect(g.avanceGlobal).toBe(35)
  })

  it('sin fechas: no revienta y cuenta pendientes de planificar', () => {
    const sin = calcularGantt(
      [{ id: 'x', nombre: 'Etapa', avance: 10, valor: 100 }],
      '2026-07-12'
    )
    expect(sin.desde).toBeNull()
    expect(sin.sinFechas).toBe(1)
    expect(sin.faseActual?.nombre).toBe('Etapa')
  })
})

describe('planAutomatico', () => {
  const plan = planAutomatico(ETAPAS, '2026-08-01', 30)

  it('es secuencial y sin huecos', () => {
    expect(plan[0].fecha_inicio).toBe('2026-08-01')
    expect(plan[1].fecha_inicio).toBe(sumarDias(plan[0].fecha_fin, 1))
    expect(plan[2].fecha_inicio).toBe(sumarDias(plan[1].fecha_fin, 1))
  })

  it('duración proporcional al valor (mínimo 3 días)', () => {
    const dur = (p: { fecha_inicio: string; fecha_fin: string }) =>
      (Date.parse(p.fecha_fin) - Date.parse(p.fecha_inicio)) / 86400000 + 1
    expect(dur(plan[2])).toBeGreaterThan(dur(plan[0]))   // 500k > 200k
    for (const p of plan) expect(dur(p)).toBeGreaterThanOrEqual(3)
  })
})

// tests/calendario-gantt.test.ts
// Feriados de Chile y Carta Gantt en días hábiles.
import { describe, it, expect } from 'vitest'
import { feriadosDelAnio, nombreFeriado } from '../lib/feriados-cl'
import {
  calcularGantt, contarLaborables, finDeTarea, motivoNoLaborable, planAutomatico, primerLaborable, rutaCritica,
} from '../lib/gantt'

const fechas = (y: number) => [...feriadosDelAnio(y).keys()].sort()

describe('feriados de Chile', () => {
  it('2026 completo', () => {
    expect(fechas(2026)).toEqual([
      '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29',
      '2026-07-16', '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01',
      '2026-12-08', '2026-12-25',
    ])
  })
  it('San Pedro y San Pablo y 12 de octubre pasan al lunes', () => {
    expect(nombreFeriado('2023-06-26')).toBe('San Pedro y San Pablo')      // jueves 29 → lunes 26
    expect(nombreFeriado('2023-06-29')).toBeNull()
    expect(nombreFeriado('2018-07-02')).toBe('San Pedro y San Pablo')      // viernes 29 → lunes 2
    expect(nombreFeriado('2023-10-09')).toBe('Encuentro de Dos Mundos')    // jueves 12 → lunes 9
    expect(nombreFeriado('2027-10-11')).toBe('Encuentro de Dos Mundos')    // martes 12 → lunes 11
  })
  it('Iglesias Evangélicas pasa a viernes', () => {
    expect(nombreFeriado('2023-10-27')).toBe('Iglesias Evangélicas')       // martes 31 → viernes 27
    expect(nombreFeriado('2018-11-02')).toBe('Iglesias Evangélicas')       // miércoles 31 → viernes 2
  })
  it('días adicionales de Fiestas Patrias y de Año Nuevo', () => {
    expect(nombreFeriado('2018-09-17')).not.toBeNull()   // 18 martes
    expect(nombreFeriado('2019-09-20')).not.toBeNull()   // 18 miércoles
    expect(nombreFeriado('2021-09-17')).not.toBeNull()   // 18 sábado
    expect(nombreFeriado('2027-09-17')).not.toBeNull()   // 18 sábado
    expect(nombreFeriado('2026-09-17')).toBeNull()       // 18 viernes
    expect(nombreFeriado('2023-01-02')).not.toBeNull()   // 1 de enero domingo
  })
  it('Semana Santa según la Pascua', () => {
    expect(nombreFeriado('2027-03-26')).toBe('Viernes Santo')
    expect(nombreFeriado('2025-04-18')).toBe('Viernes Santo')
  })
})

describe('días laborables', () => {
  it('lunes a viernes salta fin de semana y feriados', () => {
    expect(motivoNoLaborable('2026-11-07', 'lun_vie')).toBe('sábado')
    expect(motivoNoLaborable('2026-11-08', 'lun_vie')).toBe('domingo')
    expect(motivoNoLaborable('2026-12-08', 'lun_vie')).toBe('Inmaculada Concepción')
    expect(motivoNoLaborable('2026-11-09', 'lun_vie')).toBeNull()
  })
  it('lunes a sábado trabaja el sábado, salvo feriado', () => {
    expect(motivoNoLaborable('2026-11-07', 'lun_sab')).toBeNull()
    expect(motivoNoLaborable('2026-04-04', 'lun_sab')).toBe('Sábado Santo')
  })
  it('días corridos no salta nada', () => {
    expect(motivoNoLaborable('2026-12-25', 'corridos')).toBeNull()
  })
  it('cuenta, avanza y termina tareas', () => {
    expect(contarLaborables('2026-11-02', '2026-11-08', 'lun_vie')).toBe(5)
    expect(contarLaborables('2026-11-02', '2026-11-08', 'lun_sab')).toBe(6)
    expect(primerLaborable('2026-11-07', 'lun_vie')).toBe('2026-11-09')
    expect(finDeTarea('2026-11-06', 3, 'lun_vie')).toBe('2026-11-10')
    // 8 de diciembre es feriado: 5 días desde el lunes 7 terminan el lunes 14
    expect(finDeTarea('2026-12-07', 5, 'lun_vie')).toBe('2026-12-14')
  })
})

describe('Carta Gantt en días hábiles', () => {
  const tareas = [
    { id: 'a', nombre: 'Excavación', avance: 0, valor: 1, fecha_inicio: '2026-11-02', fecha_fin: '2026-11-06' },
    { id: 'b', nombre: 'Fundaciones', avance: 0, valor: 1, fecha_inicio: '2026-11-09', fecha_fin: '2026-11-13' },
  ]
  it('la dependencia salta el fin de semana sin correr la tarea', () => {
    const r = rutaCritica(tareas, [{ partida_id: 'b', depende_de_id: 'a' }], 'lun_vie')
    expect(r.ajustes).toEqual([])
    expect(r.duracion).toBe(10)
    expect(r.criticas).toEqual(['a', 'b'])
  })
  it('en días corridos la misma tarea tendría holgura de fin de semana', () => {
    const r = rutaCritica(tareas, [{ partida_id: 'b', depende_de_id: 'a' }], 'corridos')
    expect(r.porId.a.holgura).toBe(2)
  })
  it('el desfase se cuenta en días de trabajo', () => {
    const r = rutaCritica(tareas, [{ partida_id: 'b', depende_de_id: 'a', desfase_dias: 2 }], 'lun_vie')
    expect(r.ajustes).toEqual([{ id: 'b', fecha_inicio: '2026-11-11', fecha_fin: '2026-11-17' }])
  })
  it('al correr una tarea conserva sus días de trabajo y salta feriados', () => {
    const conFeriado = [
      { id: 'a', nombre: 'A', avance: 0, valor: 1, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-07' },
      { id: 'b', nombre: 'B', avance: 0, valor: 1, fecha_inicio: '2026-12-02', fecha_fin: '2026-12-04' },
    ]
    const r = rutaCritica(conFeriado, [{ partida_id: 'b', depende_de_id: 'a' }], 'lun_vie')
    expect(r.ajustes).toEqual([{ id: 'b', fecha_inicio: '2026-12-09', fecha_fin: '2026-12-11' }])
  })
  it('restantes y período en días hábiles', () => {
    const g = calcularGantt(tareas, '2026-11-06', 'lun_vie')
    expect(g.diasPeriodo).toBe(10)
    expect(g.diasRestantes).toBe(5)
    expect(g.etapas.map(e => e.dias)).toEqual([5, 5])
    expect(g.totalDias).toBe(12)
  })
  it('el plan automático no parte ni termina en día libre', () => {
    const plan = planAutomatico([{ id: 'x', nombre: 'X', avance: 0, valor: 1 }], '2026-11-07', 3, 'lun_vie')
    expect(plan).toEqual([{ id: 'x', fecha_inicio: '2026-11-09', fecha_fin: '2026-11-11' }])
  })
})

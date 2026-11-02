// tests/fase3.test.ts
// Ruta crítica, tareas de la Gantt, APU y flujo de caja (funciones puras).
import { describe, it, expect } from 'vitest'
import { creaCiclo, rutaCritica, tareasGantt } from '../lib/gantt'
import { calcularAPU } from '../lib/apu'
import { calcularFlujoCaja, mesSiguiente } from '../lib/flujo-caja'

const t = (id: string, fecha_inicio: string | null, fecha_fin: string | null) =>
  ({ id, nombre: id, avance: 0, valor: 0, fecha_inicio, fecha_fin })
const dep = (partida_id: string, depende_de_id: string, desfase_dias = 0) => ({ partida_id, depende_de_id, desfase_dias })

describe('rutaCritica', () => {
  // A (3 días) → B (5 días) → D (2 días), y A → C (2 días) → D
  const tareas = [
    t('A', '2026-11-01', '2026-11-03'),
    t('B', '2026-11-04', '2026-11-08'),
    t('C', '2026-11-04', '2026-11-05'),
    t('D', '2026-11-09', '2026-11-10'),
  ]
  const deps = [dep('B', 'A'), dep('C', 'A'), dep('D', 'B'), dep('D', 'C')]
  const r = rutaCritica(tareas, deps)

  it('encuentra la cadena más larga y la holgura de las demás', () => {
    expect(r.criticas).toEqual(['A', 'B', 'D'])
    expect(r.porId.C).toMatchObject({ holgura: 3, critica: false, duracion: 2 })
    expect(r.porId.B.holgura).toBe(0)
    expect(r).toMatchObject({ inicio: '2026-11-01', fin: '2026-11-10', duracion: 10, ciclo: false })
  })

  it('una tarea sin dependencias que termina antes de la entrega tiene holgura', () => {
    const x = rutaCritica([...tareas, t('X', '2026-11-01', '2026-11-02')], deps)
    expect(x.porId.X).toMatchObject({ holgura: 8, critica: false })
  })

  it('sin dependencias, solo es crítica la que termina al final', () => {
    const x = rutaCritica([t('A', '2026-11-01', '2026-11-03'), t('B', '2026-11-01', '2026-11-10')], [])
    expect(x.criticas).toEqual(['B'])
  })

  it('propone correr lo que parte antes que su dependencia, en cascada', () => {
    const x = rutaCritica([
      t('A', '2026-11-01', '2026-11-05'),
      t('B', '2026-11-03', '2026-11-04'),
      t('C', '2026-11-05', '2026-11-06'),
    ], [dep('B', 'A'), dep('C', 'B')])
    expect(x.ajustes).toEqual([
      { id: 'B', fecha_inicio: '2026-11-06', fecha_fin: '2026-11-07' },
      { id: 'C', fecha_inicio: '2026-11-08', fecha_fin: '2026-11-09' },
    ])
    expect(x.fin).toBe('2026-11-09')
  })

  it('no adelanta una tarea planificada después de su dependencia', () => {
    const x = rutaCritica([t('A', '2026-11-01', '2026-11-02'), t('B', '2026-11-10', '2026-11-11')], [dep('B', 'A')])
    expect(x.ajustes).toEqual([])
    expect(x.porId.A.holgura).toBe(7)
    expect(x.porId.B.critica).toBe(true)
  })

  it('respeta el desfase, positivo y negativo', () => {
    const base = [t('A', '2026-11-01', '2026-11-05'), t('B', '2026-11-01', '2026-11-02')]
    expect(rutaCritica(base, [dep('B', 'A', 2)]).porId.B.inicio_temprano).toBe('2026-11-08')
    expect(rutaCritica(base, [dep('B', 'A', -2)]).porId.B.inicio_temprano).toBe('2026-11-04')
    // La holgura de A también descuenta el desfase
    expect(rutaCritica(base, [dep('B', 'A', 2)]).porId.A.holgura).toBe(0)
  })

  it('cruza fin de mes y de año', () => {
    const x = rutaCritica([t('A', '2026-12-30', '2027-01-02'), t('B', '2026-12-30', '2026-12-31')], [dep('B', 'A')])
    expect(x.porId.A.duracion).toBe(4)
    expect(x.porId.B.inicio_temprano).toBe('2027-01-03')
    expect(x.fin).toBe('2027-01-04')
  })

  it('ignora tareas sin fechas, fechas invertidas y dependencias hacia ellas', () => {
    const x = rutaCritica([t('A', '2026-11-01', '2026-11-02'), t('B', null, null), t('C', '2026-11-05', '2026-11-01')], [dep('A', 'B'), dep('C', 'A')])
    expect(Object.keys(x.porId)).toEqual(['A'])
    expect(rutaCritica([t('B', null, null)], []).inicio).toBeNull()
  })

  it('detecta un ciclo sin colgarse', () => {
    const x = rutaCritica([t('A', '2026-11-01', '2026-11-02'), t('B', '2026-11-03', '2026-11-04')], [dep('A', 'B'), dep('B', 'A')])
    expect(x.ciclo).toBe(true)
    expect(x.criticas).toEqual([])
  })
})

describe('creaCiclo', () => {
  const deps = [dep('B', 'A'), dep('C', 'B')]
  it('rechaza cerrar la cadena, directa o indirectamente, y depender de sí misma', () => {
    expect(creaCiclo(deps, 'A', 'C')).toBe(true)
    expect(creaCiclo(deps, 'A', 'B')).toBe(true)
    expect(creaCiclo(deps, 'A', 'A')).toBe(true)
  })
  it('permite lo que no cierra nada', () => {
    expect(creaCiclo(deps, 'C', 'A')).toBe(false)
    expect(creaCiclo(deps, 'D', 'C')).toBe(false)
  })
})

describe('tareasGantt', () => {
  const partidas = [
    { id: 'G', descripcion: 'Obra gruesa', es_grupo: true, orden: 1, avance: 40, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02' },
    { id: 'S', parent_id: 'G', descripcion: 'Sub', es_grupo: true, orden: 1 },
    { id: 'H1', parent_id: 'S', descripcion: 'Hormigón', orden: 1, cantidad: 2, precio_unitario: 100, fecha_inicio: '2026-11-05', fecha_fin: '2026-11-08', avance: 50 },
    { id: 'H2', parent_id: 'G', descripcion: 'Moldaje', orden: 2, cantidad: 1, precio_unitario: 50, fecha_inicio: '2026-11-01', fecha_fin: '2026-11-03' },
    { id: 'R', descripcion: 'Limpieza', orden: 2, cantidad: 1, precio_unitario: 10 },
    { id: 'V', descripcion: 'Grupo vacío', es_grupo: true, orden: 3, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-02' },
  ]
  it('etapas: las fechas salen de sus partidas, y sin ellas quedan las propias', () => {
    const e = tareasGantt(partidas, 'etapas')
    expect(e.map(x => x.id)).toEqual(['G', 'V'])
    expect(e[0]).toMatchObject({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-08', valor: 250, derivada: true, avance: 40 })
    expect(e[1]).toMatchObject({ fecha_inicio: '2026-12-01', derivada: false })
  })
  it('partidas: solo hojas, en orden de árbol y con su etapa', () => {
    const p = tareasGantt(partidas, 'partidas')
    expect(p.map(x => x.id)).toEqual(['H1', 'H2', 'R', 'V'])
    expect(p[0]).toMatchObject({ grupo: 'Obra gruesa', valor: 200, avance: 50 })
    expect(p[2].grupo).toBeNull()
  })
})

describe('calcularAPU', () => {
  const partida = { cantidad: 100, rendimiento_dia: 20 }
  const materiales = [{ rendimiento: 0.5, precio_unitario: 4000 }, { rendimiento: 2, precio_unitario: 100 }]
  const recursos = [
    { tipo: 'mano_obra', cantidad: 2, costo_dia: 40000 },
    { tipo: 'mano_obra', cantidad: 1, costo_dia: 60000 },
    { tipo: 'equipo', cantidad: 1, costo_dia: 20000 },
    { tipo: 'otro', cantidad: 1, costo_dia: 10000 },
  ]
  it('lleva la cuadrilla y los equipos a la unidad con el rendimiento', () => {
    expect(calcularAPU(partida, materiales, recursos, 25)).toEqual({
      material: 2200, mano_obra: 7000, equipo: 1000, otro: 500,
      costo_material_unit: 3700, costo_mo_unit: 7000, costo_unitario: 10700,
      precio_unitario: 13375, duracion_dias: 5, falta_rendimiento: false,
    })
  })
  it('redondea los días hacia arriba', () => {
    expect(calcularAPU({ cantidad: 101, rendimiento_dia: 20 }, [], [], 0).duracion_dias).toBe(6)
  })
  it('sin rendimiento no inventa costo de cuadrilla, y lo avisa', () => {
    const a = calcularAPU({ cantidad: 10 }, materiales, recursos, 0)
    expect(a).toMatchObject({ mano_obra: 0, costo_unitario: 2200, falta_rendimiento: true, duracion_dias: null })
  })
  it('solo con materiales no pide rendimiento', () => {
    expect(calcularAPU({ cantidad: 10 }, materiales, [], 0).falta_rendimiento).toBe(false)
  })
})

describe('calcularFlujoCaja', () => {
  const base = {
    proyecto: { inicio: '2026-09-10', fin: '2027-01-31', anticipo: 100, monto_contrato: 1000 },
    eps: [] as any[], devoluciones: [] as any[], gastos: [] as any[], docs: [] as any[], proyeccionMO: [] as any[],
    presupuestoCosto: 0, gastoReal: 0, hoy: '2026-10-30',
  }

  it('mesSiguiente cruza el año', () => {
    expect(mesSiguiente('2026-12')).toBe('2027-01')
    expect(mesSiguiente('2026-09')).toBe('2026-10')
  })

  it('separa real y proyección, con saldo acumulado continuo', () => {
    const { filas, resumen } = calcularFlujoCaja({
      ...base,
      eps: [
        { estado: 'pagado', fecha: '2026-09-30', bruto: 200, monto_pagar: 150, retencion_monto: 10, anticipo_desc: 40 },
        { estado: 'borrador', fecha: '2026-10-01', bruto: 999, monto_pagar: 999 },
      ],
      gastos: [{ monto: 80, fecha: '2026-09-15' }, { monto: 20, fecha: '2026-10-05' }],
      docs: [
        { doc_tipo: 'factura', neto: 50, emision: '2026-10-07' },
        { doc_tipo: 'nota_credito', neto: 10, emision: '2026-10-08' },
      ],
      presupuestoCosto: 700, gastoReal: 140, hoy: '2026-10-30',
    })
    expect(filas.map(f => f.mes)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(filas[0]).toMatchObject({ entradas: 250, salidas: 80, saldo: 170, proyectado: false })
    expect(filas[1]).toMatchObject({ entradas: 0, salidas: 60, saldo: 110, proyectado: false })
    // Falta facturar 1000 − 200 − (100 − 40) = 740; costo restante 700 − 140 = 560
    expect(filas.slice(2).map(f => f.salidas)).toEqual([187, 187, 186])
    expect(resumen.entradas_proyectadas).toBe(740 + 10)   // más la retención por devolver
    expect(filas[4].entradas).toBe(246 + 10)
    expect(resumen).toMatchObject({ saldo_actual: 110, salidas_proyectadas: 560, sin_horizonte: false })
    expect(resumen.saldo_final).toBe(110 + 750 - 560)
  })

  it('el saldo final con obra terminada es contrato menos costo', () => {
    const { resumen } = calcularFlujoCaja({ ...base, proyecto: { ...base.proyecto, anticipo: 0 }, presupuestoCosto: 700 })
    expect(resumen.saldo_final).toBe(300)
  })

  it('un EP presentado o aprobado entra el mes siguiente; no se factura dos veces', () => {
    const { filas } = calcularFlujoCaja({
      ...base, proyecto: { ...base.proyecto, anticipo: 0, fin: '2026-12-15' },
      eps: [{ estado: 'aprobado', fecha: '2026-10-20', bruto: 400, monto_pagar: 380, retencion_monto: 20, anticipo_desc: 0 }],
    })
    expect(filas.find(f => f.mes === '2026-11')?.entradas).toBe(380 + 300)
    expect(filas.find(f => f.mes === '2026-12')?.entradas).toBe(300 + 20)
    expect(filas.reduce((s, f) => s + f.entradas, 0)).toBe(1000)
  })

  it('la mano de obra proyectada cae en su mes y no se cuenta dos veces', () => {
    const { filas, resumen } = calcularFlujoCaja({
      ...base, proyecto: { ...base.proyecto, anticipo: 0, monto_contrato: 0, valor: 0, fin: '2026-12-31' },
      proyeccionMO: [
        { mes: '2026-10', dotacion: 9, costo_unitario: 100 },              // ya pasó: no cuenta
        { mes: '2026-12', dotacion: 2, costo_unitario: 100, finiquito: 50 },
      ],
      presupuestoCosto: 650,
    })
    expect(filas.find(f => f.mes === '2026-11')?.salidas).toBe(200)
    expect(filas.find(f => f.mes === '2026-12')?.salidas).toBe(450)
    expect(resumen.salidas_proyectadas).toBe(650)
  })

  it('no proyecta si el gasto ya superó el presupuesto', () => {
    const { resumen } = calcularFlujoCaja({ ...base, presupuestoCosto: 100, gastoReal: 500 })
    expect(resumen.salidas_proyectadas).toBe(0)
  })

  it('sin fecha de término no inventa meses, y lo avisa', () => {
    const { filas, resumen } = calcularFlujoCaja({ ...base, proyecto: { ...base.proyecto, fin: null }, gastos: [{ monto: 5, fecha: '2026-10-01' }] })
    expect(filas.every(f => !f.proyectado)).toBe(true)
    expect(resumen.sin_horizonte).toBe(true)
  })

  it('una obra terminada al día no avisa falta de horizonte', () => {
    const { resumen } = calcularFlujoCaja({
      ...base, proyecto: { inicio: '2026-01-01', fin: '2026-02-01', anticipo: 0, monto_contrato: 100 },
      eps: [{ estado: 'pagado', fecha: '2026-02-01', bruto: 100, monto_pagar: 100 }],
      presupuestoCosto: 50, gastoReal: 50, gastos: [{ monto: 50, fecha: '2026-01-15' }],
    })
    expect(resumen.sin_horizonte).toBe(false)
  })

  it('encuentra el peor mes de caja', () => {
    const { resumen } = calcularFlujoCaja({
      ...base, proyecto: { inicio: '2026-09-01', fin: null, anticipo: 0 },
      gastos: [{ monto: 300, fecha: '2026-09-15' }],
      eps: [{ estado: 'pagado', fecha: '2026-10-15', bruto: 500, monto_pagar: 500 }],
    })
    expect(resumen).toMatchObject({ saldo_minimo: -300, mes_saldo_minimo: '2026-09', saldo_actual: 200 })
  })

  it('sin datos devuelve vacío', () => {
    const { filas, resumen } = calcularFlujoCaja({ ...base, proyecto: {} })
    expect(filas).toEqual([])
    expect(resumen.mes_saldo_minimo).toBeNull()
  })
})

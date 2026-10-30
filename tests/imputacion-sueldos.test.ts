// tests/imputacion-sueldos.test.ts
// Reparto de sueldos entre obras: función pura y sincronización contra una BD en memoria.
import { describe, it, expect } from 'vitest'
import { repartirCosto, sincronizarGastoSueldo, reimputarSueldos } from '../lib/imputacion-sueldos'
import { aportesEmpleador, REM_DEFAULTS } from '../types/finanzas'

describe('repartirCosto', () => {
  it('reparte proporcional a las horas', () => {
    const t = repartirCosto(1000, [
      { proyecto_id: 'A', horas: 30 },
      { proyecto_id: 'B', horas: 10 },
    ])
    expect(t.find(x => x.proyecto_id === 'A')!.monto).toBe(750)
    expect(t.find(x => x.proyecto_id === 'B')!.monto).toBe(250)
  })

  it('los tramos suman exacto el costo, sin perder pesos por redondeo', () => {
    const t = repartirCosto(1000, [
      { proyecto_id: 'A', horas: 1 },
      { proyecto_id: 'B', horas: 1 },
      { proyecto_id: 'C', horas: 1 },
    ])
    expect(t.reduce((s, x) => s + x.monto, 0)).toBe(1000)
    expect(t.map(x => x.monto).sort()).toEqual([333, 333, 334])
  })

  it('agrupa las horas de una misma obra y partida, y separa las partidas', () => {
    const t = repartirCosto(900, [
      { proyecto_id: 'A', partida_id: 'p1', horas: 4 },
      { proyecto_id: 'A', partida_id: 'p1', horas: 4 },
      { proyecto_id: 'A', partida_id: 'p2', horas: 8 },
      { proyecto_id: 'A', partida_id: null, horas: 8 },
    ])
    expect(t).toHaveLength(3)
    expect(t.every(x => x.monto === 300)).toBe(true)
  })

  it('sin horas va completo a la obra asignada', () => {
    expect(repartirCosto(500, [], 'A')).toEqual([{ proyecto_id: 'A', partida_id: null, horas: 0, monto: 500 }])
  })

  it('sin horas ni obra asignada no imputa, igual que hoy', () => {
    expect(repartirCosto(500, [], null)).toEqual([])
  })

  it('con horas, ignora la obra asignada', () => {
    const t = repartirCosto(500, [{ proyecto_id: 'B', horas: 8 }], 'A')
    expect(t.map(x => x.proyecto_id)).toEqual(['B'])
  })

  it('costo cero o negativo no genera gasto', () => {
    expect(repartirCosto(0, [{ proyecto_id: 'A', horas: 8 }])).toEqual([])
    expect(repartirCosto(-5, [], 'A')).toEqual([])
  })
})

describe('aportesEmpleador', () => {
  const params = { ...REM_DEFAULTS, uf_valor: 40000, afc_empleador_pct: 2.4, afc_empleador_plazo_pct: 3, sis_pct: 2, cotizacion_empleador_pct: 3, mutual_pct: 1, tope_afc_uf: 100 }
  const liq = { total_imponible: 1_000_000, total_haberes: 1_100_000, colacion: 60_000, movilizacion: 40_000 }

  it('calcula cada aporte sobre su base', () => {
    expect(aportesEmpleador(liq, 'indefinido', params)).toEqual({
      afc: 24_000, sis: 20_000, cotizacion: 30_000, mutual: 10_000, total: 84_000,
    })
  })

  it('el contrato a plazo o por obra paga más AFC', () => {
    expect(aportesEmpleador(liq, 'obra_faena', params).afc).toBe(30_000)
    expect(aportesEmpleador(liq, 'plazo_fijo', params).afc).toBe(30_000)
  })

  it('AFC respeta su tope propio', () => {
    const alto = { total_imponible: 3_500_000, total_haberes: 9_000_000 }
    expect(aportesEmpleador(alto, 'indefinido', params).afc).toBe(96_000) // tope 100 UF × 2,4%
    expect(aportesEmpleador(alto, 'indefinido', params).sis).toBe(70_000) // la base ya viene topada
  })

  it('funciona con parámetros guardados antes de la migración 41', () => {
    const { sis_pct, cotizacion_empleador_pct, mutual_pct, afc_empleador_plazo_pct, ...antiguos } = REM_DEFAULTS
    expect(aportesEmpleador(liq, 'indefinido', antiguos).total).toBeGreaterThan(0)
  })
})

// ─── BD en memoria: lo justo del cliente de Supabase que usa la sincronización ───
function bdFalsa(tablas: Record<string, any[]>) {
  let sec = 100
  class Q {
    filtros: ((r: any) => boolean)[] = []
    op: 'select' | 'update' | 'delete' | 'insert' = 'select'
    valor: any
    constructor(private tabla: string) {}
    select() { return this }
    update(v: any) { this.op = 'update'; this.valor = v; return this }
    delete() { this.op = 'delete'; return this }
    insert(v: any) { this.op = 'insert'; this.valor = v; return this }
    eq(c: string, v: any) { this.filtros.push(r => r[c] === v); return this }
    gte(c: string, v: any) { this.filtros.push(r => r[c] >= v); return this }
    lt(c: string, v: any) { this.filtros.push(r => r[c] < v); return this }
    in(c: string, v: any[]) { this.filtros.push(r => v.includes(r[c])); return this }
    maybeSingle() { return Promise.resolve({ data: this.correr()[0] ?? null, error: null }) }
    then(ok: any, ko: any) { return Promise.resolve({ data: this.correr(), error: null }).then(ok, ko) }
    correr() {
      const filas = tablas[this.tabla] ?? (tablas[this.tabla] = [])
      if (this.op === 'insert') { filas.push({ id: `g${++sec}`, ...this.valor }); return [] }
      const hit = filas.filter(r => this.filtros.every(f => f(r)))
      if (this.op === 'update') hit.forEach(r => Object.assign(r, this.valor))
      if (this.op === 'delete') tablas[this.tabla] = filas.filter(r => !hit.includes(r))
      return hit
    }
  }
  return { from: (t: string) => new Q(t), tablas }
}

describe('sincronizarGastoSueldo', () => {
  const OWNER = 'org'
  const params = { user_id: OWNER, sis_pct: 0, cotizacion_empleador_pct: 0, mutual_pct: 0, afc_empleador_pct: 0, afc_empleador_plazo_pct: 0 }
  const liq = { id: 'L1', empleado_id: 'E1', periodo: '2026-09', total_haberes: 1000, total_imponible: 1000 }
  const base = () => ({
    empleados: [{ id: 'E1', user_id: OWNER, nombre: 'Ana', proyecto_id: 'A', contrato_tipo: 'indefinido' }],
    parametros_remuneracion: [params],
    parte_diario: [] as any[],
    gastos_obra: [] as any[],
    liquidaciones: [{ ...liq, user_id: OWNER }],
  })
  const parte = (proyecto_id: string, horas: number, fecha = '2026-09-10', partida_id: string | null = null) =>
    ({ empleado_id: 'E1', user_id: OWNER, proyecto_id, partida_id, horas, fecha })

  it('sin partes conserva el comportamiento anterior: todo a la obra asignada', async () => {
    const db = bdFalsa(base())
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra).toHaveLength(1)
    expect(db.tablas.gastos_obra[0]).toMatchObject({ proyecto_id: 'A', partida_id: null, monto: 1000, categoria: 'mano_obra', fecha: '2026-09-01' })
  })

  it('el costo incluye los aportes del empleador', async () => {
    const d = base()
    d.parametros_remuneracion = [{ ...params, sis_pct: 10 }]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra[0].monto).toBe(1100)
  })

  it('con partes reparte entre obras, y solo cuenta las horas del período', async () => {
    const d = base()
    d.parte_diario = [parte('A', 6), parte('B', 2), parte('C', 8, '2026-10-01'), parte('C', 8, '2026-08-31')]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    const monto = (p: string) => db.tablas.gastos_obra.find(g => g.proyecto_id === p)?.monto
    expect(monto('A')).toBe(750)
    expect(monto('B')).toBe(250)
    expect(monto('C')).toBeUndefined()
  })

  it('al repetir no duplica; al cambiar las horas ajusta y borra lo obsoleto', async () => {
    const d = base()
    d.parte_diario = [parte('A', 4), parte('B', 4)]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra).toHaveLength(2)

    const idA = db.tablas.gastos_obra.find(g => g.proyecto_id === 'A')!.id
    db.tablas.parte_diario = [parte('A', 8)]
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra).toHaveLength(1)
    expect(db.tablas.gastos_obra[0]).toMatchObject({ id: idA, proyecto_id: 'A', monto: 1000 })
  })

  it('migra el gasto antiguo de la liquidación en vez de duplicarlo', async () => {
    const d = base()
    d.gastos_obra = [{ id: 'viejo', liquidacion_id: 'L1', user_id: OWNER, proyecto_id: 'A', partida_id: null, monto: 1, categoria: 'mano de obra' }]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra).toHaveLength(1)
    expect(db.tablas.gastos_obra[0]).toMatchObject({ id: 'viejo', monto: 1000, categoria: 'mano_obra' })
  })

  it('elimina filas repetidas de un mismo tramo', async () => {
    const d = base()
    d.gastos_obra = [
      { id: 'g1', liquidacion_id: 'L1', user_id: OWNER, proyecto_id: 'A', partida_id: null, monto: 5 },
      { id: 'g2', liquidacion_id: 'L1', user_id: OWNER, proyecto_id: 'A', partida_id: null, monto: 5 },
    ]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra.map(g => g.id)).toEqual(['g1'])
  })

  it('sin partes ni obra asignada retira el gasto que hubiera', async () => {
    const d = base()
    d.empleados[0].proyecto_id = null as any
    d.gastos_obra = [{ id: 'g1', liquidacion_id: 'L1', user_id: OWNER, proyecto_id: 'A', partida_id: null, monto: 5 }]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra).toHaveLength(0)
  })

  it('no toca los gastos de otra liquidación', async () => {
    const d = base()
    d.gastos_obra = [{ id: 'otro', liquidacion_id: 'L2', user_id: OWNER, proyecto_id: 'Z', partida_id: null, monto: 5 }]
    const db = bdFalsa(d)
    await sincronizarGastoSueldo(db, OWNER, liq)
    expect(db.tablas.gastos_obra.find(g => g.id === 'otro')).toBeTruthy()
  })
})

describe('reimputarSueldos', () => {
  it('recalcula solo los empleados y el período indicados', async () => {
    const OWNER = 'org'
    const db = bdFalsa({
      empleados: [{ id: 'E1', user_id: OWNER, nombre: 'Ana', proyecto_id: 'A' }, { id: 'E2', user_id: OWNER, nombre: 'Luz', proyecto_id: 'A' }],
      parametros_remuneracion: [{ user_id: OWNER, sis_pct: 0, cotizacion_empleador_pct: 0, mutual_pct: 0, afc_empleador_plazo_pct: 0 }],
      parte_diario: [],
      gastos_obra: [],
      liquidaciones: [
        { id: 'L1', user_id: OWNER, empleado_id: 'E1', periodo: '2026-09', total_haberes: 100, total_imponible: 100 },
        { id: 'L2', user_id: OWNER, empleado_id: 'E2', periodo: '2026-09', total_haberes: 100, total_imponible: 100 },
        { id: 'L3', user_id: OWNER, empleado_id: 'E1', periodo: '2026-08', total_haberes: 100, total_imponible: 100 },
      ],
    })
    await reimputarSueldos(db, OWNER, ['E1'], '2026-09')
    expect(db.tablas.gastos_obra.map(g => g.liquidacion_id)).toEqual(['L1'])
  })
})

// tests/fase2.test.ts
// Recepción, conciliación, bodega y subcontratos (funciones puras).
import { describe, it, expect } from 'vitest'
import {
  conciliar, estadoSegunRecepciones, gastosDeOC, pendientes, pesosFacturaPorPartida,
  recibidoPorLinea, validarEdicionLineas, validarRecepcion,
} from '../lib/recepciones'
import { calcularStock, materialQueQuedaNegativo, partidaUnicaDeEntradas, stockDe } from '../lib/bodega'
import { calcularEP, epCuentaComoGasto, resumenSubcontrato } from '../lib/subcontratos'
import { calcularCostosObra } from '../lib/costos'
import { aplicarGastos } from '../lib/gastos-server'

const lineas = [
  { id: 'A', material: 'Cemento', unidad: 'saco', cantidad: 10, precio_unitario: 1000, partida_id: 'P1' },
  { id: 'B', material: 'Fierro', unidad: 'kg', cantidad: 5, precio_unitario: 2000, partida_id: null },
]

describe('recepción por línea', () => {
  it('acumula lo recibido sin arrastrar decimales de punto flotante', () => {
    expect(recibidoPorLinea([{ linea_id: 'A', cantidad: 0.1 }, { linea_id: 'A', cantidad: 0.2 }]).A).toBe(0.3)
  })

  it('rechaza recibir de más, cantidades inválidas y líneas ajenas', () => {
    expect(validarRecepcion(lineas, [], [])).toMatch(/al menos/)
    expect(validarRecepcion(lineas, [], [{ linea_id: 'A', cantidad: 11 }])).toMatch(/pendientes/)
    expect(validarRecepcion(lineas, [{ linea_id: 'A', cantidad: 8 }], [{ linea_id: 'A', cantidad: 3 }])).toMatch(/2 pendientes/)
    expect(validarRecepcion(lineas, [], [{ linea_id: 'A', cantidad: 0 }])).toMatch(/mayor que 0/)
    expect(validarRecepcion(lineas, [], [{ linea_id: 'Z', cantidad: 1 }])).toMatch(/no pertenece/)
    expect(validarRecepcion(lineas, [], [{ linea_id: 'A', cantidad: 1 }, { linea_id: 'A', cantidad: 1 }])).toMatch(/repetida/)
    expect(validarRecepcion(lineas, [], [{ linea_id: 'A', cantidad: 10 }])).toBeNull()
  })

  it('el estado se deriva de lo recibido', () => {
    expect(estadoSegunRecepciones('enviada', lineas, [])).toBe('enviada')
    expect(estadoSegunRecepciones('enviada', lineas, [{ linea_id: 'A', cantidad: 1 }])).toBe('parcial')
    expect(estadoSegunRecepciones('parcial', lineas, [{ linea_id: 'A', cantidad: 10 }, { linea_id: 'B', cantidad: 5 }])).toBe('recibida')
    expect(estadoSegunRecepciones('recibida', lineas, [])).toBe('enviada') // se revirtió todo
    expect(pendientes(lineas, [{ linea_id: 'A', cantidad: 4 }])).toEqual([
      { linea_id: 'A', cantidad: 6 }, { linea_id: 'B', cantidad: 5 },
    ])
  })

  it('el gasto es lo recibido por partida, y la línea manda sobre la cabecera', () => {
    const oc = { proyecto_id: 'O', partida_id: 'P2', fecha: '2026-10-01' }
    const g = gastosDeOC(oc, lineas, [
      { linea_id: 'A', cantidad: 2, fecha: '2026-10-05' },
      { linea_id: 'B', cantidad: 1, fecha: '2026-10-09' },
    ])
    expect(g).toEqual([
      { partida_id: 'P1', monto: 2000, proyecto_id: 'O', fecha: '2026-10-09' },
      { partida_id: 'P2', monto: 2000, proyecto_id: 'O', fecha: '2026-10-09' },
    ])
  })

  it('sin obra, anulada, facturada o sin recibir no hay gasto', () => {
    const r = [{ linea_id: 'A', cantidad: 2 }]
    expect(gastosDeOC({ proyecto_id: null }, lineas, r)).toEqual([])
    expect(gastosDeOC({ proyecto_id: 'O', estado: 'anulada' }, lineas, r)).toEqual([])
    expect(gastosDeOC({ proyecto_id: 'O', factura_id: 'F' }, lineas, r)).toEqual([])
    expect(gastosDeOC({ proyecto_id: 'O' }, lineas, [])).toEqual([])
  })

  it('no deja editar por debajo de lo recibido', () => {
    const r = [{ linea_id: 'A', cantidad: 4 }]
    const b = lineas[1]
    expect(validarEdicionLineas(lineas, r, [b as any])).toMatch(/revierte/)
    expect(validarEdicionLineas(lineas, r, [{ ...lineas[0], cantidad: 3 } as any, b as any])).toMatch(/ya se recibieron 4/)
    expect(validarEdicionLineas(lineas, r, [{ ...lineas[0], precio_unitario: 1 } as any, b as any])).toMatch(/precio/)
    expect(validarEdicionLineas(lineas, r, [{ ...lineas[0], cantidad: 20 } as any, { ...b, cantidad: 1 } as any])).toBeNull()
  })
})

describe('conciliación', () => {
  const orden = { neto: 20000, lineas, recepciones: [{ linea_id: 'A', cantidad: 10 }] }
  it('compara la factura contra lo recibido', () => {
    expect(conciliar([orden], null).estado).toBe('sin_factura')
    expect(conciliar([orden], 10000)).toMatchObject({ estado: 'cuadra', diferencia: 0, recibido: 10000, neto_oc: 20000 })
    expect(conciliar([orden], 10005).estado).toBe('cuadra')
    expect(conciliar([orden], 12000)).toMatchObject({ estado: 'factura_mayor', diferencia: 2000 })
    expect(conciliar([orden], 9000)).toMatchObject({ estado: 'factura_menor', diferencia: -1000 })
  })
  it('una factura puede pagar varias órdenes', () => {
    expect(conciliar([orden, orden], 20000).estado).toBe('cuadra')
  })
  it('reparte la factura según lo recibido; sin recepciones, según lo pedido', () => {
    expect(pesosFacturaPorPartida([{ lineas, recepciones: [{ linea_id: 'A', cantidad: 1 }] }]))
      .toEqual([{ partida_id: 'P1', peso: 1000 }])
    expect(pesosFacturaPorPartida([{ lineas, recepciones: [] }]))
      .toEqual([{ partida_id: 'P1', peso: 10000 }, { partida_id: null, peso: 10000 }])
  })
})

describe('factura repartida en el consumo por partida', () => {
  const partidas = [
    { id: 'P1', descripcion: 'Uno', cantidad: 1, costo_unitario: 100 },
    { id: 'P2', descripcion: 'Dos', cantidad: 1, costo_unitario: 100 },
  ]
  const pesos = { F: [{ partida_id: 'P1', peso: 3 }, { partida_id: 'P2', peso: 1 }] }
  const docs = [
    { id: 'F', doc_tipo: 'factura', proyecto_id: 'O', neto: 400 },
    { id: 'N', doc_tipo: 'nota_credito', proyecto_id: 'O', factura_ref: 'F', neto: 40 },
  ]
  const gastado = (c: any, id: string) => c.detalle_partidas.find((d: any) => d.id === id).gastado

  it('reparte con su peso y la nota sigue a la factura', () => {
    const c = calcularCostosObra({ id: 'O' }, partidas, [], docs, pesos)
    expect(gastado(c, 'P1')).toBe(270)
    expect(gastado(c, 'P2')).toBe(90)
    expect(c.gasto_sin_partida).toBe(0)
  })
  it('la partida propia de la factura manda', () => {
    const c = calcularCostosObra({ id: 'O' }, partidas, [], [{ ...docs[0], partida_id: 'P2' }], pesos)
    expect(gastado(c, 'P2')).toBe(400)
    expect(gastado(c, 'P1')).toBe(0)
  })
  it('lo que no tiene partida en la OC queda sin partida', () => {
    const c = calcularCostosObra({ id: 'O' }, partidas, [], [docs[0]], { F: [{ partida_id: 'P1', peso: 1 }, { partida_id: null, peso: 1 }] })
    expect(gastado(c, 'P1')).toBe(200)
    expect(c.gasto_sin_partida).toBe(200)
  })
  it('desglosa subcontratos, equipos y traspasos sin contarlos como manuales', () => {
    const c = calcularCostosObra({ id: 'O' }, [], [
      { proyecto_id: 'O', monto: 1, subcontrato_ep_id: 'E' },
      { proyecto_id: 'O', monto: 2, equipo_uso_id: 'U' },
      { proyecto_id: 'O', monto: -3, traspaso_id: 'T' },
      { proyecto_id: 'O', monto: 10 },
    ], [])
    expect(c).toMatchObject({ gasto_subcontratos: 1, gasto_equipos: 2, gasto_traspasos: -3, gasto_manual: 10, gasto_real: 10 })
  })
})

describe('bodega', () => {
  const m = (material: string, cantidad: number, costo_unitario = 0, fecha = '2026-10-01', id?: string) =>
    ({ id, material, unidad: 'saco', cantidad, costo_unitario, fecha })

  it('calcula stock y costo promedio ponderado', () => {
    const [l] = calcularStock([m('Cemento', 10, 1000, '2026-10-01'), m('Cemento', -5, 0, '2026-10-02'), m('Cemento', 5, 2000, '2026-10-03')])
    expect(l).toMatchObject({ stock: 10, costo_promedio: 1500, valor: 15000, consumido: 5 })
  })
  it('junta el mismo material aunque cambien mayúsculas o espacios', () => {
    expect(calcularStock([m('Cemento', 1), m(' cemento ', 2), m('CEMENTO', -1)])).toHaveLength(1)
    expect(stockDe([m('Cemento', 1), m('cemento', 2)], 'CEMENTO', 'saco')?.stock).toBe(3)
    expect(stockDe([m('Cemento', 1)], 'Arena', 'saco')).toBeNull()
  })
  it('distingue el material por unidad', () => {
    expect(calcularStock([{ material: 'Arena', unidad: 'm3', cantidad: 1 }, { material: 'Arena', unidad: 'saco', cantidad: 1 }])).toHaveLength(2)
  })
  it('una entrada sin costo no baja el promedio', () => {
    expect(calcularStock([m('C', 10, 1000), m('C', 10, 0)])[0]).toMatchObject({ stock: 20, costo_promedio: 1000, valor: 20000 })
  })
  it('el traspaso devuelve el costo a la partida solo si las entradas vienen de una', () => {
    const e = (partida_id: string | null) => ({ material: 'C', unidad: 'saco', cantidad: 1, tipo: 'entrada', partida_id })
    expect(partidaUnicaDeEntradas([e('P1'), e('P1'), { ...e('P2'), tipo: 'consumo' }], 'c', 'saco')).toBe('P1')
    expect(partidaUnicaDeEntradas([e('P1'), e('P2')], 'C', 'saco')).toBeNull()
    expect(partidaUnicaDeEntradas([e('P1'), e(null)], 'C', 'saco')).toBeNull()
    expect(partidaUnicaDeEntradas([e('P1')], 'Arena', 'saco')).toBeNull()
  })
  it('detecta cuando revertir una entrada deja stock negativo', () => {
    const movs = [m('C', 10, 100, '2026-10-01', 'e'), m('C', -8, 0, '2026-10-02', 'c')]
    expect(materialQueQuedaNegativo(movs, ['e'])).toBe('C')
    expect(materialQueQuedaNegativo(movs, ['c'])).toBeNull()
    expect(materialQueQuedaNegativo([m('C', 10, 100, '2026-10-01', 'e')], ['e'])).toBeNull()
  })
})

describe('subcontratos', () => {
  const sub = { monto_contrato: 1_000_000, retencion_pct: 5, anticipo: 100_000 }
  const ep = (avance: number, previos: any[] = []) => calcularEP(sub, previos, avance) as any

  it('calcula bruto, retención y amortización del anticipo', () => {
    expect(ep(30)).toEqual({ bruto: 300_000, retencion: 15_000, anticipo_desc: 30_000, neto: 255_000, avance_acumulado: 30 })
  })
  it('un EP siguiente cobra solo la diferencia de avance', () => {
    const uno = ep(30)
    expect(ep(50, [uno])).toEqual({ bruto: 200_000, retencion: 10_000, anticipo_desc: 20_000, neto: 170_000, avance_acumulado: 50 })
  })
  it('al 100% lo cobrado suma exacto el contrato y el anticipo, sin perder pesos', () => {
    const s = { monto_contrato: 1_000_001, retencion_pct: 5, anticipo: 100_003 }
    const a = calcularEP(s, [], 33.33) as any
    const b = calcularEP(s, [a], 66.67) as any
    const c = calcularEP(s, [a, b], 100) as any
    expect(a.bruto + b.bruto + c.bruto).toBe(1_000_001)
    expect(a.anticipo_desc + b.anticipo_desc + c.anticipo_desc).toBe(100_003)
  })
  it('rechaza avances inválidos o que no suben', () => {
    expect(ep(0).error).toBeTruthy()
    expect(ep(101).error).toBeTruthy()
    expect(ep(30, [ep(30)]).error).toMatch(/30%/)
  })
  it('solo los EP aprobados o pagados sin factura son gasto', () => {
    expect(epCuentaComoGasto({ estado: 'borrador' })).toBe(false)
    expect(epCuentaComoGasto({ estado: 'aprobado' })).toBe(true)
    expect(epCuentaComoGasto({ estado: 'pagado' })).toBe(true)
    expect(epCuentaComoGasto({ estado: 'pagado', factura_id: 'F' })).toBe(false)
  })
  it('resume el contrato sin contar los borradores', () => {
    const a = { ...ep(30), estado: 'pagado' }
    const b = { ...ep(50, [a]), estado: 'aprobado' }
    const c = { ...ep(60, [a, b]), estado: 'borrador' }
    expect(resumenSubcontrato({ ...sub, retencion_devuelta: 5_000 }, [a, b, c])).toEqual({
      avance: 50, ejecutado: 500_000, saldo_contrato: 500_000, pagado: 255_000, por_pagar: 170_000,
      retenido: 25_000, retencion_saldo: 20_000, anticipo_amortizado: 50_000, anticipo_saldo: 50_000,
    })
  })
})

describe('aplicarGastos', () => {
  function bd(filas: any[]) {
    const tablas: any = { gastos_obra: filas }
    let n = 0
    const q = () => {
      const f: ((r: any) => boolean)[] = []
      let op = 'select', val: any
      const hit = () => tablas.gastos_obra.filter((r: any) => f.every(x => x(r)))
      const api: any = {
        select: () => api, eq: (c: string, v: any) => { f.push(r => r[c] === v); return api },
        in: (c: string, v: any[]) => { f.push(r => v.includes(r[c])); return api },
        update: (v: any) => { op = 'update'; val = v; return api }, delete: () => { op = 'delete'; return api },
        insert: (v: any) => { op = 'insert'; val = v; return api },
        then: (ok: any) => {
          if (op === 'insert') tablas.gastos_obra.push({ id: `n${++n}`, ...val })
          if (op === 'update') hit().forEach((r: any) => Object.assign(r, val))
          let data = hit()
          if (op === 'delete') { tablas.gastos_obra = tablas.gastos_obra.filter((r: any) => !data.includes(r)); data = [] }
          return Promise.resolve({ data, error: null }).then(ok)
        },
      }
      return api
    }
    return { from: q, tablas }
  }

  it('crea, actualiza y borra por obra y partida, sin tocar otros orígenes', async () => {
    const db = bd([
      { id: 'a', orden_compra_id: 'OC', user_id: 'u', proyecto_id: 'O', partida_id: 'P1', monto: 1 },
      { id: 'b', orden_compra_id: 'OC', user_id: 'u', proyecto_id: 'O', partida_id: 'P2', monto: 1 },
      { id: 'c', orden_compra_id: 'OTRA', user_id: 'u', proyecto_id: 'O', partida_id: 'P2', monto: 1 },
    ])
    await aplicarGastos(db, 'u', 'orden_compra_id', 'OC', [
      { proyecto_id: 'O', partida_id: 'P1', monto: 5 },
      { proyecto_id: 'O', partida_id: null, monto: 7 },
    ])
    const filas = db.tablas.gastos_obra
    expect(filas.find((g: any) => g.id === 'a').monto).toBe(5)
    expect(filas.find((g: any) => g.id === 'b')).toBeUndefined()
    expect(filas.find((g: any) => g.id === 'c')).toBeTruthy()
    expect(filas.find((g: any) => g.partida_id === null).monto).toBe(7)
  })
})

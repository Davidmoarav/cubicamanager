// tests/fase4.test.ts
// Consolidado por obra, conciliación con el SII y emisión de DTE.
import { describe, it, expect } from 'vitest'
import { consolidarPorObra, filtrarPorObra, obraDe } from '../lib/consolidado'
import { conciliarRegistro } from '../lib/conciliacion-sii'
import { construirDTE, tipoDTE } from '../lib/dte'
import { proveedorDTE, type ProveedorDTE } from '../lib/dte-proveedores'
import { emitirDTE } from '../lib/dte-server'
import { parsearRCV } from '../lib/sii'
import { calcularResumenIVA } from '../lib/iva'

const proyectos = [{ id: 'A', nombre: 'Obra A' }, { id: 'B', nombre: 'Obra B' }]

describe('filtro por obra', () => {
  const items = [{ proyecto_id: 'A' }, { proyecto: 'Obra B' }, { proyecto: 'Ya no existe' }, {}]
  it('reconoce el enlace por id y el antiguo por nombre', () => {
    expect(obraDe(items[0], proyectos)).toBe('A')
    expect(obraDe(items[1], proyectos)).toBe('B')
    expect(obraDe(items[2], proyectos)).toBeNull()
  })
  it('filtra por obra, sin obra o todas', () => {
    expect(filtrarPorObra(items, '', proyectos)).toHaveLength(4)
    expect(filtrarPorObra(items, 'B', proyectos)).toEqual([{ proyecto: 'Obra B' }])
    expect(filtrarPorObra(items, 'sin', proyectos)).toHaveLength(2)
  })
})

describe('consolidarPorObra', () => {
  const facturas = [
    { id: 'v1', tipo: 'venta', doc_tipo: 'factura', estado: 'pagada', proyecto_id: 'A', neto: 100, iva: 19, monto: 119, periodo: '2026-10' },
    { id: 'v2', tipo: 'venta', doc_tipo: 'factura', estado: 'pendiente', proyecto: 'Obra B', neto: 200, iva: 38, monto: 238, periodo: '2026-10' },
    { id: 'v3', tipo: 'venta', doc_tipo: 'factura', estado: 'vencida', neto: 50, iva: 10, monto: 60, periodo: '2026-10' },
    { id: 'n1', tipo: 'venta', doc_tipo: 'nota_credito', estado: 'pagada', factura_ref: 'v1', neto: 10, iva: 2, monto: 12, periodo: '2026-10' },
    { id: 'c1', tipo: 'compra', doc_tipo: 'factura', estado: 'pagada', proyecto_id: 'A', neto: 40, iva: 8, monto: 48, periodo: '2026-10' },
    { id: 'c2', tipo: 'compra', doc_tipo: 'factura', estado: 'pagada', neto: 30, iva: 6, monto: 36, periodo: '2026-10' },
    { id: 'c3', tipo: 'compra', doc_tipo: 'nota_credito', estado: 'pagada', factura_ref: 'c1', neto: 5, iva: 1, monto: 6, periodo: '2026-10' },
    { id: 'x', tipo: 'venta', doc_tipo: 'factura', estado: 'pagada', proyecto_id: 'A', neto: 999, iva: 0, monto: 999, periodo: '2026-09' },
  ]
  const gastos = [
    { proyecto_id: 'A', monto: 7, fecha: '2026-10-02' },
    { proyecto_id: 'A', monto: 300, fecha: '2026-10-01', liquidacion_id: 'L' },
    { proyecto_id: 'B', monto: 9, fecha: '2026-09-02' },
  ]
  const { filas, totales } = consolidarPorObra({
    facturas, gastos, proyectos, periodo: '2026-10', nominaSinObra: [{ periodo: '2026-10', monto: 20 }, { periodo: '2026-09', monto: 99 }],
  })
  const fila = (id: string | null) => filas.find(f => f.proyecto_id === id)!

  it('asigna a cada obra, y las notas siguen a su factura', () => {
    expect(fila('A')).toMatchObject({ cobrado: 107, compras: 35, gastos: 7, nomina: 300, costo_total: 342 })
    expect(fila('B')).toMatchObject({ por_cobrar: 238, compras: 0 })
    expect(fila(null)).toMatchObject({ nombre: 'Sin obra', vencido: 60, compras: 30, nomina: 20 })
  })

  it('el total es exactamente la suma de las filas, con "Sin obra" al final', () => {
    expect(filas[filas.length - 1].proyecto_id).toBeNull()
    for (const c of ['cobrado', 'por_cobrar', 'vencido', 'compras', 'gastos', 'nomina', 'costo_total', 'iva_debito', 'iva_credito'] as const) {
      expect(filas.reduce((s, f) => s + f[c], 0)).toBe(totales[c])
    }
  })

  it('el IVA por obra suma lo mismo que el Control de IVA de la empresa', () => {
    const empresa = calcularResumenIVA(facturas).find(p => p.periodo === '2026-10')!
    expect(totales.iva_debito).toBe(empresa.iva_debito)
    expect(totales.iva_credito).toBe(empresa.iva_credito)
    expect(fila('A').iva_debito).toBe(19 - 2)
    expect(fila('A').iva_credito).toBe(8 - 1)
  })

  it('sin período toma todo el historial', () => {
    const r = consolidarPorObra({ facturas, gastos, proyectos })
    expect(r.filas.find(f => f.proyecto_id === 'A')!.cobrado).toBe(107 + 999)
    expect(r.filas.find(f => f.proyecto_id === 'B')!.gastos).toBe(9)
  })
})

describe('parsearRCV', () => {
  const csv = [
    'Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Total;NCE o NDE sobre Fact',
    '1;33;76.111.111-1;"EMPRESA X, LTDA";100;05/10/2026;0;1000;190;1190;',
    '2;61;76.111.111-1;"EMPRESA X, LTDA";7;06/10/2026;0;100;19;119;100',
    '3;34;77.222.222-2;Exenta SpA;8;07/10/2026;500;0;0;500;',
    '4;33;77.222.222-2;Vacía;9;07/10/2026;0;0;0;0;',
  ].join('\n')
  it('reconoce columnas, tipos, exento y referencia', () => {
    const r = parsearRCV(csv)
    expect(r.error).toBeNull()
    expect(r.omitidas).toBe(1)
    expect(r.filas[0]).toMatchObject({ numero: '100', contraparte: 'EMPRESA X, LTDA', rut: '76.111.111-1', neto: 1000, iva: 190, total: 1190, emision: '2026-10-05', periodo: '2026-10', doc_tipo: 'factura' })
    expect(r.filas[1]).toMatchObject({ doc_tipo: 'nota_credito', ref_detectada: '100' })
    expect(r.filas[2]).toMatchObject({ neto: 500, exento: 500 })
  })
  it('avisa cuando no es un registro del SII o está vacío', () => {
    expect(parsearRCV('a;b\n1;2').error).toMatch(/columnas/)
    expect(parsearRCV('solo encabezado').error).toMatch(/vacío/)
  })
})

describe('conciliarRegistro', () => {
  const base = { rut: '76.111.111-1', doc_tipo: 'factura', periodo: '2026-10', emision: '2026-10-05', contraparte: 'Prov' }
  const doc = (id: string, numero: string, extra: any = {}) => ({
    id, numero, rut_contraparte: '761111111', doc_tipo: 'factura', neto: 1000, iva: 190, monto: 1190, periodo: '2026-10', cliente: 'Prov', ...extra,
  })
  const fila = (numero: string, extra: any = {}) => ({ ...base, numero, neto: 1000, iva: 190, total: 1190, ...extra })

  it('clasifica cada documento', () => {
    const { items, resumen } = conciliarRegistro(
      [fila('1'), fila('2', { neto: 900, iva: 171, total: 1071 }), fila('3'), fila('4')],
      [doc('a', '1'), doc('b', '2'), doc('c', '3', { periodo: '2026-09' }), doc('d', '5'), doc('e', '6', { periodo: '2026-08' })],
      '2026-10',
    )
    const estado = (n: string) => items.find(i => i.numero === n)?.estado
    expect(estado('1')).toBe('cuadra')
    expect(estado('2')).toBe('diferencia')
    expect(estado('3')).toBe('otro_periodo')
    expect(estado('4')).toBe('solo_sii')
    expect(estado('5')).toBe('solo_sistema')
    expect(estado('6')).toBeUndefined()   // de otro período: no se reclama aquí
    expect(resumen).toMatchObject({ cuadra: 1, diferencia: 1, otro_periodo: 1, solo_sii: 1, solo_sistema: 1 })
  })

  it('tolera un peso de redondeo', () => {
    const { resumen } = conciliarRegistro([fila('1', { iva: 191, total: 1191 })], [doc('a', '1')], '2026-10')
    expect(resumen.cuadra).toBe(1)
  })

  it('el mismo folio de otro proveedor es otro documento', () => {
    const { resumen } = conciliarRegistro([fila('1', { rut: '77.222.222-2' })], [doc('a', '1')], '2026-10')
    expect(resumen).toMatchObject({ solo_sii: 1, solo_sistema: 1, cuadra: 0 })
  })

  it('un documento cargado sin RUT se empareja por folio, una sola vez', () => {
    const { resumen } = conciliarRegistro(
      [fila('1'), fila('1', { rut: '77.222.222-2' })],
      [doc('a', '1', { rut_contraparte: null })], '2026-10')
    expect(resumen).toMatchObject({ cuadra: 1, solo_sii: 1 })
  })

  it('compara notas de crédito sin importar el signo y las resta en los totales', () => {
    const r = conciliarRegistro(
      [fila('9', { doc_tipo: 'nota_credito', neto: -100, iva: -19, total: -119 })],
      [doc('n', '9', { doc_tipo: 'nota_credito', neto: 100, iva: 19, monto: 119 })], '2026-10')
    expect(r.resumen).toMatchObject({ cuadra: 1, neto_sii: -100, neto_sistema: -100 })
  })

  it('no reclama las boletas, que se registran como resumen mensual', () => {
    const { resumen } = conciliarRegistro([], [doc('b', 'R', { doc_tipo: 'boleta' })], '2026-10')
    expect(resumen.solo_sistema).toBe(0)
    expect(resumen.total_sistema).toBe(0)
  })
})

const emisor = { rut: '76.086.428-5', razon_social: 'Constructora', giro: 'Construcción', direccion: 'Calle 1', comuna: 'Talca' }
const receptor = { rut: '12.345.678-5', razon_social: 'Cliente', giro: 'Comercio', direccion: 'Calle 2', comuna: 'Curicó' }
const factura = { tipo: 'venta', doc_tipo: 'factura', neto: 1000, iva: 190, monto: 1190, emision: '2026-10-05', proyecto: 'Obra A' }

describe('construirDTE', () => {
  it('elige el tipo de documento', () => {
    expect(tipoDTE({ doc_tipo: 'factura', iva: 190 })).toBe(33)
    expect(tipoDTE({ doc_tipo: 'factura', iva: 0 })).toBe(34)
    expect(tipoDTE({ doc_tipo: 'nota_credito' })).toBe(61)
    expect(tipoDTE({ doc_tipo: 'nota_debito' })).toBe(56)
    expect(tipoDTE({ doc_tipo: 'boleta' })).toBeNull()
  })

  it('arma una factura afecta', () => {
    const { documento, errores } = construirDTE({ factura, emisor, receptor })
    expect(errores).toEqual([])
    expect(documento).toMatchObject({
      tipo_dte: 33, fecha: '2026-10-05',
      totales: { neto: 1000, exento: 0, tasa_iva: 19, iva: 190, total: 1190 },
      referencias: [],
    })
    expect(documento!.detalle[0].descripcion).toContain('Obra A')
  })

  it('arma una factura exenta', () => {
    const { documento } = construirDTE({ factura: { ...factura, iva: 0, monto: 1000 }, emisor, receptor })
    expect(documento).toMatchObject({ tipo_dte: 34, totales: { neto: 0, exento: 1000, tasa_iva: 0, iva: 0, total: 1000 } })
  })

  it('lista todo lo que falta, no solo lo primero', () => {
    const { documento, errores } = construirDTE({ factura: { ...factura, emision: null }, emisor: { ...emisor, giro: '' }, receptor: { ...receptor, rut: '1-1', comuna: null } })
    expect(documento).toBeNull()
    expect(errores).toEqual(expect.arrayContaining([
      'Falta la fecha de emisión', 'Emisor: falta el giro', 'Receptor: el RUT falta o no es válido', 'Receptor: falta la comuna',
    ]))
  })

  it('rechaza montos que no cuadran, compras y boletas', () => {
    expect(construirDTE({ factura: { ...factura, monto: 1500 }, emisor, receptor }).errores).toContain('Neto más IVA no da el total del documento')
    expect(construirDTE({ factura: { ...factura, iva: 100, monto: 1100 }, emisor, receptor }).errores[0]).toMatch(/19%/)
    expect(construirDTE({ factura: { ...factura, tipo: 'compra' }, emisor, receptor }).errores[0]).toMatch(/venta/)
    expect(construirDTE({ factura: { ...factura, doc_tipo: 'boleta' }, emisor, receptor }).errores[0]).toMatch(/no se emite/)
  })

  it('una nota exige la factura que modifica, con folio', () => {
    const nota = { ...factura, doc_tipo: 'nota_credito' }
    expect(construirDTE({ factura: nota, emisor, receptor }).errores[0]).toMatch(/factura que modifica/)
    expect(construirDTE({ factura: nota, emisor, receptor, referencia: { tipo_dte: 33, folio: null } }).errores[0]).toMatch(/folio/)
    expect(construirDTE({ factura: nota, emisor, receptor, referencia: { tipo_dte: 33, folio: '10' }, codigoReferencia: 9 }).errores[0]).toMatch(/referencia/)
    const { documento } = construirDTE({ factura: nota, emisor, receptor, referencia: { tipo_dte: 33, folio: '10', fecha: '2026-10-01' }, codigoReferencia: 1 })
    expect(documento).toMatchObject({ tipo_dte: 61, referencias: [{ tipo_dte: 33, folio: '10', codigo: 1, razon: 'Anula el documento' }] })
  })
})

describe('proveedorDTE', () => {
  it('por defecto es demo y un proveedor desconocido no pasa en silencio', () => {
    const antes = process.env.DTE_PROVEEDOR
    delete process.env.DTE_PROVEEDOR
    expect(proveedorDTE()).toMatchObject({ nombre: 'demo', modo: 'demo' })
    process.env.DTE_PROVEEDOR = 'inventado'
    expect(() => proveedorDTE()).toThrow(/no está implementado/)
    if (antes === undefined) delete process.env.DTE_PROVEEDOR
    else process.env.DTE_PROVEEDOR = antes
  })
})

// ─── BD en memoria: lo justo del cliente de Supabase ───
function bdFalsa(tablas: Record<string, any[]>) {
  let sec = 0
  const q = (tabla: string) => {
    const filtros: ((r: any) => boolean)[] = []
    let op = 'select', valor: any, unico = false
    const correr = () => {
      const filas = tablas[tabla] ?? (tablas[tabla] = [])
      if (op === 'insert') {
        const n = { id: `id${++sec}`, ...valor }
        const vigente = tabla === 'dte_emisiones' && filas.some(r => r.factura_id === n.factura_id && r.modo === n.modo && ['enviando', 'enviado', 'aceptado'].includes(r.estado))
        if (vigente) return { data: null, error: { message: 'duplicate key value' } }
        filas.push(n)
        return { data: unico ? n : [n], error: null }
      }
      const hit = filas.filter(r => filtros.every(f => f(r)))
      if (op === 'update') hit.forEach(r => Object.assign(r, valor))
      return { data: unico ? (hit[0] ?? null) : hit, error: null }
    }
    const api: any = {
      select: () => api, limit: () => api,
      eq: (c: string, v: any) => { filtros.push(r => r[c] === v); return api },
      in: (c: string, v: any[]) => { filtros.push(r => v.includes(r[c])); return api },
      insert: (v: any) => { op = 'insert'; valor = v; return api },
      update: (v: any) => { op = 'update'; valor = v; return api },
      single: () => { unico = true; return Promise.resolve(correr()) },
      maybeSingle: () => { unico = true; return Promise.resolve(correr()) },
      then: (ok: any, ko: any) => Promise.resolve(correr()).then(ok, ko),
    }
    return api
  }
  return { from: q, tablas }
}

describe('emitirDTE', () => {
  const O = 'org'
  const base = () => ({
    facturas: [{ id: 'F', user_id: O, ...factura, numero: 'EP-1', cliente: 'Cliente' }],
    empresa_config: [{ user_id: O, ...emisor }],
    clientes: [{ user_id: O, ...receptor }],
    proyectos: [],
    dte_emisiones: [] as any[],
  })
  const fake = (extra: Partial<ProveedorDTE> = {}): ProveedorDTE => ({
    nombre: 'fake', modo: 'produccion',
    emitir: async () => ({ estado: 'aceptado', folio: '555', track_id: 'T' }),
    consultar: async () => ({ estado: 'aceptado', folio: '555' }),
    ...extra,
  })

  it('en demo registra la emisión sin tocar el número del documento', async () => {
    const db = bdFalsa(base())
    delete process.env.DTE_PROVEEDOR
    const r: any = await emitirDTE(db, O, 'F', proveedorDTE())
    expect(r.codigo).toBe(200)
    expect(r.emision).toMatchObject({ estado: 'aceptado', modo: 'demo', tipo_dte: 33 })
    expect(r.emision.folio).toMatch(/^DEMO-/)
    expect(db.tablas.facturas[0].numero).toBe('EP-1')
  })

  it('en producción el folio pasa a ser el número', async () => {
    const db = bdFalsa(base())
    const r: any = await emitirDTE(db, O, 'F', fake())
    expect(r.emision).toMatchObject({ folio: '555', modo: 'produccion' })
    expect(db.tablas.facturas[0].numero).toBe('555')
  })

  it('no emite dos veces, pero permite reintentar tras un rechazo', async () => {
    const db = bdFalsa(base())
    await emitirDTE(db, O, 'F', fake())
    expect((await emitirDTE(db, O, 'F', fake())).error).toMatch(/ya fue emitido/)

    const db2 = bdFalsa(base())
    const r1: any = await emitirDTE(db2, O, 'F', fake({ emitir: async () => ({ estado: 'rechazado', folio: null }) }))
    expect(r1.emision.estado).toBe('rechazado')
    expect(db2.tablas.facturas[0].numero).toBe('EP-1')
    expect((await emitirDTE(db2, O, 'F', fake())).codigo).toBe(200)
  })

  it('si el proveedor falla, queda registrado y se puede reintentar', async () => {
    const db = bdFalsa(base())
    const r: any = await emitirDTE(db, O, 'F', fake({ emitir: async () => { throw new Error('sin conexión') } }))
    expect(r).toMatchObject({ codigo: 502, error: 'sin conexión' })
    expect(db.tablas.dte_emisiones[0]).toMatchObject({ estado: 'error', error: 'sin conexión' })
    expect((await emitirDTE(db, O, 'F', fake())).codigo).toBe(200)
  })

  it('no llama al proveedor si faltan datos', async () => {
    const d = base()
    d.clientes = []
    const db = bdFalsa(d)
    let llamado = false
    const r: any = await emitirDTE(db, O, 'F', fake({ emitir: async () => { llamado = true; return { estado: 'aceptado', folio: '1' } } }))
    expect(r.codigo).toBe(400)
    expect(r.errores.length).toBeGreaterThan(0)
    expect(llamado).toBe(false)
    expect(db.tablas.dte_emisiones).toHaveLength(0)
  })

  it('una prueba en demo no impide emitir de verdad, ni una nota usa su folio', async () => {
    delete process.env.DTE_PROVEEDOR
    const d = base()
    d.facturas.push({ id: 'N', user_id: O, ...factura, doc_tipo: 'nota_credito', factura_ref: 'F', numero: null, cliente: 'Cliente' } as any)
    const db = bdFalsa(d)
    await emitirDTE(db, O, 'F', proveedorDTE())
    // En producción, la factura solo tiene un folio demo: la nota no puede referenciarlo
    const nota: any = await emitirDTE(db, O, 'N', fake())
    expect(nota.codigo).toBe(400)
    expect(nota.errores[0]).toMatch(/folio/)

    const real: any = await emitirDTE(db, O, 'F', fake())
    expect(real.emision).toMatchObject({ folio: '555', modo: 'produccion' })
    const nota2: any = await emitirDTE(db, O, 'N', fake({ emitir: async () => ({ estado: 'aceptado', folio: '556' }) }))
    expect(nota2.emision.documento.referencias[0].folio).toBe('555')
  })

  it('una nota referencia el folio de la factura ya emitida', async () => {
    const d = base()
    d.facturas.push({ id: 'N', user_id: O, ...factura, doc_tipo: 'nota_credito', factura_ref: 'F', numero: null, cliente: 'Cliente' } as any)
    const db = bdFalsa(d)
    await emitirDTE(db, O, 'F', fake())
    const r: any = await emitirDTE(db, O, 'N', fake({ emitir: async () => ({ estado: 'aceptado', folio: '556' }) }))
    expect(r.emision.documento.referencias[0]).toMatchObject({ folio: '555', tipo_dte: 33 })
  })
})

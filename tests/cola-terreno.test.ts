// tests/cola-terreno.test.ts
// Lo registrado sin señal no se pierde, no se duplica y no pisa lo que otra persona cambió.
import { describe, it, expect } from 'vitest'
import {
  agregar, aplicarResultado, clasificar, enviarIgual, huellaParte, itemAvance, itemParte, leer, procesar, quitar, type ItemCola,
} from '../lib/cola-terreno'

const USUARIO = 'jefe@obra.cl'
const CLAVE = `terreno.cola:${USUARIO}`

const parte = (horas = 8) => itemParte({
  proyectoId: 'p1', fecha: '2026-11-02', titulo: 'Parte del 2 nov 2026',
  filas: [{ empleado_id: 'e1', partida_id: null, horas }],
  filasBase: [],
})
const avance = (n = 40) => itemAvance({ partidaId: 'h1', proyectoId: 'p1', avance: n, avanceBase: 30, titulo: `Avance: ${n}%` })

function almacen(inicial: ItemCola[] = []) {
  const datos = new Map<string, string>([[CLAVE, JSON.stringify(inicial)]])
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v) },
    datos,
  }
}

const json = (cuerpo: any, status = 200) => new Response(JSON.stringify(cuerpo), {
  status, headers: { 'Content-Type': 'application/json' },
})

// Responde según la URL y anota lo que se mandó
function servidor(responder: (body: any, url: string) => Response | Promise<Response>) {
  const enviados: any[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url === '/api/mi-rol') return json({ email: USUARIO })
    const body = JSON.parse(String(init?.body))
    enviados.push({ url, metodo: init?.method, body })
    return responder(body, url)
  }
  return { fetchFn, enviados }
}

describe('huella del parte', () => {
  it('no depende del orden ni del formato de las horas', () => {
    const a = [{ empleado_id: 'e1', partida_id: 'x', horas: '8.0' }, { empleado_id: 'e2', horas: 4 }]
    const b = [{ empleado_id: 'e2', partida_id: null, horas: 4 }, { empleado_id: 'e1', partida_id: 'x', horas: 8 }]
    expect(huellaParte(a)).toBe(huellaParte(b))
  })
  it('cambia si cambian las horas o la partida', () => {
    const base = [{ empleado_id: 'e1', partida_id: 'x', horas: 8 }]
    expect(huellaParte(base)).not.toBe(huellaParte([{ ...base[0], horas: 9 }]))
    expect(huellaParte(base)).not.toBe(huellaParte([{ ...base[0], partida_id: 'y' }]))
  })
  it('un día sin datos en el teléfono equivale a suponerlo vacío', () => {
    expect(huellaParte([])).toBe('')
    expect(parte().guarda).toEqual({ base: '' })
  })
})

describe('qué respuesta cuenta como guardado', () => {
  it('solo un ok con JSON', () => {
    expect(clasificar({ ok: true, status: 200, esJson: true })).toBe('enviado')
  })
  it('la redirección al login no es un guardado', () => {
    expect(clasificar({ ok: true, status: 200, redirected: true, esJson: false })).toBe('sesion')
    expect(clasificar({ ok: true, status: 200, esJson: false })).toBe('sesion')
    expect(clasificar({ ok: false, status: 401, esJson: true })).toBe('sesion')
  })
  it('un cambio de otra persona pide decisión', () => {
    expect(clasificar({ ok: false, status: 409, esJson: true })).toBe('conflicto')
  })
  it('una falla del servidor se reintenta', () => {
    for (const status of [408, 429, 500, 503]) expect(clasificar({ ok: false, status })).toBe('reintentar')
  })
  it('un dato inválido no se reintenta', () => {
    for (const status of [400, 403, 404]) expect(clasificar({ ok: false, status })).toBe('rechazado')
  })
})

describe('corregir antes de enviar', () => {
  it('lo nuevo reemplaza y conserva la primera guarda', () => {
    const primero = parte(8)
    const corregido = { ...parte(9), guarda: { base: 'otra' } }
    const cola = agregar([primero], corregido)
    expect(cola).toHaveLength(1)
    expect(cola[0].cuerpo.filas[0].horas).toBe(9)
    expect(cola[0].guarda).toEqual(primero.guarda)
  })
  it('registros distintos conviven', () => {
    expect(agregar([parte()], avance())).toHaveLength(2)
  })
  it('una corrección mientras viajaba parte de lo recién enviado', () => {
    const enViaje = parte(8)
    const correccion = { ...parte(9), guarda: enViaje.guarda }
    const cola = aplicarResultado([correccion], enViaje, 'enviado')
    expect(cola).toHaveLength(1)
    expect(cola[0].guarda).toEqual(enViaje.guardaResultado)
  })
  it('un resultado viejo no marca la corrección', () => {
    const enViaje = parte(8)
    const correccion = parte(9)
    expect(aplicarResultado([correccion], enViaje, 'conflicto', 'x')[0].estado).toBe('pendiente')
  })
})

describe('decidir un conflicto', () => {
  it('enviar igual quita la guarda', () => {
    const item = { ...parte(), estado: 'conflicto' as const, error: 'x' }
    const [r] = enviarIgual([item], item.id)
    expect(r.guarda).toBeNull()
    expect(r.estado).toBe('pendiente')
    expect(r.error).toBeUndefined()
  })
  it('descartar lo saca', () => {
    const item = parte()
    expect(quitar([item], item.id)).toEqual([])
  })
})

describe('envío', () => {
  it('manda lo pendiente en orden, con su guarda, y vacía la cola', async () => {
    const a = almacen([parte(), avance()])
    const { fetchFn, enviados } = servidor(() => json({ ok: true }))
    expect(await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })).toBe('al_dia')
    expect(leer(a, USUARIO)).toEqual([])
    expect(enviados.map(e => e.metodo)).toEqual(['PUT', 'PATCH'])
    expect(enviados[0].body.base).toBe('')
    expect(enviados[1].body).toEqual({ id: 'h1', proyecto_id: 'p1', avance: 40, base_avance: 30 })
  })
  it('sin señal no pierde nada', async () => {
    const a = almacen([parte()])
    const res = await procesar({
      usuario: USUARIO, almacen: a,
      fetch: async url => { if (url === '/api/mi-rol') return json({ email: USUARIO }); throw new TypeError('sin red') },
    })
    expect(res).toBe('sin_senal')
    expect(leer(a, USUARIO)).toHaveLength(1)
  })
  it('sin siquiera poder preguntar la sesión tampoco', async () => {
    const a = almacen([parte()])
    const res = await procesar({ usuario: USUARIO, almacen: a, fetch: async () => { throw new TypeError('sin red') } })
    expect(res).toBe('sin_senal')
    expect(leer(a, USUARIO)).toHaveLength(1)
  })
  it('con la sesión vencida conserva el registro', async () => {
    const a = almacen([parte()])
    const login = new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    const { fetchFn } = servidor(() => login)
    expect(await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })).toBe('sesion')
    expect(leer(a, USUARIO)).toHaveLength(1)
  })
  it('no envía lo de otra cuenta', async () => {
    const a = almacen([parte()])
    const llamadas: string[] = []
    const res = await procesar({
      usuario: USUARIO, almacen: a,
      fetch: async url => { llamadas.push(url); return json({ email: 'otra@obra.cl' }) },
    })
    expect(res).toBe('otra_cuenta')
    expect(llamadas).toEqual(['/api/mi-rol'])
    expect(leer(a, USUARIO)).toHaveLength(1)
  })
  it('un conflicto queda a la vista y no frena lo demás', async () => {
    const a = almacen([parte(), avance()])
    const { fetchFn, enviados } = servidor((_, url) => url === '/api/parte-diario'
      ? json({ error: 'Otra persona cambió el parte de este día' }, 409)
      : json({ ok: true }))
    expect(await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })).toBe('al_dia')
    const cola = leer(a, USUARIO)
    expect(enviados).toHaveLength(2)
    expect(cola).toHaveLength(1)
    expect(cola[0].estado).toBe('conflicto')
    expect(cola[0].error).toContain('Otra persona')
  })
  it('lo que el servidor rechaza no se reintenta', async () => {
    const a = almacen([parte()])
    const { fetchFn, enviados } = servidor(() => json({ error: 'Máximo 24 horas' }, 400))
    await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })
    await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })
    expect(enviados).toHaveLength(1)
    expect(leer(a, USUARIO)[0].estado).toBe('rechazado')
  })
  it('una falla del servidor no traba a los siguientes y se reintenta', async () => {
    const a = almacen([parte(), avance()])
    const { fetchFn, enviados } = servidor((_, url) => url === '/api/parte-diario'
      ? json({ error: 'Base caída' }, 500)
      : json({ ok: true }))
    expect(await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn })).toBe('sin_senal')
    const cola = leer(a, USUARIO)
    expect(enviados).toHaveLength(2)
    expect(cola).toHaveLength(1)
    expect(cola[0].estado).toBe('pendiente')
    expect(cola[0].error).toBe('Base caída')
  })
  it('entrega el aviso del servidor', async () => {
    const a = almacen([parte()])
    const avisos: (string | undefined)[] = []
    const { fetchFn } = servidor(() => json({ ok: true, aviso: 'No se pudo reimputar' }))
    await procesar({ usuario: USUARIO, almacen: a, fetch: fetchFn, alEnviar: (_, aviso) => avisos.push(aviso) })
    expect(avisos).toEqual(['No se pudo reimputar'])
  })
  it('una cola ilegible no rompe la app', () => {
    const a = almacen()
    a.datos.set(CLAVE, '{no es json')
    expect(leer(a, USUARIO)).toEqual([])
  })
})

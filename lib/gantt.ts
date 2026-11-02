// lib/gantt.ts
// Motor puro de la Carta Gantt (Fase 4): posiciones de barras, fase actual,
// días restantes y plan automático. Fechas en 'YYYY-MM-DD' (UTC, sin horas).
import { fmtFecha } from './format'

export interface EtapaGantt {
  id: string
  nombre: string
  avance: number            // 0-100 (viene calculado del backend)
  valor: number             // peso de la etapa (suma de sus partidas)
  fecha_inicio?: string | null
  fecha_fin?: string | null
  responsable?: string | null
}

export type EstadoEtapa = 'completa' | 'encurso' | 'atrasada' | 'pendiente'

export interface BarraEtapa extends EtapaGantt {
  iniPct: number            // posición izquierda de la barra (%)
  anchoPct: number          // ancho de la barra (%)
  estado: EstadoEtapa
}

export interface GanttCalc {
  desde: string | null
  hasta: string | null
  totalDias: number
  hoyPct: number | null     // posición de la línea HOY (%), null si fuera de rango
  etapas: BarraEtapa[]
  sinFechas: number         // etapas sin planificar
  faseActual: { nombre: string; avance: number } | null
  diasRestantes: number | null
  fechaEntrega: string | null
  avanceGlobal: number      // ponderado por valor
  meses: { etiqueta: string; iniPct: number; anchoPct: number }[]
}

const DIA_MS = 86_400_000

export const aUTC = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

export const deUTC = (t: number): string => new Date(t).toISOString().slice(0, 10)

export const sumarDias = (iso: string, dias: number): string => deUTC(aUTC(iso) + dias * DIA_MS)

export const fechaCortaCL = fmtFecha

const MESES_CL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function calcularGantt(etapas: EtapaGantt[], hoyISO: string): GanttCalc {
  const conFechas = etapas.filter(e => e.fecha_inicio && e.fecha_fin)
  const sinFechas = etapas.length - conFechas.length

  // Avance global ponderado por valor (fallback: promedio simple)
  const pesoTotal = etapas.reduce((s, e) => s + (Number(e.valor) || 0), 0)
  const avanceGlobal = etapas.length === 0 ? 0 : Math.round(
    pesoTotal > 0
      ? etapas.reduce((s, e) => s + (Number(e.avance) || 0) * ((Number(e.valor) || 0) / pesoTotal), 0)
      : etapas.reduce((s, e) => s + (Number(e.avance) || 0), 0) / etapas.length
  )

  if (conFechas.length === 0) {
    return {
      desde: null, hasta: null, totalDias: 0, hoyPct: null,
      etapas: etapas.map(e => ({ ...e, iniPct: 0, anchoPct: 0, estado: estadoDe(e, hoyISO) })),
      sinFechas, faseActual: faseActualDe(etapas), diasRestantes: null,
      fechaEntrega: null, avanceGlobal, meses: [],
    }
  }

  const desdeT = Math.min(...conFechas.map(e => aUTC(e.fecha_inicio!)))
  const hastaT = Math.max(...conFechas.map(e => aUTC(e.fecha_fin!)))
  const desde = deUTC(desdeT)
  const hasta = deUTC(hastaT)
  const totalDias = Math.max(1, Math.round((hastaT - desdeT) / DIA_MS) + 1)

  const pct = (t: number) => ((t - desdeT) / DIA_MS / totalDias) * 100

  const hoyT = aUTC(hoyISO)
  const hoyPct = hoyT >= desdeT && hoyT <= hastaT + DIA_MS ? Math.min(100, pct(hoyT) + (100 / totalDias) / 2) : null

  const barras: BarraEtapa[] = etapas.map(e => {
    if (!e.fecha_inicio || !e.fecha_fin) {
      return { ...e, iniPct: 0, anchoPct: 0, estado: estadoDe(e, hoyISO) }
    }
    const ini = pct(aUTC(e.fecha_inicio))
    const fin = pct(aUTC(e.fecha_fin) + DIA_MS) // barra incluye el día de término
    return {
      ...e,
      iniPct: Math.max(0, ini),
      anchoPct: Math.max(1.5, fin - ini),
      estado: estadoDe(e, hoyISO),
    }
  })

  // Días restantes hasta la entrega (fin del rango)
  const diasRestantes = Math.max(0, Math.round((hastaT - hoyT) / DIA_MS))

  // Cabecera de meses para la grilla
  const meses: GanttCalc['meses'] = []
  let cursor = desdeT
  while (cursor <= hastaT) {
    const d = new Date(cursor)
    const finMesT = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DIA_MS
    const tramoFin = Math.min(finMesT, hastaT)
    meses.push({
      etiqueta: `${MESES_CL[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      iniPct: pct(cursor),
      anchoPct: pct(tramoFin + DIA_MS) - pct(cursor),
    })
    cursor = finMesT + DIA_MS
  }

  return {
    desde, hasta, totalDias, hoyPct,
    etapas: barras, sinFechas,
    faseActual: faseActualDe(etapas),
    diasRestantes, fechaEntrega: hasta,
    avanceGlobal, meses,
  }
}

function estadoDe(e: EtapaGantt, hoyISO: string): EstadoEtapa {
  const avance = Number(e.avance) || 0
  if (avance >= 100) return 'completa'
  if (e.fecha_fin && aUTC(e.fecha_fin) < aUTC(hoyISO)) return 'atrasada'
  if (e.fecha_inicio && aUTC(e.fecha_inicio) <= aUTC(hoyISO)) return 'encurso'
  return 'pendiente'
}

function faseActualDe(etapas: EtapaGantt[]): { nombre: string; avance: number } | null {
  const orden = [...etapas].sort((a, b) => {
    if (a.fecha_inicio && b.fecha_inicio) return a.fecha_inicio.localeCompare(b.fecha_inicio)
    if (a.fecha_inicio) return -1
    if (b.fecha_inicio) return 1
    return 0
  })
  const activa = orden.find(e => (Number(e.avance) || 0) < 100)
  return activa ? { nombre: activa.nombre, avance: Math.round(Number(activa.avance) || 0) } : null
}

// ─── Tareas de la Gantt: etapas (grupos nivel 1) o partidas (hojas) ──
export interface PartidaGantt {
  id: string
  parent_id?: string | null
  orden?: number | null
  descripcion: string
  es_grupo?: boolean | null
  cantidad?: number | null
  precio_unitario?: number | null
  avance?: number | null
  fecha_inicio?: string | null
  fecha_fin?: string | null
  responsable?: string | null
}

export interface TareaGantt extends EtapaGantt {
  grupo?: string | null        // etapa a la que pertenece la partida
  derivada?: boolean           // sus fechas salen de las partidas que contiene
}

export function tareasGantt(partidas: PartidaGantt[], modo: 'etapas' | 'partidas'): TareaGantt[] {
  const hijosDe = (id: string) => partidas
    .filter(p => p.parent_id === id)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const hojasDe = (n: PartidaGantt): PartidaGantt[] => {
    const h = hijosDe(n.id)
    return h.length === 0 ? [n] : h.flatMap(hojasDe)
  }
  const valor = (n: PartidaGantt) => hojasDe(n)
    .reduce((s, h) => s + (Number(h.cantidad) || 0) * (Number(h.precio_unitario) || 0), 0)
  const raices = partidas.filter(p => !p.parent_id).sort((a, b) => (a.orden || 0) - (b.orden || 0))

  if (modo === 'partidas') {
    return raices.flatMap(raiz => hojasDe(raiz).map(h => ({
      id: h.id,
      nombre: h.descripcion,
      avance: Number(h.avance) || 0,
      valor: valor(h),
      fecha_inicio: h.fecha_inicio ?? null,
      fecha_fin: h.fecha_fin ?? null,
      responsable: h.responsable ?? null,
      grupo: h.id === raiz.id ? null : raiz.descripcion,
    })))
  }

  return raices
    .filter(g => g.es_grupo || hijosDe(g.id).length > 0)
    .map(g => {
      // Con partidas programadas, las fechas de la etapa salen de ellas
      const hojas = hojasDe(g).filter(h => h.id !== g.id && h.fecha_inicio && h.fecha_fin)
      const inicios = hojas.map(h => h.fecha_inicio as string).sort()
      const fines = hojas.map(h => h.fecha_fin as string).sort()
      return {
        id: g.id,
        nombre: g.descripcion,
        avance: Number(g.avance) || 0,
        valor: valor(g),
        fecha_inicio: inicios[0] ?? g.fecha_inicio ?? null,
        fecha_fin: fines[fines.length - 1] ?? g.fecha_fin ?? null,
        responsable: g.responsable ?? null,
        derivada: hojas.length > 0,
      }
    })
}

// ─── Ruta crítica (CPM), en días corridos ─────────────────
// Dependencia: la tarea parte el día siguiente al término de la otra, más el desfase.
export interface DependenciaGantt {
  partida_id: string
  depende_de_id: string
  desfase_dias?: number | null
}

export interface NodoCPM {
  duracion: number
  inicio_temprano: string
  fin_temprano: string
  holgura: number              // días que puede atrasarse sin mover la entrega
  critica: boolean
}

export interface ResultadoCPM {
  ciclo: boolean
  porId: Record<string, NodoCPM>
  criticas: string[]
  inicio: string | null
  fin: string | null
  duracion: number
  // Tareas que parten antes de lo que permiten sus dependencias, con sus fechas corregidas
  ajustes: { id: string; fecha_inicio: string; fecha_fin: string }[]
}

const dia = (iso: string) => Math.round(aUTC(iso) / DIA_MS)
const deDia = (d: number) => deUTC(d * DIA_MS)

export function rutaCritica(tareas: EtapaGantt[], dependencias: DependenciaGantt[]): ResultadoCPM {
  const vacio: ResultadoCPM = { ciclo: false, porId: {}, criticas: [], inicio: null, fin: null, duracion: 0, ajustes: [] }
  const validas = tareas.filter(t => t.fecha_inicio && t.fecha_fin && dia(t.fecha_fin) >= dia(t.fecha_inicio))
  if (validas.length === 0) return vacio

  const ids = new Set(validas.map(t => t.id))
  const deps = dependencias.filter(d => ids.has(d.partida_id) && ids.has(d.depende_de_id) && d.partida_id !== d.depende_de_id)

  // Orden topológico: sin él no hay ruta crítica posible
  const pendientes = new Map(validas.map(t => [t.id, deps.filter(d => d.partida_id === t.id).length]))
  const cola = validas.filter(t => pendientes.get(t.id) === 0).map(t => t.id)
  const orden: string[] = []
  while (cola.length > 0) {
    const id = cola.shift() as string
    orden.push(id)
    for (const d of deps.filter(x => x.depende_de_id === id)) {
      const n = (pendientes.get(d.partida_id) as number) - 1
      pendientes.set(d.partida_id, n)
      if (n === 0) cola.push(d.partida_id)
    }
  }
  if (orden.length < validas.length) return { ...vacio, ciclo: true }

  const porIdTarea = new Map(validas.map(t => [t.id, t]))
  const duracion = (id: string) => {
    const t = porIdTarea.get(id) as EtapaGantt
    return dia(t.fecha_fin as string) - dia(t.fecha_inicio as string) + 1
  }

  // Hacia adelante: nunca antes de su fecha planificada ni de sus dependencias
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const id of orden) {
    let inicio = dia((porIdTarea.get(id) as EtapaGantt).fecha_inicio as string)
    for (const d of deps.filter(x => x.partida_id === id)) {
      inicio = Math.max(inicio, (ef.get(d.depende_de_id) as number) + 1 + (Number(d.desfase_dias) || 0))
    }
    es.set(id, inicio)
    ef.set(id, inicio + duracion(id) - 1)
  }

  const finProyecto = Math.max(...ef.values())
  const inicioProyecto = Math.min(...es.values())

  // Hacia atrás: lo más tarde que puede terminar cada una
  const lf = new Map<string, number>()
  for (const id of [...orden].reverse()) {
    let fin = finProyecto
    for (const d of deps.filter(x => x.depende_de_id === id)) {
      fin = Math.min(fin, (lf.get(d.partida_id) as number) - duracion(d.partida_id) - (Number(d.desfase_dias) || 0))
    }
    lf.set(id, fin)
  }

  const porId: Record<string, NodoCPM> = {}
  const ajustes: ResultadoCPM['ajustes'] = []
  for (const id of orden) {
    const holgura = (lf.get(id) as number) - (ef.get(id) as number)
    porId[id] = {
      duracion: duracion(id),
      inicio_temprano: deDia(es.get(id) as number),
      fin_temprano: deDia(ef.get(id) as number),
      holgura,
      critica: holgura === 0,
    }
    if ((es.get(id) as number) > dia((porIdTarea.get(id) as EtapaGantt).fecha_inicio as string)) {
      ajustes.push({ id, fecha_inicio: deDia(es.get(id) as number), fecha_fin: deDia(ef.get(id) as number) })
    }
  }

  return {
    ciclo: false,
    porId,
    criticas: orden.filter(id => porId[id].critica),
    inicio: deDia(inicioProyecto),
    fin: deDia(finProyecto),
    duracion: finProyecto - inicioProyecto + 1,
    ajustes,
  }
}

// ¿Agregar "partida depende de otra" cierra un ciclo?
export function creaCiclo(dependencias: DependenciaGantt[], partidaId: string, dependeDeId: string): boolean {
  if (partidaId === dependeDeId) return true
  const visitados = new Set<string>()
  const pila = [dependeDeId]
  while (pila.length > 0) {
    const id = pila.pop() as string
    if (id === partidaId) return true
    if (visitados.has(id)) continue
    visitados.add(id)
    for (const d of dependencias) if (d.partida_id === id) pila.push(d.depende_de_id)
  }
  return false
}

// ─── Plan automático: reparte el horizonte proporcional al valor ──
export function planAutomatico(
  etapas: EtapaGantt[],
  desdeISO: string,
  horizonteDias = 30
): { id: string; fecha_inicio: string; fecha_fin: string }[] {
  if (etapas.length === 0) return []
  const MIN_DIAS = 3
  const pesoTotal = etapas.reduce((s, e) => s + Math.max(1, Number(e.valor) || 0), 0)

  // Duración proporcional al peso, mínimo 3 días
  const duraciones = etapas.map(e =>
    Math.max(MIN_DIAS, Math.round(horizonteDias * (Math.max(1, Number(e.valor) || 0) / pesoTotal)))
  )

  const plan: { id: string; fecha_inicio: string; fecha_fin: string }[] = []
  let cursor = desdeISO
  etapas.forEach((e, i) => {
    const fin = sumarDias(cursor, duraciones[i] - 1)
    plan.push({ id: e.id, fecha_inicio: cursor, fecha_fin: fin })
    cursor = sumarDias(fin, 1)
  })
  return plan
}

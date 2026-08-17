// lib/gantt.ts
// Motor puro de la Carta Gantt (Fase 4): posiciones de barras, fase actual,
// días restantes y plan automático. Fechas en 'YYYY-MM-DD' (UTC, sin horas).

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

const MESES_CL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fechaCortaCL(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CL[(m || 1) - 1]} ${y}`
}

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

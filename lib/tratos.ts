// lib/tratos.ts
// Tratos de mano de obra y formas de pago: cuánto vale un avance, cómo se reparte entre la
// cuadrilla, qué recibe cada trabajador en el mes y su semana corrida. Funciones puras.
import { feriadosDelAnio } from './feriados-cl'

export type TipoTrato = 'unidad' | 'suma_alzada' | 'vivienda' | 'por_hora' | 'por_dia'
export type EjecutorTrato = 'trabajador' | 'cuadrilla' | 'tercero'
export type RepartoTrato = 'iguales' | 'porcentaje' | 'dias'
export type ModalidadPago = 'mensual' | 'por_metas' | 'diario' | 'por_hora' | 'trato' | 'mixto'

export const TIPOS_TRATO: { value: TipoTrato; label: string; ayuda: string }[] = [
  { value: 'unidad',      label: 'Por unidad (m², ml, un)', ayuda: 'Precio por unidad × cantidad ejecutada y recibida' },
  { value: 'suma_alzada', label: 'Suma alzada por tarea',   ayuda: 'Monto fijo por una tarea; se paga según % de avance' },
  { value: 'vivienda',    label: 'Por vivienda terminada',  ayuda: 'Monto fijo por vivienda; se paga según % de avance' },
  { value: 'por_hora',    label: 'Por hora',                ayuda: 'Valor hora × horas trabajadas' },
  { value: 'por_dia',     label: 'Por día',                 ayuda: 'Valor día × días trabajados' },
]

export const MODALIDADES_PAGO: { value: ModalidadPago; label: string }[] = [
  { value: 'mensual',   label: 'Mensual (sueldo fijo)' },
  { value: 'diario',    label: 'Por día (jornal)' },
  { value: 'por_hora',  label: 'Por hora' },
  { value: 'trato',     label: 'A trato (con mínimo garantizado)' },
  { value: 'mixto',     label: 'Mixto (sueldo base + trato)' },
  { value: 'por_metas', label: 'Por metas (monto mensual a mano)' },
]

export interface Trato {
  tipo: TipoTrato
  precio_unitario?: number | string | null
  cantidad_pactada?: number | string | null
  monto_fijo?: number | string | null
  retencion_pct?: number | string | null
}

export interface AvanceTrato {
  cantidad: number | string
  bruto?: number | string | null
  retencion?: number | string | null
  neto?: number | string | null
  estado?: string | null
}

const n = (v: unknown) => Number(v) || 0
/** Suma alzada y por vivienda avanzan en %; el resto, en su unidad. */
export const tratoEnPorcentaje = (tipo: TipoTrato) => tipo === 'suma_alzada' || tipo === 'vivienda'

/** Total pactado del trato. 0 si es por unidad, hora o día sin cantidad cerrada. */
export function montoPactado(t: Trato): number {
  return tratoEnPorcentaje(t.tipo) ? Math.round(n(t.monto_fijo)) : Math.round(n(t.precio_unitario) * n(t.cantidad_pactada))
}

/** Bruto, retención y neto de un avance. `cantidad` es % en suma alzada y por vivienda. */
export function calcularAvanceTrato(t: Trato, cantidad: number) {
  const bruto = tratoEnPorcentaje(t.tipo)
    ? Math.round(n(t.monto_fijo) * cantidad / 100)
    : Math.round(n(t.precio_unitario) * cantidad)
  const retencion = Math.round(bruto * n(t.retencion_pct) / 100)
  return { bruto, retencion, neto: bruto - retencion }
}

/** Mensaje si el avance no cabe en lo pactado; null si está bien. */
export function errorAvanceTrato(t: Trato, previos: AvanceTrato[], cantidad: number): string | null {
  if (!(cantidad > 0)) return 'La cantidad debe ser mayor que cero'
  const acumulado = previos.reduce((s, a) => s + n(a.cantidad), 0)
  if (tratoEnPorcentaje(t.tipo)) {
    if (acumulado + cantidad > 100 + 1e-9) return `Con este avance el trato pasaría de 100% (lleva ${acumulado}%)`
    return null
  }
  const pactada = n(t.cantidad_pactada)
  if (pactada > 0 && acumulado + cantidad > pactada + 1e-9) {
    return `Con este avance se pasaría de lo pactado (${pactada}; lleva ${acumulado})`
  }
  return null
}

export function resumenTrato(t: Trato, avances: AvanceTrato[]) {
  const firmes = avances.filter(a => a.estado === 'aprobado' || a.estado === 'pagado')
  const suma = (lista: AvanceTrato[], campo: 'bruto' | 'retencion' | 'neto' | 'cantidad') => lista.reduce((s, a) => s + n(a[campo]), 0)
  const pactado = montoPactado(t)
  const ejecutado = suma(firmes, 'bruto')
  const cantidad = suma(firmes, 'cantidad')
  const avance = tratoEnPorcentaje(t.tipo)
    ? Math.min(100, cantidad)
    : n(t.cantidad_pactada) > 0 ? Math.min(100, cantidad / n(t.cantidad_pactada) * 100) : 0
  return {
    pactado,
    ejecutado,
    cantidad: Math.round(cantidad * 100) / 100,
    avance: Math.round(avance),
    por_aprobar: suma(avances.filter(a => a.estado === 'borrador'), 'bruto'),
    retenido: suma(firmes, 'retencion'),
    pagado: suma(avances.filter(a => a.estado === 'pagado'), 'neto'),
    por_pagar: suma(avances.filter(a => a.estado === 'aprobado'), 'neto'),
    saldo: Math.max(0, pactado - ejecutado),
  }
}

export interface ParticipanteTrato {
  empleado_id: string
  porcentaje?: number | string | null
  /** Días trabajados en la obra durante el período del avance (reparto por días). */
  dias?: number | null
}

/** Reparte el bruto de un avance entre la cuadrilla. Las partes suman EXACTO el monto. */
export function repartirTrato(monto: number, participantes: ParticipanteTrato[], regla: RepartoTrato): { empleado_id: string; monto: number }[] {
  const total = Math.round(n(monto))
  if (participantes.length === 0 || total <= 0) return []

  let pesos = participantes.map(p => regla === 'porcentaje' ? n(p.porcentaje) : regla === 'dias' ? n(p.dias) : 1)
  // Sin porcentajes o sin días registrados: partes iguales
  if (pesos.reduce((a, b) => a + b, 0) <= 0) pesos = participantes.map(() => 1)
  const sumaPesos = pesos.reduce((a, b) => a + b, 0)

  const partes = participantes.map((p, i) => {
    const exacto = total * pesos[i] / sumaPesos
    return { empleado_id: p.empleado_id, monto: Math.floor(exacto), resto: exacto - Math.floor(exacto) }
  })
  let faltante = total - partes.reduce((s, p) => s + p.monto, 0)
  for (const p of [...partes].sort((a, b) => b.resto - a.resto)) {
    if (faltante <= 0) break
    p.monto += 1
    faltante -= 1
  }
  return partes.map(({ resto, ...p }) => p).filter(p => p.monto > 0)
}

// ─── Semana corrida ───────────────────────────────────────
// Quien gana por día, por hora o a trato tiene derecho al pago de domingos y festivos:
// por cada semana, el promedio de lo ganado en los días que debía trabajar × los días de
// descanso de esa semana. Se calcula con los días del mes; una semana partida entre dos
// meses usa en cada mes solo sus propios días.
const DIA_MS = 86_400_000
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10)

export function semanaCorrida(ganadoPorFecha: Record<string, number>, periodo: string, diasLaborales: 5 | 6 = 5): number {
  const [y, m] = periodo.split('-').map(Number)
  if (!y || !m) return 0
  const feriados = feriadosDelAnio(y)
  const inicio = Date.UTC(y, m - 1, 1)
  const fin = Date.UTC(y, m, 1)

  // Por semana (lunes a domingo): lo ganado, los días que debía trabajar y los descansos pagados
  const semanas = new Map<number, { ganado: number; laborables: number; descansos: number }>()
  for (let t = inicio; t < fin; t += DIA_MS) {
    const dow = new Date(t).getUTCDay()             // 0 = domingo
    const lunes = t - ((dow + 6) % 7) * DIA_MS
    const s = semanas.get(lunes) ?? { ganado: 0, laborables: 0, descansos: 0 }
    const fecha = isoDe(t)
    const esLaboral = dow >= 1 && dow <= diasLaborales
    if (dow === 0) s.descansos++
    else if (esLaboral && feriados.has(fecha)) s.descansos++   // festivo en día que tocaba trabajar
    else if (esLaboral) s.laborables++
    s.ganado += n(ganadoPorFecha[fecha])
    semanas.set(lunes, s)
  }

  let total = 0
  for (const s of semanas.values()) {
    if (s.laborables > 0 && s.ganado > 0) total += s.ganado / s.laborables * s.descansos
  }
  return Math.round(total)
}

// ─── Lo variable del mes de un trabajador ─────────────────
export interface VariablesMes {
  /** Reemplaza al sueldo como base del mes (por día, por hora, trato). Sin valor: se usa el sueldo. */
  sueldo_base?: number
  trato_monto: number
  semana_corrida: number
  dias: number
  horas: number
}

export interface EmpleadoPago {
  modalidad?: string | null
  sueldo?: number | string | null
  valor_dia?: number | string | null
  valor_hora?: number | string | null
}

export function variablesDelMes(
  emp: EmpleadoPago,
  partes: { fecha: string; horas: number | string }[],
  tratos: { fecha: string; monto: number | string }[],
  periodo: string,
  diasLaborales: 5 | 6 = 5,
  /** Ingreso mínimo mensual: piso del mes de quien gana a trato (jornada completa). */
  ingresoMinimo = 0
): VariablesMes {
  const delMes = (f: string) => String(f).slice(0, 7) === periodo
  const horasPorFecha: Record<string, number> = {}
  for (const p of partes) if (delMes(p.fecha)) horasPorFecha[p.fecha] = (horasPorFecha[p.fecha] || 0) + n(p.horas)
  const dias = Object.keys(horasPorFecha).length
  const horas = Math.round(Object.values(horasPorFecha).reduce((a, b) => a + b, 0) * 10) / 10

  const tratoPorFecha: Record<string, number> = {}
  for (const t of tratos) if (delMes(t.fecha)) tratoPorFecha[t.fecha] = (tratoPorFecha[t.fecha] || 0) + n(t.monto)
  const trato_monto = Math.round(Object.values(tratoPorFecha).reduce((a, b) => a + b, 0))

  const modalidad = (emp.modalidad || 'mensual') as ModalidadPago
  const base = { trato_monto, semana_corrida: 0, dias, horas }

  if (modalidad === 'diario' || modalidad === 'por_hora') {
    // Lo ganado cada día: por tiempo + lo que haya de trato
    const ganado: Record<string, number> = { ...tratoPorFecha }
    for (const [f, h] of Object.entries(horasPorFecha)) {
      ganado[f] = (ganado[f] || 0) + (modalidad === 'diario' ? n(emp.valor_dia) : n(emp.valor_hora) * h)
    }
    const sueldo_base = Math.round(modalidad === 'diario' ? n(emp.valor_dia) * dias : n(emp.valor_hora) * horas)
    return { ...base, sueldo_base, semana_corrida: semanaCorrida(ganado, periodo, diasLaborales) }
  }
  if (modalidad === 'trato') {
    // El sueldo es el mínimo garantizado: si el trato y su semana corrida no lo alcanzan, se completa
    const sc = semanaCorrida(tratoPorFecha, periodo, diasLaborales)
    const garantizado = Math.max(Math.round(n(emp.sueldo)), Math.round(n(ingresoMinimo)))
    return { ...base, semana_corrida: sc, sueldo_base: Math.max(0, garantizado - trato_monto - sc) }
  }
  if (modalidad === 'mixto') {
    // Sueldo fijo + trato: la semana corrida es solo sobre lo variable
    return { ...base, semana_corrida: semanaCorrida(tratoPorFecha, periodo, diasLaborales) }
  }
  // Mensual y por metas: sueldo de siempre; un trato aprobado se suma como producción
  return base
}

// ─── Imputación: la parte del costo que viene de tratos va a la partida de cada trato ───
export interface TramoCosto { proyecto_id: string; partida_id: string | null; horas: number; monto: number }

export function separarCostoTratos(
  costo: number, totalHaberes: number,
  tratos: { proyecto_id: string; partida_id?: string | null; monto: number | string }[]
): { tramos: TramoCosto[]; resto: number } {
  const total = Math.round(n(costo))
  const montoTratos = tratos.reduce((s, t) => s + n(t.monto), 0)
  if (total <= 0 || montoTratos <= 0 || n(totalHaberes) <= 0) return { tramos: [], resto: Math.max(0, total) }

  // El trato arrastra su parte proporcional de aportes del empleador
  const parte = Math.min(total, Math.round(total * Math.min(1, montoTratos / n(totalHaberes))))
  const grupos = new Map<string, TramoCosto>()
  for (const t of tratos) {
    const clave = `${t.proyecto_id}|${t.partida_id || ''}`
    const g = grupos.get(clave) ?? { proyecto_id: t.proyecto_id, partida_id: t.partida_id || null, horas: 0, monto: 0 }
    g.monto += n(t.monto)
    grupos.set(clave, g)
  }
  const lista = [...grupos.values()]
  const exactos = lista.map(g => parte * g.monto / montoTratos)
  const tramos = lista.map((g, i) => ({ ...g, monto: Math.floor(exactos[i]) }))
  let faltante = parte - tramos.reduce((s, t) => s + t.monto, 0)
  const orden = exactos.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto)
  for (const o of orden) { if (faltante <= 0) break; tramos[o.i].monto += 1; faltante -= 1 }
  return { tramos: tramos.filter(t => t.monto > 0), resto: total - parte }
}

/** Une tramos de la misma obra y partida. */
export function unirTramos(tramos: TramoCosto[]): TramoCosto[] {
  const grupos = new Map<string, TramoCosto>()
  for (const t of tramos) {
    const clave = `${t.proyecto_id}|${t.partida_id || ''}`
    const g = grupos.get(clave)
    if (g) { g.monto += t.monto; g.horas += t.horas }
    else grupos.set(clave, { ...t, partida_id: t.partida_id || null })
  }
  return [...grupos.values()]
}

// ─── Sueldo mensual estimado (proyecciones, nómina de RRHH) ──
// Para quien no gana sueldo fijo, una estimación de un mes normal: días trabajados más la
// semana corrida (un descanso pagado por semana). El monto real del mes sale de la liquidación.
const SEMANAS_MES = 52 / 12

export function sueldoMensualEstimado(
  emp: EmpleadoPago & { horas_extra?: number | string | null },
  p: { jornada_semanal?: number; dias_laborales?: number; ingreso_minimo?: number } = {}
): number {
  const dias = Number(p.dias_laborales) === 6 ? 6 : 5
  const jornada = Number(p.jornada_semanal) || 42
  const modalidad = (emp.modalidad || 'mensual') as ModalidadPago
  if (modalidad === 'diario') return Math.round(n(emp.valor_dia) * (dias + 1) * SEMANAS_MES)
  if (modalidad === 'por_hora') return Math.round(n(emp.valor_hora) * (jornada / dias) * (dias + 1) * SEMANAS_MES)
  if (modalidad === 'trato') return Math.max(Math.round(n(emp.sueldo)), Math.round(n(p.ingreso_minimo)))
  const base = Math.round(n(emp.sueldo))
  if (modalidad === 'por_metas') return base
  // Mensual y mixto: sueldo + horas extra con el factor legal
  return base + Math.round(base * (28 / (30 * 4 * jornada)) * 1.5 * n(emp.horas_extra))
}

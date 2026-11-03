// lib/feriados-cl.ts
// Feriados nacionales de Chile, calculados por año con las reglas legales de traslado.
// No incluye elecciones ni feriados regionales: esos días no se pueden calcular de antemano.

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const fecha = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const DIA = 86_400_000
const diaSemana = (t: number) => new Date(t).getUTCDay() // 0 domingo … 6 sábado

// Algoritmo de Butcher para el domingo de Pascua
function pascua(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return fecha(y, mes, dia)
}

// Ley 19.668: de martes a jueves se celebra el lunes de esa semana; el viernes, el lunes siguiente
function trasladarALunes(t: number): number {
  const s = diaSemana(t)
  if (s >= 2 && s <= 4) return t - (s - 1) * DIA
  if (s === 5) return t + 3 * DIA
  return t
}

// Ley 20.299: si cae martes, el viernes anterior; si cae miércoles, el viernes siguiente
function trasladarEvangelicas(t: number): number {
  const s = diaSemana(t)
  if (s === 2) return t - 4 * DIA
  if (s === 3) return t + 2 * DIA
  return t
}

// Ley 21.357: el día del solsticio de invierno. Lo fija cada año la autoridad; desde 2031 se asume el 21.
const SOLSTICIO: Record<number, number> = { 2021: 21, 2022: 21, 2023: 21, 2024: 20, 2025: 20, 2026: 21, 2027: 21, 2028: 20, 2029: 20, 2030: 21 }

const cache = new Map<number, Map<string, string>>()

export function feriadosDelAnio(y: number): Map<string, string> {
  const guardado = cache.get(y)
  if (guardado) return guardado

  const lista = new Map<string, string>()
  const poner = (t: number, nombre: string) => lista.set(iso(t), nombre)
  const domingoPascua = pascua(y)

  poner(fecha(y, 1, 1), 'Año Nuevo')
  poner(domingoPascua - 2 * DIA, 'Viernes Santo')
  poner(domingoPascua - DIA, 'Sábado Santo')
  poner(fecha(y, 5, 1), 'Día del Trabajo')
  poner(fecha(y, 5, 21), 'Glorias Navales')
  poner(fecha(y, 6, SOLSTICIO[y] ?? 21), 'Día de los Pueblos Indígenas')
  poner(trasladarALunes(fecha(y, 6, 29)), 'San Pedro y San Pablo')
  poner(fecha(y, 7, 16), 'Virgen del Carmen')
  poner(fecha(y, 8, 15), 'Asunción de la Virgen')
  poner(fecha(y, 9, 18), 'Independencia Nacional')
  poner(fecha(y, 9, 19), 'Glorias del Ejército')
  poner(trasladarALunes(fecha(y, 10, 12)), 'Encuentro de Dos Mundos')
  poner(trasladarEvangelicas(fecha(y, 10, 31)), 'Iglesias Evangélicas')
  poner(fecha(y, 11, 1), 'Todos los Santos')
  poner(fecha(y, 12, 8), 'Inmaculada Concepción')
  poner(fecha(y, 12, 25), 'Navidad')

  // Ley 20.983: el 2 de enero si el 1 cae domingo
  if (diaSemana(fecha(y, 1, 1)) === 0) poner(fecha(y, 1, 2), 'Feriado adicional de Año Nuevo')

  // Leyes 20.215 y 20.983: días adicionales de Fiestas Patrias
  const dieciocho = diaSemana(fecha(y, 9, 18))
  if (dieciocho === 2 || dieciocho === 6) poner(fecha(y, 9, 17), 'Feriado adicional de Fiestas Patrias')
  if (dieciocho === 3) poner(fecha(y, 9, 20), 'Feriado adicional de Fiestas Patrias')

  cache.set(y, lista)
  return lista
}

export const nombreFeriado = (fechaISO: string): string | null =>
  feriadosDelAnio(Number(fechaISO.slice(0, 4))).get(fechaISO.slice(0, 10)) ?? null

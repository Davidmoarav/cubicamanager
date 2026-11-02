// lib/liquidaciones.ts
// Estado de cada liquidación del mes: lo calculado en pantalla contra lo guardado.
// Solo lo guardado llega al costo de las obras. Funciones puras.

export type EstadoLiquidacion = 'sin_guardar' | 'guardada' | 'desactualizada' | 'pagada'

export const ETIQUETA_LIQUIDACION: Record<EstadoLiquidacion, string> = {
  sin_guardar: 'Sin guardar',
  guardada: 'Guardada',
  desactualizada: 'Datos cambiaron',
  pagada: 'Pagada',
}

export function estadoLiquidacion(
  guardada: { estado?: string | null; liquido_pagar?: number | null } | null | undefined,
  calculada: { liquido_pagar: number }
): EstadoLiquidacion {
  if (!guardada) return 'sin_guardar'
  if (guardada.estado === 'pagada') return 'pagada'
  if (guardada.liquido_pagar == null) return 'guardada'
  return Math.abs(Number(guardada.liquido_pagar) - calculada.liquido_pagar) > 1 ? 'desactualizada' : 'guardada'
}

// Lo guardado manda: un mes cerrado no cambia si después cambian los parámetros
export function valoresLiquidacion<T extends object>(guardada: Partial<T> | null | undefined, calculada: T): T {
  if (!guardada) return calculada
  const out = { ...calculada }
  for (const k of Object.keys(calculada) as (keyof T)[]) {
    if (guardada[k] != null) out[k] = guardada[k] as T[keyof T]
  }
  return out
}

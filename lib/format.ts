// lib/format.ts
// Helpers de formateo puros — sin 'use client', usables en Server y Client Components

export const fmt = (n: number) => {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-CL')
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// 'YYYY-MM-DD' (o con hora) → '8 oct 2026'. Sin Date: no se corre de día por la zona horaria.
export function fmtFecha(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return `${d} ${MESES[m - 1].slice(0, 3)} ${y}`
}

// 'YYYY-MM' → 'octubre 2026'
export function fmtPeriodo(periodo?: string | null): string {
  const [y, m] = String(periodo ?? '').split('-').map(Number)
  return y && m ? `${MESES[m - 1]} ${y}` : '—'
}

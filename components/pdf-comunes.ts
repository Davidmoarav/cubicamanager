// components/pdf-comunes.ts
// Paleta y helpers COMPARTIDOS por las 4 plantillas PDF
// (Cotización, Estado de Pago, Orden de Compra, Informe).
// Un solo lugar para el branding y los formatos chilenos.

export const PDF_NAVY = '#0F2B53'
export const PDF_GOLD = '#F5B800'
export const PDF_INK  = '#1a2535'
export const PDF_MUTE = '#6b7a8d'
export const PDF_LINE = '#d1d9e6'

export const IVA_PCT = 0.19

// Montos en pesos chilenos, siempre redondeados
export const fmtCL = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')

// Porcentaje con hasta 2 decimales
export const pctCL = (n: number) => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + '%'

// 15/03/2026
export const fechaCorta = (iso?: string) => {
  if (!iso) return '—'
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

// domingo, 15 de marzo de 2026
export const fechaLarga = (iso?: string) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return iso }
}

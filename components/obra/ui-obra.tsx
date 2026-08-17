'use client'
// components/obra/ui-obra.tsx — Piezas compartidas del módulo Obra

export const ESTADO_PROYECTO: Record<string, { label: string; dot: string; bg: string; color: string }> = {
  cotizacion: { label: 'Cotizando', dot: '#E5502A', bg: '#FCEAE3', color: '#C24019' },
  activo:     { label: 'En obra',   dot: '#1a7a4a', bg: '#e6f4ed', color: '#1a7a4a' },
  terminado:  { label: 'Terminado', dot: '#6b7a8d', bg: '#F1ECE6', color: '#6b7a8d' },
}

export function EstadoBadge({ estado }: { estado: string }) {
  const s = ESTADO_PROYECTO[estado] ?? { label: estado, dot: '#6b7a8d', bg: '#F1ECE6', color: '#6b7a8d' }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  )
}

export function Metrica({ label, valor, coral = false }: { label: string; valor: string; coral?: boolean }) {
  return (
    <div className="flex-1 min-w-[140px] px-5 py-3.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={['text-[19px] font-extrabold mt-0.5', coral ? 'text-om' : 'text-ink'].join(' ')}>
        {valor}
      </div>
    </div>
  )
}

export function fechaCorta(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

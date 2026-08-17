// components/ui.tsx
'use client'

import React from 'react'

// ── BADGE ────────────────────────────────────────────────
const BADGE_MAPS: Record<string, Record<string, { label: string; cls: string }>> = {
  proyecto: {
    activo:    { label: 'En curso',      cls: 'text-brand bg-brand-bg' },
    terminado: { label: 'Terminado',     cls: 'text-success bg-success-bg' },
    cotizacion:{ label: 'En cotización', cls: 'text-warning bg-warning-bg' },
  },
  empleado: {
    activo:    { label: 'Activo',     cls: 'text-success bg-success-bg' },
    vacaciones:{ label: 'Vacaciones', cls: 'text-warning bg-warning-bg' },
    inactivo:  { label: 'Inactivo',   cls: 'text-danger bg-danger-bg' },
  },
  factura: {
    pagada:   { label: 'Pagada',   cls: 'text-success bg-success-bg' },
    pendiente:{ label: 'Pendiente',cls: 'text-warning bg-warning-bg' },
    vencida:  { label: 'Vencida',  cls: 'text-danger bg-danger-bg' },
  },
  contrato: {
    ejecucion: { label: 'En ejecución', cls: 'text-brand bg-brand-bg' },
    liquidado: { label: 'Liquidado',    cls: 'text-success bg-success-bg' },
    pendiente: { label: 'Pendiente',    cls: 'text-warning bg-warning-bg' },
  },
  proveedor: {
    activo:    { label: 'Activo',     cls: 'text-success bg-success-bg' },
    cotizacion:{ label: 'Cotización', cls: 'text-warning bg-warning-bg' },
  },
}

export function Badge({ estado, tipo }: { estado: string; tipo: keyof typeof BADGE_MAPS }) {
  const s = BADGE_MAPS[tipo]?.[estado] ?? { label: estado, cls: 'text-muted bg-line' }
  return (
    <span className={`inline-block text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ── PROGRESS ─────────────────────────────────────────────
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-success' : 'bg-brand'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold min-w-[30px] ${pct === 100 ? 'text-success' : 'text-brand'}`}>{pct}%</span>
    </div>
  )
}

// ── METRIC CARD ───────────────────────────────────────────
export function MetricCard({ label, value, sub, subColor }: { label: string; value: string | number; sub?: string; subColor?: string }) {
  return (
    <div className="bg-white border border-line rounded-card p-4 shadow-card">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className="text-[22px] font-extrabold text-ink tabular-nums tracking-tight">{value}</div>
      {sub && (
        <div className="text-xs mt-0.5 text-muted" style={subColor ? { color: subColor } : undefined}>{sub}</div>
      )}
    </div>
  )
}

// ── BTN ───────────────────────────────────────────────────
type BtnVariant = 'default' | 'primary' | 'danger'
const btnVariants: Record<BtnVariant, string> = {
  default: 'bg-white border border-line2 text-ink hover:border-brand hover:text-brand',
  primary: 'bg-brand border border-brand text-white hover:bg-brand-dark hover:border-brand-dark',
  danger:  'bg-danger-bg border border-[#f5c6c2] text-danger hover:bg-[#fbdbd7]',
}
export function Btn({ children, onClick, variant = 'default', className = '', style, disabled, type = 'button' }:
  { children: React.ReactNode; onClick?: () => void; variant?: BtnVariant; className?: string; style?: React.CSSProperties; disabled?: boolean; type?: 'button'|'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold transition
        ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'} ${btnVariants[variant]} ${className}`}>
      {children}
    </button>
  )
}

// ── INPUT ─────────────────────────────────────────────────
export function FormInput({ label, value, onChange, type = 'text', placeholder, required }: {
  label?: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div className="mb-3">
      {label && <label className="label-base">{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
        className="input-base" />
    </div>
  )
}

// ── SELECT ────────────────────────────────────────────────
export function FormSelect({ label, value, onChange, options }: {
  label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div className="mb-3">
      {label && <label className="label-base">{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} className="input-base cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── MODAL ─────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/35 z-[100] flex items-center justify-center p-5">
      <div className={`bg-white rounded-card p-5 sm:p-7 w-full shadow-pop max-h-[90vh] overflow-y-auto ${wide ? 'max-w-[760px]' : 'max-w-[540px]'}`}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[17px] font-extrabold text-ink tracking-tight m-0">{title}</h3>
          <button onClick={onClose} className="bg-transparent border-none text-2xl cursor-pointer text-muted leading-none hover:text-ink transition">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── TABLE ─────────────────────────────────────────────────
export function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px]">{children}</table></div>
}
export function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2.5 border-b border-line font-bold text-[10.5px] uppercase tracking-wider text-muted whitespace-nowrap">{children}</th>
}
export function Td({ children, className = '', style, colSpan }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties; colSpan?: number }) {
  return <td className={`px-3 py-2.5 border-b border-line/60 ${className}`} style={style} colSpan={colSpan}>{children}</td>
}

// ── SECTION TITLE ─────────────────────────────────────────
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-extrabold text-ink tracking-tight m-0">{children}</h2>
}

// ── FORMAT HELPERS (re-exportados desde lib/format) ───────
export { fmt, fmtM } from '@/lib/format'
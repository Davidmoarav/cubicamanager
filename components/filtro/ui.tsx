'use client'
// Módulo Filtro DS27: las mismas piezas de la app original (Boton, Tarjeta, Modal…),
// dibujadas con la estética de Cubica Manager.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Estado } from '@/lib/filtro/evaluacion'

export const fmt = (n: number, decimales = 0) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const variantes: Record<Variante, string> = {
  primario: 'bg-om text-white border border-om hover:bg-om-dark disabled:opacity-50',
  secundario: 'bg-white text-ink border border-line2 hover:border-om hover:text-om disabled:text-subtle disabled:hover:border-line2',
  peligro: 'bg-white text-danger border border-danger/40 hover:bg-danger-bg',
  fantasma: 'text-muted border border-transparent hover:bg-canvas',
}

export function Boton({
  variante = 'secundario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed ${variantes[variante]} ${className}`}
      {...props}
    />
  )
}

const coloresEstado: Record<Estado, string> = {
  Listo: 'bg-success-bg text-success',
  Observado: 'bg-warning-bg text-warning',
  Incompleto: 'bg-canvas text-muted',
  'No admisible': 'bg-danger-bg text-danger',
}

export function InsigniaEstado({ estado, title }: { estado: Estado; title?: string }) {
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${coloresEstado[estado]}`}>
      {estado}
    </span>
  )
}

export function Cumple({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span className={`mt-0.5 font-bold ${ok ? 'text-success' : 'text-danger'}`}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-ink' : 'text-danger'}>{children}</span>
    </li>
  )
}

export function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="bg-white rounded-card border border-line shadow-card px-4 py-3.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{titulo}</div>
      <div className="mt-1 text-[22px] font-extrabold tabular-nums text-ink">{valor}</div>
      {detalle && <div className="mt-0.5 text-[12px] text-muted">{detalle}</div>}
    </div>
  )
}

export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = 'max-w-3xl',
}: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
  ancho?: string
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} rounded-card bg-white text-left shadow-pop`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[16px] font-extrabold text-ink">{titulo}</h2>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Cerrar">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="label-base">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-0.5 block text-[11.5px] text-subtle">{ayuda}</span>}
    </label>
  )
}

export const claseInput =
  'w-full rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-om disabled:bg-canvas disabled:text-muted'

export function Casilla({
  etiqueta,
  checked,
  onChange,
  detalle,
}: {
  etiqueta: string
  checked: boolean
  onChange: (v: boolean) => void
  detalle?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-om" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {etiqueta}
        {detalle && <span className="ml-1 text-[11.5px] text-subtle">{detalle}</span>}
      </span>
    </label>
  )
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-card border border-line p-4">
      <legend className="px-1 text-[13px] font-bold text-ink">{titulo}</legend>
      {children}
    </fieldset>
  )
}

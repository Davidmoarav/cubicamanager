'use client'
// components/SelectorFactura.tsx
// Buscador de facturas de compra para asociar a una OC (opción A: la factura
// es el documento definitivo del gasto).

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { fmt } from '@/components/ui'

export default function SelectorFactura({ value, label, onPick, onClear }: { value?: string; label?: string; onPick: (f: any) => void; onClear: () => void }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)
  const { data: facturas = [] } = useSWR<any[]>(
    open && q.trim().length >= 1 ? `/api/facturas?tipo=compra&doc_tipo=factura&buscar=${encodeURIComponent(q.trim())}` : null,
    fetcher,
  )

  if (value) {
    return (
      <div className="flex items-center justify-between bg-white border border-brand rounded-lg px-3 py-2">
        <span className="text-[12px]">Factura de compra {label ? <>N° <strong>{label}</strong></> : 'asociada'}</span>
        <button type="button" onClick={onClear} className="text-[12px] text-danger font-semibold">Quitar</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full py-2 bg-white border border-dashed border-line rounded-[6px] text-[12px] text-muted cursor-pointer">
        Asociar factura de compra (cuando llegue)…
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Folio o proveedor…"
            className="w-full px-3 py-2 text-[12px] border-b border-line outline-none sticky top-0 bg-white" />
          {q.trim().length < 1
            ? <div className="px-3 py-3 text-[11px] text-muted text-center">Escribe para buscar…</div>
            : facturas.length === 0
            ? <div className="px-3 py-3 text-[11px] text-muted text-center">Sin facturas de compra que coincidan</div>
            : facturas.map(f => (
              <button key={f.id} type="button" onClick={() => { onPick(f); setOpen(false); setQ('') }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-canvas border-b border-[#F1ECE6]">
                <span className="font-semibold text-ink">N° {f.numero}</span> · {f.cliente} <span className="text-muted">· {fmt(f.monto)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
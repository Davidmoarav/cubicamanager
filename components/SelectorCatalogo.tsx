'use client'
// components/SelectorCatalogo.tsx
// Buscador del catálogo del proveedor para agregar líneas a una OC.
// Al elegir un producto, dispara onPick con {descripcion, unidad, precio, codigo}.

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { fmt } from '@/components/ui'

export default function SelectorCatalogo({ proveedorId = '', onPick, label = '+ Agregar del catálogo del proveedor', mostrarSiempre = false }: { proveedorId?: string; onPick: (p: any) => void; label?: string; mostrarSiempre?: boolean }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)
  const url = open
    ? `/api/proveedor-productos?${proveedorId ? `proveedor_id=${proveedorId}` : ''}${q.trim() ? `${proveedorId ? '&' : ''}buscar=${encodeURIComponent(q.trim())}` : ''}`
    : null
  const { data: productos = [] } = useSWR<any[]>(url, fetcher)

  if (!mostrarSiempre && !proveedorId) return null

  return (
    <div className="relative mb-3">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full py-2 bg-white border border-dashed border-brand rounded-[6px] text-[12px] text-brand font-semibold cursor-pointer">
        {label}
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto por nombre o código…"
            className="w-full px-3 py-2 text-[12px] border-b border-line outline-none sticky top-0 bg-white" />
          {productos.length === 0
            ? <div className="px-3 py-4 text-[11px] text-muted text-center">{q.trim() ? 'Sin resultados' : (proveedorId ? 'Este proveedor no tiene catálogo cargado' : 'No hay productos en ningún catálogo')}</div>
            : productos.map(p => (
              <button key={p.id} type="button" onClick={() => onPick(p)}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-canvas border-b border-[#F1ECE6] flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="font-semibold text-ink">{p.descripcion}</span>
                  {p.codigo ? <span className="text-muted"> · {p.codigo}</span> : null}
                </span>
                <span className="text-muted whitespace-nowrap">{p.unidad} · {fmt(p.precio)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
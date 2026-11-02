'use client'
// components/BuscadorGlobal.tsx
// Busca pantallas, obras, clientes, proveedores, facturas y órdenes desde cualquier lugar.
// AppTopNav lo abre con su botón o con Ctrl/Cmd + K.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { fmt } from '@/lib/format'
import { menuPorRol } from '@/lib/nav'

interface Resultado {
  clave: string
  grupo: string
  texto: string
  detalle?: string
  href: string
}

const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const lista = (d: any): any[] => (Array.isArray(d) ? d : [])

export default function BuscadorGlobal({ rol, onClose }: { rol: string; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onClose])

  const term = q.trim()
  const params = encodeURIComponent(term)
  const conTexto = term.length >= 2
  const { data: obras } = useSWR<any[]>('/api/proyectos', fetcher)
  const { data: clientes } = useSWR<any[]>('/api/clientes', fetcher)
  const { data: proveedores } = useSWR<any[]>('/api/proveedores', fetcher)
  const { data: facturas } = useSWR<any[]>(conTexto && rol !== 'jefe_obra' ? `/api/facturas?buscar=${params}` : null, fetcher)
  const { data: ordenes } = useSWR<any[]>(conTexto ? `/api/ordenes-compra?buscar=${params}` : null, fetcher)

  const resultados = useMemo<Resultado[]>(() => {
    if (term.length < 2) return []
    const n = normalizar(term)
    const calza = (...campos: unknown[]) => campos.some(c => normalizar(c).includes(n))
    return [
      ...menuPorRol(rol).filter(m => calza(m.label)).map(m => ({ clave: `p-${m.href}`, grupo: 'Pantallas', texto: m.label, href: m.href })),
      ...lista(obras).filter(o => calza(o.nombre, o.cliente)).slice(0, 5).map(o => ({ clave: `o-${o.id}`, grupo: 'Obras', texto: o.nombre, detalle: o.cliente, href: `/obra/${o.id}?tab=resumen` })),
      ...lista(clientes).filter(c => calza(c.razon_social, c.rut)).slice(0, 5).map(c => ({ clave: `c-${c.id}`, grupo: 'Clientes', texto: c.razon_social, detalle: c.rut, href: '/clientes' })),
      ...lista(proveedores).filter(p => calza(p.nombre, p.rut)).slice(0, 5).map(p => ({ clave: `v-${p.id}`, grupo: 'Proveedores', texto: p.nombre, detalle: p.rut, href: '/proveedores' })),
      ...lista(facturas).slice(0, 5).map(f => ({
        clave: `f-${f.id}`, grupo: 'Facturas', texto: `N°${f.numero ?? 's/n'} · ${f.cliente ?? ''}`, detalle: fmt(f.monto),
        href: f.periodo ? `/facturacion?periodo=${f.periodo}` : '/facturacion',
      })),
      ...lista(ordenes).slice(0, 5).map(o => ({ clave: `r-${o.id}`, grupo: 'Órdenes de compra', texto: `#${o.numero} · ${o.proveedor || 'Sin proveedor'}`, detalle: o.proyecto, href: '/ordenes-compra' })),
    ]
  }, [term, rol, obras, clientes, proveedores, facturas, ordenes])

  const ir = (href: string) => { onClose(); router.push(href) }

  return (
        <div className="fixed inset-0 bg-black/35 z-[150] flex items-start justify-center p-5 pt-[10vh]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
          <div role="dialog" aria-modal="true" aria-label="Buscar en la app" className="bg-white rounded-card w-full max-w-[560px] shadow-pop overflow-hidden">
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && resultados[0]) ir(resultados[0].href) }}
              placeholder="Busca una obra, cliente, factura o pantalla…"
              className="w-full px-5 py-4 text-[15px] text-ink outline-none border-b border-line" />
            <div className="max-h-[50vh] overflow-y-auto py-2">
              {term.length < 2 && <p className="px-5 py-3 text-[13px] text-muted">Escribe al menos 2 letras.</p>}
              {term.length >= 2 && resultados.length === 0 && <p className="px-5 py-3 text-[13px] text-muted">Sin resultados para "{term}".</p>}
              {resultados.map((r, i) => (
                <div key={r.clave}>
                  {(i === 0 || resultados[i - 1].grupo !== r.grupo) && (
                    <div className="px-5 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">{r.grupo}</div>
                  )}
                  <button onClick={() => ir(r.href)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-2 text-left text-[13px] text-ink bg-transparent border-none cursor-pointer hover:bg-canvas transition">
                    <span className="font-semibold truncate">{r.texto}</span>
                    {r.detalle && <span className="text-[12px] text-muted shrink-0">{r.detalle}</span>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
  )
}

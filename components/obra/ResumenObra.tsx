'use client'
// components/obra/ResumenObra.tsx
// Primera pestaña de una obra: cómo va, qué falta y qué se hace más seguido.

import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { MetricCard } from '@/components/ui'
import { fmt } from '@/lib/format'
import { pendientesObra } from '@/lib/pendientes'
import { usePermisos } from '@/lib/usePermisos'

const ACCIONES = [
  { tab: 'parte', texto: 'Registrar horas' },
  { tab: 'control', texto: 'Actualizar avance' },
  { tab: 'libro', texto: 'Anotar en el libro' },
  { tab: 'pagos', texto: 'Registrar gasto o cobro' },
  { tab: 'gantt', texto: 'Ver programación' },
]

export default function ResumenObra({ proyecto, partidas, estadosPago, irA }: {
  proyecto: any
  partidas: any[]
  estadosPago: any[]
  irA: (tab: string) => void
}) {
  const { puedeEditar } = usePermisos('obra')
  const { data: informe, error: errorInforme } = useSWR<any>(`/api/informe?proyecto_id=${proyecto.id}`, fetcher)
  const { data: ordenes } = useSWR<any[]>(`/api/ordenes-compra?limit=100&obra=${proyecto.id}`, fetcher)

  const sinDato = errorInforme ? '—' : '…'
  const k = informe?.kpis
  const c = informe?.costos
  const hoy = new Date().toISOString().slice(0, 10)
  const pendientes = pendientesObra({
    proyecto, partidas, estadosPago, hoy, ordenes: Array.isArray(ordenes) ? ordenes : null,
  })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Avance" value={`${Math.round(Number(proyecto.avance) || 0)}%`} sub={`${partidas.length} partidas`} />
        <MetricCard label="Gasto real" value={c ? fmt(c.gasto_real) : sinDato} sub={c ? `${c.pct_gastado}% del presupuesto de costo` : undefined} />
        <MetricCard label="Margen real" value={c ? `${c.margen_real_pct}%` : sinDato} sub={c ? `Esperado ${c.margen_venta_pct}%` : undefined} />
        <MetricCard label="Cobrado" value={k ? `${k.cobrado_pct}%` : sinDato} sub={k ? `Por facturar ${fmt(k.saldo_por_facturar)}` : undefined} />
      </div>

      <div className={`grid gap-5 ${puedeEditar ? 'lg:grid-cols-[1fr_300px]' : ''}`}>
        <div className="bg-white rounded-card border border-line shadow-card p-5">
          <h2 className="text-[14px] font-extrabold text-ink mb-3">Qué falta</h2>
          {pendientes.length === 0 ? (
            <p className="text-[13px] text-muted">Nada pendiente en esta obra.</p>
          ) : (
            <ul className="flex flex-col">
              {pendientes.map(p => {
                const clase = 'w-full flex items-center justify-between gap-3 py-2.5 border-b border-canvas text-left text-[13px] font-semibold bg-transparent cursor-pointer hover:text-brand transition'
                const contenido = (
                  <>
                    <span className={p.urgente ? 'text-danger' : 'text-ink'}>{p.texto}</span>
                    <span className="text-muted" aria-hidden="true">›</span>
                  </>
                )
                return (
                  <li key={p.id}>
                    {p.href
                      ? <Link href={p.href} className={clase}>{contenido}</Link>
                      : <button onClick={() => irA(p.tab as string)} className={`${clase} border-x-0 border-t-0`}>{contenido}</button>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {puedeEditar && (
          <div className="bg-white rounded-card border border-line shadow-card p-5">
            <h2 className="text-[14px] font-extrabold text-ink mb-3">Acciones frecuentes</h2>
            <div className="flex flex-col gap-2">
              {ACCIONES.map(a => (
                <button key={a.tab} onClick={() => irA(a.tab)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-line text-[13px] font-semibold text-ink bg-white hover:bg-canvas cursor-pointer transition">
                  {a.texto}
                </button>
              ))}
              <Link href="/ordenes-compra" className="px-3 py-2.5 rounded-lg border border-line text-[13px] font-semibold text-ink hover:bg-canvas transition">
                Crear orden de compra
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

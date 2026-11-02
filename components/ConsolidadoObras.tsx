'use client'
// components/ConsolidadoObras.tsx
// Empresa = suma de las obras: ingresos, costos e IVA de cada una, más lo que no
// tiene obra asignada. Por eso la fila "Sin obra" es lo que falta imputar.

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { fmt, fmtM } from '@/components/ui'

const COLUMNAS = [
  { k: 'cobrado', label: 'Cobrado' },
  { k: 'por_cobrar', label: 'Por cobrar' },
  { k: 'vencido', label: 'Vencido' },
  { k: 'compras', label: 'Compras' },
  { k: 'gastos', label: 'Otros gastos' },
  { k: 'nomina', label: 'Sueldos' },
  { k: 'costo_total', label: 'Costo total' },
  { k: 'iva_debito', label: 'IVA débito' },
  { k: 'iva_credito', label: 'IVA crédito' },
]

export default function ConsolidadoObras() {
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7))
  const { data, error, isLoading } = useSWR<any>(`/api/finanzas/consolidado${periodo ? `?periodo=${periodo}` : ''}`, fetcher)

  const filas: any[] = Array.isArray(data?.filas) ? data.filas : []
  const sinObra = filas.find(f => !f.proyecto_id)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label className="text-[13px] font-semibold text-ink" htmlFor="consolidado-periodo">Período:</label>
        <input id="consolidado-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="input-base !mb-0 !py-1.5 w-[170px]" />
        <button onClick={() => setPeriodo('')} aria-pressed={!periodo}
          className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition ${!periodo ? 'bg-brand text-white' : 'text-muted bg-white border border-line hover:text-ink'}`}>
          Todo el historial
        </button>
      </div>

      {sinObra && sinObra.costo_total + sinObra.cobrado + sinObra.por_cobrar + sinObra.vencido !== 0 && (
        <div className="mb-4 text-[12.5px] font-semibold text-warning bg-warning-bg rounded-lg px-3.5 py-2.5">
          Hay {fmtM(sinObra.costo_total)} de costo y {fmtM(sinObra.cobrado + sinObra.por_cobrar + sinObra.vencido)} de ingresos sin obra:
          asígnalos para que el resultado de cada obra esté completo.
        </div>
      )}

      <div className="bg-white border border-line rounded-card p-4 shadow-card overflow-x-auto">
        {isLoading ? (
          <p className="text-muted text-center py-10 text-[13px]">Armando el consolidado…</p>
        ) : error || data?.error ? (
          <p className="text-danger text-center py-10 text-[13px]">No se pudo armar el consolidado{data?.error ? `: ${data.error}` : '.'}</p>
        ) : filas.length === 0 ? (
          <p className="text-muted text-center py-10 text-[13px]">Sin movimientos en este período.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px] min-w-[960px]">
            <thead>
              <tr className="border-b-2 border-line2 text-left">
                <th scope="col" className="py-2 px-2 font-bold text-muted">Obra</th>
                {COLUMNAS.map(c => <th key={c.k} scope="col" className="py-2 px-2 font-bold text-muted text-right whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.proyecto_id ?? 'sin'} className={`border-b border-canvas ${f.proyecto_id ? '' : 'bg-canvas/70'}`}>
                  <td className="py-2 px-2 font-bold text-ink">
                    {f.proyecto_id
                      ? <Link href={`/obra/${f.proyecto_id}`} className="hover:text-brand">{f.nombre}</Link>
                      : f.nombre}
                  </td>
                  {COLUMNAS.map(c => <td key={c.k} className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-ink">{fmt(f[c.k])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line2 font-extrabold">
                <td className="py-2 px-2 text-ink">Total empresa</td>
                {COLUMNAS.map(c => <td key={c.k} className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{fmt(data.totales[c.k])}</td>)}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-[11.5px] text-muted mt-2">
        Montos con IVA en ingresos y netos en costos, igual que en el resto de Finanzas. El IVA por obra es referencial: la declaración es
        de la empresa, y el remanente y el PPM no se reparten entre obras.
      </p>
    </div>
  )
}

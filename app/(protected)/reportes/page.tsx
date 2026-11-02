'use client'
// app/(protected)/reportes/page.tsx
// Comparativo de todas las obras: costo real, margen, cobros y caja.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { MetricCard, SectionTitle, fmt, fmtM } from '@/components/ui'

const COLUMNAS: { k: string; label: string; alinear?: 'right' }[] = [
  { k: 'nombre', label: 'Obra' },
  { k: 'avance_fisico', label: 'Avance', alinear: 'right' },
  { k: 'contrato', label: 'Contrato', alinear: 'right' },
  { k: 'presupuesto_costo', label: 'Costo presup.', alinear: 'right' },
  { k: 'gasto_real', label: 'Gasto real', alinear: 'right' },
  { k: 'desviacion_ejecutada', label: 'Desviación', alinear: 'right' },
  { k: 'margen_real_pct', label: 'Margen real', alinear: 'right' },
  { k: 'cobrado', label: 'Cobrado', alinear: 'right' },
  { k: 'retencion_saldo', label: 'Retención', alinear: 'right' },
  { k: 'saldo_caja', label: 'Caja', alinear: 'right' },
]

const ESTADOS = [
  { value: 'activo', label: 'En curso' },
  { value: 'terminado', label: 'Terminadas' },
  { value: 'cotizacion', label: 'En cotización' },
  { value: '', label: 'Todas' },
]

export default function ReportesPage() {
  const { data, error, isLoading } = useSWR<any[]>('/api/reportes/obras', fetcher)
  const [estado, setEstado] = useState('activo')
  const [orden, setOrden] = useState<{ k: string; asc: boolean }>({ k: 'margen_real_pct', asc: true })

  const filas = useMemo(() => {
    const lista = (Array.isArray(data) ? data : []).filter(f => !estado || f.estado === estado)
    return [...lista].sort((a, b) => {
      const r = typeof a[orden.k] === 'string'
        ? String(a[orden.k]).localeCompare(String(b[orden.k]))
        : (Number(a[orden.k]) || 0) - (Number(b[orden.k]) || 0)
      return orden.asc ? r : -r
    })
  }, [data, estado, orden])

  const suma = (k: string) => filas.reduce((s, f) => s + (Number(f[k]) || 0), 0)
  const ventaEjecutada = suma('venta_ejecutada')
  const gananciaReal = suma('ganancia_real')
  const margenTotal = ventaEjecutada > 0 ? Math.round((gananciaReal / ventaEjecutada) * 100) : 0
  const conPerdida = filas.filter(f => f.ganancia_real < 0).length
  const sobreCosto = filas.filter(f => f.desviacion_ejecutada < 0).length

  const celda = (f: any, k: string) => {
    switch (k) {
      case 'avance_fisico': return `${f.avance_fisico}%`
      case 'margen_real_pct': return `${f.margen_real_pct}% (${f.margen_esperado_pct}%)`
      default: return fmt(Number(f[k]) || 0)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <SectionTitle>Reportes por obra</SectionTitle>
        <p className="text-sm text-muted mt-1">Compara el costo real, el margen y la caja de tus obras. Montos netos.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Obras" value={filas.length} sub={conPerdida > 0 ? `${conPerdida} con pérdida a la fecha` : 'Ninguna con pérdida a la fecha'} subColor={conPerdida > 0 ? '#b0401a' : undefined} />
        <MetricCard label="Gasto real" value={fmtM(suma('gasto_real'))} sub={`${sobreCosto} sobre el costo de su avance`} subColor={sobreCosto > 0 ? '#b0401a' : undefined} />
        <MetricCard label="Margen real" value={`${margenTotal}%`} sub={`${fmtM(gananciaReal)} a la fecha`} subColor={gananciaReal < 0 ? '#b0401a' : undefined} />
        <MetricCard label="Caja de las obras" value={fmtM(suma('saldo_caja'))} sub={`Cobrado ${fmtM(suma('cobrado'))}`} />
      </div>

      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-4 shadow-card flex-wrap">
        {ESTADOS.map(e => (
          <button key={e.value} onClick={() => setEstado(e.value)} aria-pressed={estado === e.value}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition ${estado === e.value ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {e.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-line rounded-card p-4 shadow-card overflow-x-auto">
        {isLoading ? (
          <p className="text-muted text-center py-10 text-[13px]">Armando el reporte…</p>
        ) : error || (data as any)?.error ? (
          <p className="text-danger text-center py-10 text-[13px]">No se pudo armar el reporte{(data as any)?.error ? `: ${(data as any).error}` : '.'}</p>
        ) : filas.length === 0 ? (
          <p className="text-muted text-center py-10 text-[13px]">Sin obras en este filtro.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px] min-w-[1000px]">
            <thead>
              <tr className="border-b-2 border-line2">
                {COLUMNAS.map(c => (
                  <th key={c.k} scope="col" aria-sort={orden.k === c.k ? (orden.asc ? 'ascending' : 'descending') : 'none'}
                    className={`py-2 px-2 font-bold text-muted whitespace-nowrap ${c.alinear === 'right' ? 'text-right' : 'text-left'}`}>
                    <button onClick={() => setOrden(o => ({ k: c.k, asc: o.k === c.k ? !o.asc : c.k === 'nombre' }))} className="font-bold hover:text-ink">
                      {c.label}{orden.k === c.k ? (orden.asc ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.proyecto_id} className="border-b border-canvas hover:bg-canvas/60">
                  {COLUMNAS.map(c => c.k === 'nombre' ? (
                    <td key={c.k} className="py-2 px-2">
                      <Link href={`/obra/${f.proyecto_id}`} className="font-bold text-ink hover:text-brand">{f.nombre}</Link>
                      <div className="text-[11px] text-muted">{f.cliente}</div>
                    </td>
                  ) : (
                    <td key={c.k} className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${
                      (c.k === 'desviacion_ejecutada' || c.k === 'margen_real_pct' || c.k === 'saldo_caja') && Number(f[c.k]) < 0 ? 'text-danger font-bold' : 'text-ink'
                    }`}>
                      {celda(f, c.k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line2 font-extrabold">
                <td className="py-2 px-2 text-ink">Total</td>
                <td />
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('contrato'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('presupuesto_costo'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('gasto_real'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('desviacion_ejecutada'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{margenTotal}%</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('cobrado'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('retencion_saldo'))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(suma('saldo_caja'))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-[11.5px] text-muted mt-2">
        Desviación: costo que correspondía al avance menos gasto real; negativa, vas sobre el costo. Margen real entre paréntesis el esperado.
        Caja: entradas menos gastos registrados hasta hoy.
      </p>
    </div>
  )
}

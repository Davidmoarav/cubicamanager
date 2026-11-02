'use client'
// components/ConciliacionSII.tsx
// Compara el Registro de Compras y Ventas del SII con lo cargado en el sistema.
// No modifica nada por sí sola; importar lo que falta es una acción aparte.

import { useState } from 'react'
import { Btn, Modal, fmt } from '@/components/ui'
import { decodificarCSV, parsearRCV, type FilaRCV } from '@/lib/sii'

const ESTADOS: Record<string, { label: string; cls: string }> = {
  diferencia:   { label: 'Montos distintos', cls: 'bg-danger-bg text-danger' },
  solo_sii:     { label: 'Falta en el sistema', cls: 'bg-warning-bg text-warning' },
  solo_sistema: { label: 'No está en el SII', cls: 'bg-warning-bg text-warning' },
  otro_periodo: { label: 'En otro período', cls: 'bg-warning-bg text-warning' },
  cuadra:       { label: 'Cuadra', cls: 'bg-success-bg text-success' },
}
const ORDEN = ['diferencia', 'solo_sii', 'solo_sistema', 'otro_periodo', 'cuadra']

export default function ConciliacionSII({ onImportado, periodoInicial }: { onImportado: () => void; periodoInicial: string }) {
  const [open, setOpen]       = useState(false)
  const [tipo, setTipo]       = useState<'compra' | 'venta'>('compra')
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [filas, setFilas]     = useState<FilaRCV[] | null>(null)
  const [archivo, setArchivo] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const [cargando, setCargando]   = useState(false)
  const [error, setError]     = useState('')
  const [aviso, setAviso]     = useState('')
  const [vista, setVista]     = useState('pendientes')

  const conciliar = async (lista: FilaRCV[], t = tipo, p = periodo) => {
    setCargando(true)
    setError('')
    const res = await fetch('/api/conciliacion-sii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: t, periodo: p, filas: lista }),
    })
    const j = await res.json().catch(() => ({}))
    setCargando(false)
    if (!res.ok) { setError(j.error || 'No se pudo conciliar'); return }
    setResultado(j)
  }

  const leerArchivo = (file: File) => {
    setError(''); setAviso(''); setResultado(null); setArchivo(file.name)
    const t = /venta/i.test(file.name) ? 'venta' : /compra/i.test(file.name) ? 'compra' : tipo
    setTipo(t)
    const reader = new FileReader()
    reader.onload = e => {
      const r = parsearRCV(decodificarCSV(e.target?.result as ArrayBuffer))
      if (r.error) { setError(r.error); setFilas(null); return }
      // El período suele venir en los documentos: se propone el más frecuente
      const cuenta: Record<string, number> = {}
      for (const f of r.filas) if (f.periodo) cuenta[f.periodo] = (cuenta[f.periodo] || 0) + 1
      const p = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? periodo
      setPeriodo(p)
      setFilas(r.filas)
      conciliar(r.filas, t, p)
    }
    reader.onerror = () => setError('No se pudo leer el archivo')
    reader.readAsArrayBuffer(file)
  }

  const importarFaltantes = async () => {
    const faltan = (resultado?.items ?? []).filter((i: any) => i.estado === 'solo_sii').map((i: any) => i.registro)
    if (!confirm(`¿Importar ${faltan.length} ${faltan.length === 1 ? 'documento' : 'documentos'} que faltan en el sistema?`)) return
    setCargando(true)
    setError('')
    const res = await fetch('/api/importar-sii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, filas: faltan }),
    })
    const j = await res.json().catch(() => ({}))
    setCargando(false)
    if (!res.ok) { setError(j.error || 'No se pudo importar'); return }
    setAviso(`${j.insertadas ?? 0} importados. Las notas importadas así quedan sin asociar a su factura.`)
    onImportado()
    if (filas) conciliar(filas)
  }

  const cerrar = () => { setOpen(false); setResultado(null); setFilas(null); setArchivo(''); setError(''); setAviso('') }
  const r = resultado?.resumen
  const items: any[] = (resultado?.items ?? [])
    .filter((i: any) => vista === 'todos' || i.estado !== 'cuadra')
    .sort((a: any, b: any) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado))

  return (
    <>
      <Btn onClick={() => setOpen(true)}>Conciliar con SII</Btn>
      {open && (
        <Modal title="Conciliar con el Registro del SII" onClose={cerrar} wide>
          <p className="text-[12px] text-muted mb-3">
            Sube el Registro de Compras o Ventas del mes. Se compara por folio, tipo de documento y RUT; nada cambia hasta que decidas importar.
          </p>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="label-base" htmlFor="conc-tipo">Registro de</label>
              <select id="conc-tipo" value={tipo} onChange={e => setTipo(e.target.value as any)} className="input-base !mb-0 !py-1.5 cursor-pointer">
                <option value="compra">Compras</option>
                <option value="venta">Ventas</option>
              </select>
            </div>
            <div>
              <label className="label-base" htmlFor="conc-periodo">Período</label>
              <input id="conc-periodo" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-base !mb-0 !py-1.5" />
            </div>
            <label className="px-3.5 py-2 rounded-lg border border-line2 bg-white text-[13px] font-semibold cursor-pointer hover:bg-canvas">
              {archivo || 'Elegir archivo CSV'}
              <input type="file" accept=".csv,text/csv" className="hidden" aria-label="Archivo del registro"
                onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = '' }} />
            </label>
            {filas && <Btn onClick={() => conciliar(filas)} disabled={cargando}>{cargando ? 'Comparando…' : 'Volver a comparar'}</Btn>}
          </div>

          {error && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{error}</div>}
          {aviso && <div className="mb-3 text-[12px] font-semibold text-success bg-success-bg rounded-lg px-3 py-2">{aviso}</div>}

          {r && (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full border-collapse text-[12.5px] min-w-[420px]">
                  <thead>
                    <tr className="border-b-2 border-line2">
                      <th scope="col" className="py-1.5 pr-2 text-left font-bold text-muted"></th>
                      <th scope="col" className="py-1.5 px-2 text-right font-bold text-muted">Neto</th>
                      <th scope="col" className="py-1.5 px-2 text-right font-bold text-muted">IVA</th>
                      <th scope="col" className="py-1.5 pl-2 text-right font-bold text-muted">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-canvas">
                      <th scope="row" className="py-1.5 pr-2 text-left font-semibold text-ink">SII</th>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.neto_sii)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.iva_sii)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{fmt(r.total_sii)}</td>
                    </tr>
                    <tr className="border-b border-canvas">
                      <th scope="row" className="py-1.5 pr-2 text-left font-semibold text-ink">Sistema</th>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.neto_sistema)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.iva_sistema)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{fmt(r.total_sistema)}</td>
                    </tr>
                    <tr className="font-extrabold">
                      <th scope="row" className="py-1.5 pr-2 text-left text-ink">Diferencia</th>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.neto_sii - r.neto_sistema)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.iva_sii - r.iva_sistema)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{fmt(r.total_sii - r.total_sistema)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  {ORDEN.map(e => (
                    <span key={e} className={`px-2 py-0.5 rounded ${ESTADOS[e].cls}`}>{ESTADOS[e].label}: {r[e]}</span>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <select value={vista} onChange={e => setVista(e.target.value)} aria-label="Qué documentos ver"
                    className="text-[12px] px-2 py-1 border border-line2 rounded-lg bg-white cursor-pointer">
                    <option value="pendientes">Solo diferencias</option>
                    <option value="todos">Todos</option>
                  </select>
                  {r.solo_sii > 0 && <Btn variant="primary" onClick={importarFaltantes} disabled={cargando}>Importar {r.solo_sii} que faltan</Btn>}
                </div>
              </div>

              {items.length === 0 ? (
                <p className="text-[13px] font-semibold text-success text-center py-6">Todo cuadra con el registro del SII.</p>
              ) : (
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full border-collapse text-[12px] min-w-[640px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b-2 border-line2 text-left">
                        <th scope="col" className="py-1.5 pr-2 font-bold text-muted">Estado</th>
                        <th scope="col" className="py-1.5 px-2 font-bold text-muted">Folio</th>
                        <th scope="col" className="py-1.5 px-2 font-bold text-muted">Contraparte</th>
                        <th scope="col" className="py-1.5 px-2 font-bold text-muted text-right">Total SII</th>
                        <th scope="col" className="py-1.5 pl-2 font-bold text-muted text-right">Total sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, n) => (
                        <tr key={`${i.numero}-${n}`} className="border-b border-canvas">
                          <td className="py-1.5 pr-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${ESTADOS[i.estado].cls}`}>{ESTADOS[i.estado].label}</span>
                            {i.estado === 'otro_periodo' && <span className="text-[10.5px] text-muted"> {i.periodo_sistema}</span>}
                          </td>
                          <td className="py-1.5 px-2 font-mono font-bold">{i.numero || '—'}</td>
                          <td className="py-1.5 px-2 truncate max-w-[220px]">{i.contraparte}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{i.total_sii === null ? '—' : fmt(i.total_sii)}</td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">{i.total_sistema === null ? '—' : fmt(i.total_sistema)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  )
}

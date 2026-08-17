'use client'
// components/ManoObraPanel.tsx
//
// Proyección de mano de obra de un proyecto: dotación mes a mes (curva
// editable), costo con imposiciones, finiquitos y gasto pendiente.
// Modelo híbrido: sugiere desde empleados reales asignados, luego editable.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Btn } from '@/components/ui'
import { fmt } from '@/lib/format'

interface Props {
  proyectoId: string
  proyectoNombre?: string
}

interface Fila {
  mes: string
  dotacion: number
  costo_unitario: number
  finiquito: number
}

const labelMes = (m: string) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[Number(mo) - 1] || mo} ${y}`
}

export default function ManoObraPanel({ proyectoId, proyectoNombre = '' }: Props) {
  const [filas, setFilas]     = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [asignados, setAsignados] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetch(`/api/proyeccion-mo?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => null)
    setFilas(Array.isArray(data?.filas) ? data.filas : [])
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { load() }, [load])

  const sugerir = async () => {
    const sug = await fetch(`/api/proyeccion-mo?proyecto_id=${proyectoId}&sugerir=1`).then(r => r.json()).catch(() => null)
    if (!sug) return
    setAsignados(sug.empleados_asignados ?? 0)
    if (!sug.filas?.length) { alert('No se pudo generar una curva. Verifica las fechas de inicio/fin del proyecto.'); return }
    if (sug.empleados_asignados === 0) {
      alert('No hay empleados activos asignados a este proyecto. Se generó la curva de meses con dotación 0; asigna empleados o edita la dotación manualmente.')
    }
    setFilas(sug.filas)
  }

  const updFila = (idx: number, campo: keyof Fila, valor: number) => {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, [campo]: valor } : f))
  }

  const addMes = () => {
    // Agrega el mes siguiente al último
    const last = filas[filas.length - 1]
    let nuevoMes: string
    if (last) {
      const [y, m] = last.mes.split('-').map(Number)
      const d = new Date(y, m, 1) // m es 1-based → siguiente mes
      nuevoMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    } else {
      const d = new Date()
      nuevoMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    setFilas(prev => [...prev, { mes: nuevoMes, dotacion: last?.dotacion ?? 0, costo_unitario: last?.costo_unitario ?? 0, finiquito: 0 }])
  }

  const delMes = (idx: number) => setFilas(prev => prev.filter((_, i) => i !== idx))

  const guardar = async () => {
    setSaving(true)
    const res = await fetch('/api/proyeccion-mo', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, filas }),
    })
    if (res.ok) { setSavedAt(Date.now()); await load() }
    setSaving(false)
  }

  // ─── Cálculos en vivo ───
  const totales = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 7)
    let costoMo = 0, finiquitos = 0, pendiente = 0, dotActual = 0, costoActual = 0
    const maxDot = filas.reduce((m, f) => Math.max(m, f.dotacion || 0), 0) || 1
    for (const f of filas) {
      const costoMes = (f.dotacion || 0) * (f.costo_unitario || 0)
      costoMo += costoMes
      finiquitos += f.finiquito || 0
      if (f.mes >= hoy) pendiente += costoMes + (f.finiquito || 0)
      if (f.mes === hoy) { dotActual = f.dotacion || 0; costoActual = costoMes }
    }
    if (!dotActual && filas.length) {
      const fut = filas.find(f => f.mes >= hoy) || filas[0]
      dotActual = fut.dotacion || 0
      costoActual = (fut.dotacion || 0) * (fut.costo_unitario || 0)
    }
    return { costoMo, finiquitos, total: costoMo + finiquitos, pendiente, dotActual, costoActual, maxDot }
  }, [filas])

  if (loading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando proyección…</div>

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Proyección de mano de obra</h4>
          <p className="text-[12px] text-muted mt-0.5">Dotación mes a mes, costo con imposiciones y finiquitos.</p>
        </div>
        <div className="flex gap-2">
          <Btn onClick={sugerir}>Sugerir curva</Btn>
          <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>

      {savedAt && Date.now() - savedAt < 4000 && (
        <div className="mb-3 text-[12px] text-success font-semibold">Proyección guardada</div>
      )}
      {asignados === 0 && (
        <div className="mb-3 text-[12px] text-warning bg-warning-bg rounded-lg px-3 py-2">
          Sin empleados activos asignados a este proyecto. Asígnalos en RRHH (campo proyecto) o edita la dotación manualmente.
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="border border-line rounded-card p-3">
          <div className="text-[11px] text-muted">Dotación actual</div>
          <div className="text-lg font-extrabold text-ink">{totales.dotActual}</div>
        </div>
        <div className="border border-line rounded-card p-3">
          <div className="text-[11px] text-muted">Costo mensual actual</div>
          <div className="text-lg font-extrabold text-brand">{fmt(totales.costoActual)}</div>
        </div>
        <div className="border border-line rounded-card p-3">
          <div className="text-[11px] text-muted">Gasto pendiente</div>
          <div className="text-lg font-extrabold text-danger">{fmt(totales.pendiente)}</div>
        </div>
        <div className="border border-line rounded-card p-3">
          <div className="text-[11px] text-muted">Costo total proyectado</div>
          <div className="text-lg font-extrabold text-ink">{fmt(totales.total)}</div>
        </div>
      </div>

      {filas.length === 0
        ? <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
            Sin proyección. Usa "Sugerir curva" para generarla desde los empleados asignados, o agrega meses manualmente.
            <div className="mt-3"><Btn onClick={addMes}>+ Agregar mes</Btn></div>
          </div>
        : (
          <>
            {/* Mini gráfico de dotación */}
            <div className="flex items-end gap-1.5 h-24 mb-4 px-1">
              {filas.map((f, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full bg-brand rounded-t transition-all"
                    style={{ height: `${((f.dotacion || 0) / totales.maxDot) * 100}%` }} />
                  <span className="text-[9px] text-muted">{f.dotacion}</span>
                </div>
              ))}
            </div>

            {/* Tabla editable */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b-2 border-line2 text-left">
                    <th className="py-2 pr-2 font-bold text-muted">Mes</th>
                    <th className="py-2 px-2 font-bold text-muted text-center">Dotación</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Costo unit. ($)</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Costo M.O</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Finiquito ($)</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Total mes</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const costoMo = (f.dotacion || 0) * (f.costo_unitario || 0)
                    return (
                      <tr key={i} className="border-b border-canvas">
                        <td className="py-1.5 pr-2 font-semibold text-ink whitespace-nowrap">{labelMes(f.mes)}</td>
                        <td className="py-1.5 px-2 text-center">
                          <input type="number" value={f.dotacion}
                            onChange={e => updFila(i, 'dotacion', Number(e.target.value))}
                            className="w-14 px-1.5 py-1 border border-line2 rounded-md text-center text-[12px]" />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input type="number" value={f.costo_unitario}
                            onChange={e => updFila(i, 'costo_unitario', Number(e.target.value))}
                            className="w-28 px-1.5 py-1 border border-line2 rounded-md text-right text-[12px]" />
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold text-ink">{fmt(costoMo)}</td>
                        <td className="py-1.5 px-2 text-right">
                          <input type="number" value={f.finiquito}
                            onChange={e => updFila(i, 'finiquito', Number(e.target.value))}
                            className="w-24 px-1.5 py-1 border border-line2 rounded-md text-right text-[12px]" />
                        </td>
                        <td className="py-1.5 px-2 text-right font-extrabold text-ink">{fmt(costoMo + (f.finiquito || 0))}</td>
                        <td className="py-1.5 pl-2 text-right">
                          <button onClick={() => delMes(i)} className="text-danger text-[12px] bg-transparent border-none cursor-pointer">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line2">
                    <td className="py-2 pr-2 font-extrabold text-ink">TOTAL</td>
                    <td></td>
                    <td></td>
                    <td className="py-2 px-2 text-right font-extrabold text-ink">{fmt(totales.costoMo)}</td>
                    <td className="py-2 px-2 text-right font-extrabold text-ink">{fmt(totales.finiquitos)}</td>
                    <td className="py-2 px-2 text-right font-extrabold text-brand">{fmt(totales.total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-3">
              <Btn onClick={addMes}>+ Agregar mes</Btn>
            </div>
          </>
        )}
    </div>
  )
}
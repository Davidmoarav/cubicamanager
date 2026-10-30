'use client'
// components/RecepcionOC.tsx
//
// Recepción por línea de una orden de compra: lo recibido entra a la bodega de la
// obra y se vuelve gasto. Cada recepción se puede revertir.

import { useCallback, useEffect, useState } from 'react'
import { Btn, FormInput, Modal } from '@/components/ui'
import { fmt } from '@/lib/format'
import { recibidoPorLinea } from '@/lib/recepciones'

interface Props {
  ordenId: string
  onClose: () => void
  onCambio: () => void
}

const hoy = () => new Date().toISOString().split('T')[0]

export default function RecepcionOC({ ordenId, onClose, onCambio }: Props) {
  const [oc, setOc]             = useState<any>(null)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [sinBodega, setSinBodega]   = useState<Record<string, boolean>>({})
  const [fecha, setFecha]       = useState(hoy)
  const [documento, setDocumento] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/ordenes-compra?id=${ordenId}`)
    const j = await res.json().catch(() => null)
    if (!res.ok || !j) { setError(j?.error || 'No se pudo cargar la orden'); return }
    setOc(j)
    setCantidades({})
  }, [ordenId])

  useEffect(() => { cargar() }, [cargar])

  const lineas: any[] = oc?.lineas ?? []
  const recepciones: any[] = oc?.recepciones ?? []
  const recibido = recibidoPorLinea(recepciones)
  const pendiente = (l: any) => Math.round(((Number(l.cantidad) || 0) - (recibido[l.id] || 0)) * 100) / 100

  const recibirTodo = () => setCantidades(Object.fromEntries(
    lineas.filter(l => pendiente(l) > 0).map(l => [l.id, String(pendiente(l))])))

  const guardar = async () => {
    const items = lineas
      .filter(l => Number(cantidades[l.id]) > 0)
      .map(l => ({ linea_id: l.id, cantidad: Number(cantidades[l.id]), a_bodega: !sinBodega[l.id] }))
    setSaving(true)
    setError('')
    const res = await fetch('/api/recepciones-oc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden_id: ordenId, fecha, documento: documento || null, items }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error || 'No se pudo registrar la recepción'); return }
    setDocumento('')
    await cargar()
    onCambio()
  }

  const revertir = async (r: any) => {
    if (!confirm('¿Revertir esta recepción? Sale de la bodega y deja de contar como gasto.')) return
    setError('')
    const res = await fetch('/api/recepciones-oc', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error || 'No se pudo revertir la recepción'); return }
    await cargar()
    onCambio()
  }

  const nombreLinea = (id: string) => lineas.find(l => l.id === id)?.material ?? 'Línea'
  const hayPendiente = lineas.some(l => pendiente(l) > 0)

  return (
    <Modal title={oc ? `Recepción OC #${oc.numero}` : 'Recepción'} onClose={onClose} wide>
      {error && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{error}</div>}
      {!oc ? (
        !error && <p className="text-muted text-center p-8 text-[13px]">Cargando…</p>
      ) : (
        <>
          {!oc.proyecto_id && (
            <div className="mb-3 text-[12px] font-semibold text-warning bg-warning-bg rounded-lg px-3 py-2">
              Esta orden no tiene proyecto: lo recibido no entra a ninguna bodega ni al gasto de una obra.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput label="Fecha de recepción" type="date" value={fecha} onChange={setFecha} />
            <FormInput label="Guía de despacho (opcional)" value={documento} onChange={setDocumento} />
          </div>

          <div className="text-[12px] mb-3">
            {lineas.map(l => {
              const pend = pendiente(l)
              return (
                <div key={l.id} className="grid grid-cols-[1fr_90px] sm:grid-cols-[1fr_70px_70px_90px_80px] gap-2 items-center py-2 border-b border-canvas">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate">{l.material}</div>
                    <div className="text-[11px] text-muted">{fmt(Number(l.precio_unitario) || 0)} / {l.unidad}</div>
                  </div>
                  <div className="text-muted sm:text-right whitespace-nowrap order-3 sm:order-none">Pedido {Number(l.cantidad)}</div>
                  <div className="text-muted sm:text-right whitespace-nowrap order-4 sm:order-none">Recibido {recibido[l.id] || 0}</div>
                  <input type="number" min="0" max={pend} step="any" disabled={pend <= 0}
                    aria-label={`Cantidad recibida de ${l.material}`} placeholder={pend > 0 ? String(pend) : '—'}
                    value={cantidades[l.id] ?? ''} onChange={e => setCantidades(c => ({ ...c, [l.id]: e.target.value }))}
                    className="w-full px-1.5 py-1.5 border border-line2 rounded-md text-right text-[12px] order-2 sm:order-none" />
                  <label className="flex items-center gap-1 text-[11px] text-muted cursor-pointer order-5 sm:order-none">
                    <input type="checkbox" checked={!sinBodega[l.id]} disabled={pend <= 0 || !oc.proyecto_id}
                      onChange={e => setSinBodega(s => ({ ...s, [l.id]: !e.target.checked }))} />
                    A bodega
                  </label>
                </div>
              )
            })}
          </div>

          {hayPendiente ? (
            <div className="flex justify-between gap-2 flex-wrap mb-4">
              <Btn onClick={recibirTodo}>Completar con lo pendiente</Btn>
              <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Registrar recepción'}</Btn>
            </div>
          ) : (
            <p className="text-[12px] font-semibold text-success mb-4">Esta orden ya está recibida por completo.</p>
          )}

          {recepciones.length > 0 && (
            <>
              <div className="text-[12px] font-bold text-ink mb-2">Recepciones registradas</div>
              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
                {recepciones.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-canvas rounded-lg text-[12px]">
                    <div className="min-w-0">
                      <span className="font-semibold text-ink">{Number(r.cantidad)} · {nombreLinea(r.linea_id)}</span>
                      <div className="text-[10px] text-muted">{r.fecha}{r.documento ? ` · ${r.documento}` : ''}</div>
                    </div>
                    <button onClick={() => revertir(r)} className="text-[11px] font-semibold text-danger whitespace-nowrap hover:underline">Revertir</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

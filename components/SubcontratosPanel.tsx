'use client'
// components/SubcontratosPanel.tsx
//
// Subcontratos de una obra: contrato, estados de pago, retenciones y avance propios.
// El bruto de cada estado de pago aprobado o pagado es gasto real de la obra.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, MetricCard, fmt } from '@/components/ui'
import SelectorFactura from '@/components/SelectorFactura'
import { opcionesPartida } from '@/lib/costos'
import { usePermisos } from '@/lib/usePermisos'
import { fmtFecha } from '@/lib/format'
import { confirmar } from '@/lib/avisos'

interface Props {
  proyectoId: string
}

const ESTADOS_EP = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'pagado', label: 'Pagado' },
]

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VACIO = { subcontratista: '', proveedor_id: '', descripcion: '', partida_id: '', monto_contrato: '', retencion_pct: '5', anticipo: '', fecha_inicio: '', fecha_fin: '' }

export default function SubcontratosPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, isLoading, mutate } = useSWR<any[]>(`/api/subcontratos?proyecto_id=${proyectoId}`, fetcher)
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)
  const { data: proveedores = [] } = useSWR<any[]>('/api/proveedores', fetcher)

  const [form, setForm]     = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [epForm, setEpForm] = useState<{ avance: string; fecha: string }>({ avance: '', fecha: hoyLocal() })

  const subs: any[] = Array.isArray(data) ? data : []
  const opciones = useMemo(() => [{ value: '', label: '— Sin partida —' }, ...opcionesPartida(partidas)], [partidas])
  const listaProv = Array.isArray(proveedores) ? proveedores : []

  const pedir = async (url: string, method: string, body: any) => {
    setMsg('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(j.error || 'No se pudo guardar'); return false }
    if (j.aviso) setMsg(j.aviso)
    await mutate()
    return true
  }

  const crear = async () => {
    setSaving(true)
    const ok = await pedir('/api/subcontratos', 'POST', {
      ...form,
      proyecto_id: proyectoId,
      proveedor_id: form.proveedor_id || null,
      partida_id: form.partida_id || null,
      monto_contrato: Number(form.monto_contrato) || 0,
      retencion_pct: Number(form.retencion_pct) || 0,
      anticipo: Number(form.anticipo) || 0,
    })
    setSaving(false)
    if (ok) setForm(null)
  }

  const crearEP = async (sub: any) => {
    setSaving(true)
    const ok = await pedir('/api/subcontratos/ep', 'POST', {
      subcontrato_id: sub.id, avance_acumulado: Number(epForm.avance), fecha: epForm.fecha,
    })
    setSaving(false)
    if (ok) setEpForm({ avance: '', fecha: hoyLocal() })
  }

  const devolverRetencion = async (sub: any) => {
    const v = prompt(`Total de retención devuelta a ${sub.subcontratista} ($):`, String(sub.retencion_devuelta || 0))
    if (v === null) return
    await pedir('/api/subcontratos', 'PUT', { id: sub.id, retencion_devuelta: Number(v) || 0 })
  }

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando subcontratos…</div>
  if (error || (data as any)?.error) {
    return (
      <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
        No se pudieron cargar los subcontratos. Recarga la página; si sigue pasando, avisa al administrador.
      </div>
    )
  }

  const totales = subs.filter(s => s.estado !== 'anulado').reduce((t, s) => ({
    contratado: t.contratado + (Number(s.monto_contrato) || 0),
    ejecutado: t.ejecutado + s.resumen.ejecutado,
    por_pagar: t.por_pagar + s.resumen.por_pagar,
    retencion: t.retencion + s.resumen.retencion_saldo,
  }), { contratado: 0, ejecutado: 0, por_pagar: 0, retencion: 0 })

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Subcontratos</h4>
          <p className="text-[12px] text-muted mt-0.5 max-w-[520px]">
            Cada estado de pago aprobado suma su bruto al gasto real. Si llega la factura del subcontratista, asóciala
            al estado de pago para no contarla dos veces.
          </p>
        </div>
        {puedeEditar && !form && <Btn variant="primary" onClick={() => { setMsg(''); setForm({ ...VACIO }) }}>+ Nuevo subcontrato</Btn>}
      </div>

      {msg && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{msg}</div>}

      {form && (
        <div className="border border-line rounded-xl p-4 mb-5 bg-canvas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <FormSelect label="Proveedor" value={form.proveedor_id}
              onChange={v => {
                const p = listaProv.find((x: any) => x.id === v)
                setForm((f: any) => ({ ...f, proveedor_id: v, subcontratista: p?.nombre ?? f.subcontratista }))
              }}
              options={[{ value: '', label: '— Otro (escribir) —' }, ...listaProv.map((p: any) => ({ value: p.id, label: p.nombre }))]} />
            <FormInput label="Subcontratista *" value={form.subcontratista} onChange={v => setForm((f: any) => ({ ...f, subcontratista: v }))} />
            <FormInput label="Trabajo contratado" value={form.descripcion} onChange={v => setForm((f: any) => ({ ...f, descripcion: v }))} />
            <FormSelect label="Partida (a qué se imputa)" value={form.partida_id} onChange={v => setForm((f: any) => ({ ...f, partida_id: v }))} options={opciones} />
            <FormInput label="Monto del contrato, neto ($) *" type="number" value={form.monto_contrato} onChange={v => setForm((f: any) => ({ ...f, monto_contrato: v }))} />
            <div className="grid grid-cols-2 gap-x-3">
              <FormInput label="Retención (%)" type="number" value={form.retencion_pct} onChange={v => setForm((f: any) => ({ ...f, retencion_pct: v }))} />
              <FormInput label="Anticipo ($)" type="number" value={form.anticipo} onChange={v => setForm((f: any) => ({ ...f, anticipo: v }))} />
            </div>
            <FormInput label="Inicio" type="date" value={form.fecha_inicio} onChange={v => setForm((f: any) => ({ ...f, fecha_inicio: v }))} />
            <FormInput label="Término" type="date" value={form.fecha_fin} onChange={v => setForm((f: any) => ({ ...f, fecha_fin: v }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn onClick={() => setForm(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={crear} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
      )}

      {subs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <MetricCard label="Contratado" value={fmt(totales.contratado)} />
          <MetricCard label="Ejecutado" value={fmt(totales.ejecutado)} sub="Entra al gasto real" />
          <MetricCard label="Por pagar" value={fmt(totales.por_pagar)} />
          <MetricCard label="Retención por devolver" value={fmt(totales.retencion)} />
        </div>
      )}

      {subs.length === 0 && !form ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin subcontratos en esta obra.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {subs.map(s => (
            <div key={s.id} className="border border-line rounded-xl overflow-hidden">
              <button onClick={() => setAbierto(a => a === s.id ? null : s.id)} aria-expanded={abierto === s.id}
                className="w-full text-left px-4 py-3 hover:bg-canvas transition">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-ink">{s.subcontratista}{s.estado !== 'vigente' ? ` · ${s.estado}` : ''}</div>
                    {s.descripcion && <div className="text-[11px] text-muted truncate">{s.descripcion}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-extrabold text-ink tabular-nums">{fmt(s.resumen.ejecutado)} / {fmt(Number(s.monto_contrato) || 0)}</div>
                    <div className="text-[11px] text-muted">Avance {s.resumen.avance}%</div>
                  </div>
                </div>
                <div className="h-1.5 bg-[#EDE7E0] rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, s.resumen.avance)}%` }} />
                </div>
              </button>

              {abierto === s.id && (
                <div className="px-4 pb-4 border-t border-line">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted py-3">
                    <span>Por pagar: <strong className="text-ink">{fmt(s.resumen.por_pagar)}</strong></span>
                    <span>Retenido: <strong className="text-ink">{fmt(s.resumen.retenido)}</strong></span>
                    <span>Retención por devolver: <strong className="text-ink">{fmt(s.resumen.retencion_saldo)}</strong></span>
                    <span>Saldo de anticipo: <strong className="text-ink">{fmt(s.resumen.anticipo_saldo)}</strong></span>
                    {puedeEditar && s.resumen.retenido > 0 && (
                      <button onClick={() => devolverRetencion(s)} className="font-semibold text-brand hover:underline">Registrar devolución</button>
                    )}
                  </div>

                  {s.eps.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {s.eps.map((ep: any, i: number) => (
                        <div key={ep.id} className="bg-canvas rounded-lg px-3 py-2 text-[12px]">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                              <span className="font-bold text-ink">Estado de pago N°{ep.numero}</span>
                              <span className="text-muted"> · {fmtFecha(ep.fecha)} · acumulado {Number(ep.avance_acumulado)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <select value={ep.estado} disabled={!puedeEditar} aria-label={`Estado del estado de pago N°${ep.numero}`}
                                onChange={e => pedir('/api/subcontratos/ep', 'PUT', { id: ep.id, estado: e.target.value })}
                                className="text-[11px] px-1.5 py-0.5 border border-line2 rounded-[5px] cursor-pointer bg-white">
                                {ESTADOS_EP.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              {puedeEditar && i === s.eps.length - 1 && ep.estado !== 'pagado' && (
                                <button aria-label={`Eliminar estado de pago N°${ep.numero}`} className="text-danger text-[12px] hover:opacity-70"
                                  onClick={async () => (await confirmar('¿Eliminar este estado de pago?')) && pedir('/api/subcontratos/ep', 'DELETE', { id: ep.id })}>✕</button>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-[11px] text-muted mt-1">
                            <span>Bruto {fmt(ep.bruto)}</span>
                            <span>Retención {fmt(ep.retencion)}</span>
                            <span>Anticipo {fmt(ep.anticipo_desc)}</span>
                            <span className="font-bold text-ink">A pagar {fmt(ep.neto)}</span>
                          </div>
                          {puedeEditar && ep.estado !== 'borrador' && (
                            <div className="mt-2">
                              <SelectorFactura
                                value={ep.factura_id || ''}
                                onPick={f => pedir('/api/subcontratos/ep', 'PUT', { id: ep.id, factura_id: f.id })}
                                onClear={() => pedir('/api/subcontratos/ep', 'PUT', { id: ep.id, factura_id: null })}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {puedeEditar && s.estado === 'vigente' && s.resumen.avance < 100 && (
                    <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[160px_160px_auto] gap-2 items-end">
                      <FormInput label="Avance acumulado (%)" type="number" value={epForm.avance} onChange={v => setEpForm(f => ({ ...f, avance: v }))} />
                      <FormInput label="Fecha" type="date" value={epForm.fecha} onChange={v => setEpForm(f => ({ ...f, fecha: v }))} />
                      <div className="mb-3 col-span-2 sm:col-span-1">
                        <Btn variant="primary" onClick={() => crearEP(s)} disabled={saving}>Crear estado de pago</Btn>
                      </div>
                    </div>
                  )}

                  {puedeEditar && s.eps.every((e: any) => e.estado === 'borrador') && (
                    <button className="text-[11px] font-semibold text-danger hover:underline"
                      onClick={async () => (await confirmar(`¿Eliminar el subcontrato de ${s.subcontratista}?`)) && pedir('/api/subcontratos', 'DELETE', { id: s.id })}>
                      Eliminar subcontrato
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

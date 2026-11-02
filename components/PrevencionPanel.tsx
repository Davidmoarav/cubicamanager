'use client'
// components/PrevencionPanel.tsx
//
// Prevención de riesgos de la obra: charlas, entrega de EPP, inspecciones e incidentes,
// con sus respaldos. Los incidentes quedan abiertos hasta cerrarlos.

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, MetricCard } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { subirDocumento } from '@/lib/subir-documento'
import { usePermisos } from '@/lib/usePermisos'
import { fmtFecha } from '@/lib/format'
import { confirmar } from '@/lib/avisos'

interface Props {
  proyectoId: string
}

const TIPOS = [
  { value: 'charla', label: 'Charla de seguridad' },
  { value: 'epp', label: 'Entrega de EPP' },
  { value: 'inspeccion', label: 'Inspección' },
  { value: 'incidente', label: 'Incidente' },
]
const ETIQUETA = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VACIO = () => ({ tipo: 'charla', fecha: hoyLocal(), titulo: '', detalle: '', responsable: '', asistentes: '', gravedad: 'leve', dias_perdidos: '' })

export default function PrevencionPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, isLoading, mutate } = useSWR<any[]>(`/api/prevencion?proyecto_id=${proyectoId}`, fetcher)
  const archivo = useRef<HTMLInputElement>(null)

  const [form, setForm]     = useState<any>(null)
  const [adjunto, setAdjunto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  const registros: any[] = Array.isArray(data) ? data : []
  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const mesActual = hoyLocal().slice(0, 7)
  const charlasMes = registros.filter(r => r.tipo === 'charla' && String(r.fecha).startsWith(mesActual))
  const incidentes = registros.filter(r => r.tipo === 'incidente')

  const guardar = async () => {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/prevencion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        proyecto_id: proyectoId,
        asistentes: Number(form.asistentes) || 0,
        dias_perdidos: Number(form.dias_perdidos) || 0,
        gravedad: form.tipo === 'incidente' ? form.gravedad : null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaving(false)
      setMsg(j.error || 'No se pudo guardar el registro')
      return
    }
    let aviso = ''
    if (adjunto) {
      try {
        await subirDocumento(createClient(), proyectoId, adjunto, { prevencion_id: j.id })
      } catch (e: any) {
        aviso = `El registro quedó guardado, pero no se subió el respaldo: ${e?.message ?? 'error'}`
      }
    }
    setSaving(false)
    setForm(null)
    setAdjunto(null)
    setMsg(aviso)
    await mutate()
  }

  const cambiarEstado = async (r: any) => {
    setMsg('')
    const res = await fetch('/api/prevencion', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, estado: r.estado === 'abierto' ? 'cerrado' : 'abierto' }),
    })
    if (!res.ok) { setMsg('No se pudo cambiar el estado'); return }
    await mutate()
  }

  const eliminar = async (r: any) => {
    if (!(await confirmar(`¿Eliminar "${r.titulo}"?`))) return
    setMsg('')
    const res = await fetch('/api/prevencion', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }),
    })
    if (!res.ok) { setMsg('No se pudo eliminar el registro'); return }
    await mutate()
  }

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando prevención…</div>
  if (error || (data as any)?.error) {
    return (
      <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
        No se pudo cargar prevención. Recarga la página; si sigue pasando, avisa al administrador.
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Prevención de riesgos</h4>
          <p className="text-[12px] text-muted mt-0.5">Charlas, EPP, inspecciones e incidentes de esta obra, con sus respaldos.</p>
        </div>
        {puedeEditar && !form && <Btn variant="primary" onClick={() => { setMsg(''); setForm(VACIO()) }}>+ Nuevo registro</Btn>}
      </div>

      {msg && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{msg}</div>}

      {form && (
        <div className="border border-line rounded-xl p-4 mb-5 bg-canvas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <FormSelect label="Tipo" value={form.tipo} onChange={v => upd('tipo', v)} options={TIPOS} />
            <FormInput label="Fecha" type="date" value={form.fecha} onChange={v => upd('fecha', v)} />
            <FormInput label="Título *" value={form.titulo} onChange={v => upd('titulo', v)} />
            <FormInput label="Responsable" value={form.responsable} onChange={v => upd('responsable', v)} />
            {form.tipo === 'incidente' ? (
              <>
                <FormSelect label="Gravedad" value={form.gravedad} onChange={v => upd('gravedad', v)}
                  options={[{ value: 'leve', label: 'Leve' }, { value: 'grave', label: 'Grave' }, { value: 'fatal', label: 'Fatal' }]} />
                <FormInput label="Días perdidos" type="number" value={form.dias_perdidos} onChange={v => upd('dias_perdidos', v)} />
              </>
            ) : (
              <FormInput label={form.tipo === 'epp' ? 'Trabajadores que recibieron' : 'Asistentes'} type="number" value={form.asistentes} onChange={v => upd('asistentes', v)} />
            )}
          </div>
          <div className="mb-3">
            <label className="label-base" htmlFor="prev-detalle">Detalle</label>
            <textarea id="prev-detalle" value={form.detalle} onChange={e => upd('detalle', e.target.value)} rows={2} className="input-base !mb-0" />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Btn onClick={() => archivo.current?.click()}>Adjuntar respaldo</Btn>
            <input ref={archivo} type="file" accept="image/*,.pdf" className="hidden" aria-label="Adjuntar respaldo"
              onChange={e => setAdjunto(e.target.files?.[0] ?? null)} />
            {adjunto && <span className="text-[11px] text-muted truncate max-w-[220px]">{adjunto.name}</span>}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn onClick={() => { setForm(null); setAdjunto(null) }}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard label="Charlas del mes" value={charlasMes.length}
          sub={`${charlasMes.reduce((s, r) => s + (r.asistentes || 0), 0)} asistentes`} />
        <MetricCard label="Incidentes" value={incidentes.length} />
        <MetricCard label="Incidentes abiertos" value={incidentes.filter(r => r.estado === 'abierto').length} />
        <MetricCard label="Días perdidos" value={incidentes.reduce((s, r) => s + (r.dias_perdidos || 0), 0)} />
      </div>

      {registros.length === 0 ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin registros de prevención en esta obra.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {registros.map(r => (
            <div key={r.id} className="flex items-start justify-between gap-3 py-2 px-3 bg-canvas rounded-lg text-[12px]">
              <div className="min-w-0">
                <span className="font-semibold text-ink">{r.titulo}</span>
                <div className="text-[10.5px] text-muted">
                  {ETIQUETA[r.tipo] ?? r.tipo} · {fmtFecha(r.fecha)}
                  {r.responsable ? ` · ${r.responsable}` : ''}
                  {r.tipo === 'incidente' ? ` · ${r.gravedad ?? 'leve'} · ${r.dias_perdidos || 0} días perdidos` : r.asistentes ? ` · ${r.asistentes} personas` : ''}
                  {r.adjuntos ? ` · ${r.adjuntos} respaldo${r.adjuntos === 1 ? '' : 's'}` : ''}
                </div>
                {r.detalle && <div className="text-[11.5px] text-ink mt-0.5 whitespace-pre-wrap">{r.detalle}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.tipo === 'incidente' && (
                  puedeEditar
                    ? (
                      <button onClick={() => cambiarEstado(r)}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${r.estado === 'abierto' ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'}`}
                        title={r.estado === 'abierto' ? 'Marcar como cerrado' : 'Reabrir'}>
                        {r.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
                      </button>
                    )
                    : <span className="text-[10.5px] font-bold text-muted">{r.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
                )}
                {puedeEditar && (
                  <button onClick={() => eliminar(r)} aria-label={`Eliminar ${r.titulo}`} className="text-danger text-[12px] hover:opacity-70">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

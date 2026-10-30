'use client'
// components/ParteDiarioPanel.tsx
//
// Parte diario de una obra: horas por trabajador y partida en un día.
// Con estas horas se reparte el sueldo de cada trabajador entre las obras.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn } from '@/components/ui'
import { opcionesPartida } from '@/lib/costos'
import { usePermisos } from '@/lib/usePermisos'

interface Props {
  proyectoId: string
}

interface Fila {
  _k: string
  empleado_id: string
  partida_id: string
  horas: string
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const nuevaFila = (empleado_id = ''): Fila => ({ _k: crypto.randomUUID(), empleado_id, partida_id: '', horas: '' })

export default function ParteDiarioPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const [fecha, setFecha]   = useState(hoyLocal)
  const [filas, setFilas]   = useState<Fila[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<{ tipo: 'ok' | 'aviso' | 'error'; texto: string } | null>(null)

  const clave = `/api/parte-diario?proyecto_id=${proyectoId}&fecha=${fecha}`
  const { data, error, isLoading, mutate } = useSWR<any>(clave, fetcher, { revalidateOnFocus: false })
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)

  const empleados: any[] = Array.isArray(data?.empleados) ? data.empleados : []
  const opciones = useMemo(() => opcionesPartida(partidas), [partidas])

  // Filas del día guardadas + los trabajadores asignados a esta obra que aún no tienen horas
  useEffect(() => {
    if (!data) return
    const guardadas: Fila[] = (data.filas ?? []).map((f: any) => ({
      _k: f.id, empleado_id: f.empleado_id, partida_id: f.partida_id || '', horas: String(f.horas),
    }))
    const conFila = new Set(guardadas.map(f => f.empleado_id))
    const asignados = (data.empleados ?? [])
      .filter((e: any) => e.proyecto_id === proyectoId && e.estado === 'activo' && !conFila.has(e.id))
      .map((e: any) => nuevaFila(e.id))
    setFilas([...guardadas, ...asignados])
    setMsg(null)
  }, [data, proyectoId])

  const upd = (k: string, campo: keyof Fila, v: string) =>
    setFilas(prev => prev.map(f => f._k === k ? { ...f, [campo]: v } : f))

  const totalHoras = filas.reduce((s, f) => s + (Number(f.horas) || 0), 0)

  const guardar = async () => {
    const validas = filas.filter(f => f.empleado_id && Number(f.horas) > 0)
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/parte-diario', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto_id: proyectoId,
        fecha,
        filas: validas.map(f => ({
          empleado_id: f.empleado_id, partida_id: f.partida_id || null, horas: Number(f.horas),
        })),
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setMsg({ tipo: 'error', texto: j.error || 'No se pudo guardar el parte diario' })
      return
    }
    await mutate()
    setMsg(j.aviso ? { tipo: 'aviso', texto: j.aviso } : { tipo: 'ok', texto: 'Parte diario guardado' })
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Parte diario</h4>
          <p className="text-[12px] text-muted mt-0.5 max-w-[520px]">
            Horas de cada trabajador en esta obra. El sueldo del mes se reparte entre obras según las horas
            registradas; quien no tenga horas en el mes va completo a su obra asignada.
          </p>
        </div>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)}
          aria-label="Fecha del parte" className="input-base !mb-0 !py-1.5 w-[160px]" />
      </div>

      {msg && (
        <div className={`mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 ${
          msg.tipo === 'ok' ? 'text-success bg-success-bg' : msg.tipo === 'aviso' ? 'text-warning bg-warning-bg' : 'text-danger bg-danger-bg'
        }`}>
          {msg.texto}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando parte diario…</div>
      ) : error || data?.error ? (
        <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
          No se pudo cargar el parte diario. Si menciona "parte_diario", ejecuta el SQL 41_fase1_imputacion.sql en Supabase.
        </div>
      ) : (
        <>
          {filas.length === 0 ? (
            <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
              Sin trabajadores en este día. Agrega una fila o asígnalos a la obra en RRHH.
            </div>
          ) : (
            <div className="text-[12px]">
              {/* En teléfono cada fila se apila: el parte se carga desde la obra */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_80px_24px] gap-2 pb-2 border-b-2 border-line2 font-bold text-muted">
                <span>Trabajador</span>
                <span>Partida (opcional)</span>
                <span className="text-right">Horas</span>
                <span />
              </div>
              {filas.map(f => (
                <div key={f._k} className="grid grid-cols-[1fr_80px_24px] sm:grid-cols-[1fr_1fr_80px_24px] gap-2 items-center py-2 border-b border-canvas">
                  <select value={f.empleado_id} disabled={!puedeEditar} aria-label="Trabajador"
                    onChange={e => upd(f._k, 'empleado_id', e.target.value)}
                    className="input-base !mb-0 !py-1.5 cursor-pointer col-span-3 sm:col-span-1">
                    <option value="">— Elegir —</option>
                    {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.cargo ? ` · ${e.cargo}` : ''}</option>)}
                  </select>
                  <select value={f.partida_id} disabled={!puedeEditar} aria-label="Partida"
                    onChange={e => upd(f._k, 'partida_id', e.target.value)}
                    className="input-base !mb-0 !py-1.5 cursor-pointer min-w-0">
                    <option value="">— Sin partida —</option>
                    {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input type="number" min="0" max="24" step="0.5" value={f.horas} disabled={!puedeEditar}
                    aria-label="Horas" placeholder="Horas" onChange={e => upd(f._k, 'horas', e.target.value)}
                    className="w-full px-1.5 py-1.5 border border-line2 rounded-md text-right text-[12px]" />
                  {puedeEditar
                    ? <button onClick={() => setFilas(prev => prev.filter(x => x._k !== f._k))} aria-label="Quitar fila"
                        className="text-danger text-[12px] bg-transparent border-none cursor-pointer">✕</button>
                    : <span />}
                </div>
              ))}
              <div className="flex justify-between py-2 border-t-2 border-line2 font-extrabold">
                <span className="text-ink">TOTAL</span>
                <span className="text-brand">{Math.round(totalHoras * 10) / 10} h</span>
              </div>
            </div>
          )}

          {puedeEditar && (
            <div className="flex justify-between gap-2 mt-3 flex-wrap">
              <Btn onClick={() => setFilas(prev => [...prev, nuevaFila()])}>+ Agregar fila</Btn>
              <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar parte'}</Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}

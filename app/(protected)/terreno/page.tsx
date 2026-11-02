'use client'
// app/(protected)/terreno/page.tsx
// Lo que se hace desde la obra, pensado para el teléfono: parte diario, avance,
// libro de obra con fotos y consumo de bodega. Requiere conexión.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn } from '@/components/ui'
import { usePermisos } from '@/lib/usePermisos'
import ParteDiarioPanel from '@/components/ParteDiarioPanel'
import LibroObraPanel from '@/components/LibroObraPanel'
import BodegaPanel from '@/components/BodegaPanel'

const ACCIONES = [
  { id: 'parte', label: 'Parte diario', detalle: 'Horas de la cuadrilla' },
  { id: 'avance', label: 'Avance', detalle: 'Por partida' },
  { id: 'libro', label: 'Libro de obra', detalle: 'Anotación y fotos' },
  { id: 'bodega', label: 'Bodega', detalle: 'Consumo de material' },
]

const CLAVE_OBRA = 'terreno.obra'

function AvanceRapido({ proyectoId }: { proyectoId: string }) {
  const { puedeEditar } = usePermisos('obra')
  const { data, mutate } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const hojas = useMemo(() => {
    const lista = Array.isArray(data) ? data : []
    const conHijos = new Set(lista.map(p => p.parent_id).filter(Boolean))
    return lista.filter(p => !conHijos.has(p.id) && !p.es_grupo)
  }, [data])

  const guardar = async (p: any) => {
    const avance = Number(valores[p.id])
    if (!(avance >= 0 && avance <= 100)) { setMsg({ tipo: 'error', texto: 'El avance debe estar entre 0 y 100' }); return }
    setGuardando(p.id)
    setMsg(null)
    // La API recalcula con la fila completa: mandarla parcial borraría otros campos
    const res = await fetch('/api/partidas-proyecto', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, avance }),
    })
    setGuardando('')
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMsg({ tipo: 'error', texto: j.error || 'No se pudo guardar el avance' })
      return
    }
    setValores(v => { const { [p.id]: _, ...resto } = v; return resto })
    setMsg({ tipo: 'ok', texto: `${p.descripcion}: ${avance}%` })
    await mutate()
  }

  if (!data) return <p className="text-muted text-center py-10 text-[13px]">Cargando partidas…</p>
  if (hojas.length === 0) return <p className="text-muted text-center py-10 text-[13px]">Esta obra no tiene partidas.</p>

  return (
    <div>
      <h4 className="text-[14px] font-bold text-ink mb-3">Avance por partida</h4>
      {msg && (
        <div className={`mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 ${msg.tipo === 'ok' ? 'text-success bg-success-bg' : 'text-danger bg-danger-bg'}`}>
          {msg.texto}
        </div>
      )}
      <div className="flex flex-col">
        {hojas.map(p => {
          const editado = valores[p.id] !== undefined && Number(valores[p.id]) !== Number(p.avance)
          return (
            <div key={p.id} className="grid grid-cols-[1fr_64px_72px] gap-2 items-center py-2 border-b border-canvas">
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold text-ink truncate">{p.descripcion}</div>
                <div className="h-1.5 bg-[#EDE7E0] rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, Number(p.avance) || 0)}%` }} />
                </div>
              </div>
              <input type="number" inputMode="numeric" min="0" max="100" disabled={!puedeEditar}
                aria-label={`Avance de ${p.descripcion}, en porcentaje`}
                value={valores[p.id] ?? String(Math.round(Number(p.avance) || 0))}
                onChange={e => setValores(v => ({ ...v, [p.id]: e.target.value }))}
                className="w-full px-1.5 py-2 border border-line2 rounded-md text-right text-[13px]" />
              {puedeEditar && editado
                ? <Btn variant="primary" onClick={() => guardar(p)} disabled={guardando === p.id}>{guardando === p.id ? '…' : 'Guardar'}</Btn>
                : <span className="text-[12px] text-muted text-right">%</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TerrenoPage() {
  const { data: proyectos, isLoading } = useSWR<any[]>('/api/proyectos', fetcher)
  const [obra, setObra] = useState('')
  const [accion, setAccion] = useState('parte')

  const lista = useMemo(() => {
    const todas = Array.isArray(proyectos) ? proyectos : []
    const activas = todas.filter(p => p.estado === 'activo')
    return activas.length > 0 ? activas : todas
  }, [proyectos])

  // Recuerda la última obra en este teléfono
  useEffect(() => {
    if (lista.length === 0 || lista.some(p => p.id === obra)) return
    let guardada: string | null = null
    try { guardada = localStorage.getItem(CLAVE_OBRA) } catch { /* sin almacenamiento */ }
    setObra(lista.some(p => p.id === guardada) ? (guardada as string) : lista[0].id)
  }, [lista, obra])

  const elegirObra = (id: string) => {
    setObra(id)
    try { localStorage.setItem(CLAVE_OBRA, id) } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h1 className="text-[20px] font-extrabold text-ink">Terreno</h1>
        {obra && <Link href={`/obra/${obra}`} className="text-[12.5px] font-semibold text-brand">Ver obra completa</Link>}
      </div>

      {isLoading ? (
        <p className="text-muted text-center py-10 text-[13px]">Cargando obras…</p>
      ) : lista.length === 0 ? (
        <p className="text-muted text-center py-10 text-[13px]">No tienes obras todavía.</p>
      ) : (
        <>
          <label className="label-base" htmlFor="terreno-obra">Obra</label>
          <select id="terreno-obra" value={obra} onChange={e => elegirObra(e.target.value)} className="input-base cursor-pointer mb-3">
            {lista.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {ACCIONES.map(a => (
              <button key={a.id} onClick={() => setAccion(a.id)} aria-pressed={accion === a.id}
                className={`text-left rounded-xl border px-3 py-3 transition ${accion === a.id ? 'bg-om-ink border-om-ink text-white' : 'bg-white border-line text-ink'}`}>
                <div className="text-[14px] font-bold">{a.label}</div>
                <div className={`text-[11.5px] ${accion === a.id ? 'text-white/70' : 'text-muted'}`}>{a.detalle}</div>
              </button>
            ))}
          </div>

          {obra && (
            <div className="bg-white rounded-card border border-line shadow-card p-4">
              {accion === 'parte' && <ParteDiarioPanel proyectoId={obra} />}
              {accion === 'avance' && <AvanceRapido proyectoId={obra} />}
              {accion === 'libro' && <LibroObraPanel proyectoId={obra} />}
              {accion === 'bodega' && <BodegaPanel proyectoId={obra} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

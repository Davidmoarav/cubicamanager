'use client'
// components/ApuPanel.tsx
//
// Análisis de precio unitario de una partida: materiales con su rendimiento,
// cuadrilla y equipos a costo por día, y rendimiento de la cuadrilla.
// "Aplicar" lleva el resultado a los costos y al precio de la partida.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, fmt } from '@/components/ui'
import { opcionesPartida } from '@/lib/costos'
import { usePermisos } from '@/lib/usePermisos'
import { confirmar } from '@/lib/avisos'

interface Props {
  proyectoId: string
  onCambio?: () => void
}

const TIPOS_RECURSO = [
  { value: 'mano_obra', label: 'Mano de obra' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'otro', label: 'Otro' },
]
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RECURSO.map(t => [t.value, t.label]))

export default function ApuPanel({ proyectoId, onCambio }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)

  const hojas = useMemo(() => {
    const lista = Array.isArray(partidas) ? partidas : []
    const conHijos = new Set(lista.map((p: any) => p.parent_id).filter(Boolean))
    const ids = new Set(lista.filter((p: any) => !conHijos.has(p.id) && !p.es_grupo).map((p: any) => p.id))
    return opcionesPartida(lista).filter(o => ids.has(o.value))
  }, [partidas])

  const [partidaId, setPartidaId] = useState('')
  useEffect(() => {
    if (!partidaId && hojas.length > 0) setPartidaId(hojas[0].value)
  }, [hojas, partidaId])

  const clave = partidaId ? `/api/apu?partida_id=${partidaId}` : null
  const { data: apu, error, isLoading, mutate } = useSWR<any>(clave, fetcher)

  const [rendimiento, setRendimiento] = useState('')
  useEffect(() => { setRendimiento(apu?.partida?.rendimiento_dia != null ? String(Number(apu.partida.rendimiento_dia)) : '') }, [apu?.partida?.rendimiento_dia, partidaId])

  const [recurso, setRecurso]   = useState({ tipo: 'mano_obra', descripcion: '', cantidad: '1', costo_dia: '' })
  const [material, setMaterial] = useState({ material: '', unidad: 'un', rendimiento: '', precio_unitario: '' })
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const enviar = async (url: string, method: string, body: any) => {
    setMsg(null)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ tipo: 'error', texto: j.error || 'No se pudo guardar' }); return false }
    await mutate()
    return true
  }

  const guardarRendimiento = () =>
    enviar('/api/apu', 'PUT', { partida_id: partidaId, rendimiento_dia: rendimiento === '' ? null : Number(rendimiento) })

  const agregarRecurso = async () => {
    const ok = await enviar('/api/apu', 'POST', {
      partida_id: partidaId, tipo: recurso.tipo, descripcion: recurso.descripcion,
      cantidad: Number(recurso.cantidad), costo_dia: Number(recurso.costo_dia) || 0,
    })
    if (ok) setRecurso(r => ({ ...r, descripcion: '', cantidad: '1', costo_dia: '' }))
  }

  const agregarMaterial = async () => {
    if (!material.material.trim()) { setMsg({ tipo: 'error', texto: 'Falta el material' }); return }
    const ok = await enviar('/api/partida-materiales', 'POST', {
      partida_id: partidaId, material: material.material, unidad: material.unidad || 'un',
      rendimiento: Number(material.rendimiento) || 0, precio_unitario: Number(material.precio_unitario) || 0,
    })
    if (ok) setMaterial({ material: '', unidad: 'un', rendimiento: '', precio_unitario: '' })
  }

  const aplicar = async () => {
    const c = apu?.calculo
    if (!c) return
    if (!(await confirmar(`¿Aplicar a la partida? Queda con costo ${fmt(c.costo_unitario)} y precio de venta ${fmt(c.precio_unitario)} por unidad.`))) return
    if (await enviar('/api/apu', 'PUT', { partida_id: partidaId, aplicar: true })) {
      setMsg({ tipo: 'ok', texto: 'Costos y precio de la partida actualizados' })
      onCambio?.()
    }
  }

  if (hojas.length === 0) {
    return (
      <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
        Esta obra no tiene partidas. Agrégalas en Control de obra para analizar su precio unitario.
      </div>
    )
  }

  const c = apu?.calculo
  const unidad = apu?.partida?.unidad || 'unidad'

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-[14px] font-bold text-ink">Análisis de precio unitario</h4>
        <p className="text-[12px] text-muted mt-0.5 max-w-[560px]">
          Costo de una unidad de la partida: materiales según su rendimiento, y cuadrilla y equipos según lo que se hace en un día.
        </p>
      </div>

      <FormSelect label="Partida" value={partidaId} onChange={setPartidaId} options={hojas} />

      {msg && (
        <div className={`mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 ${msg.tipo === 'ok' ? 'text-success bg-success-bg' : 'text-danger bg-danger-bg'}`}>
          {msg.texto}
        </div>
      )}

      {isLoading && !apu ? (
        <div className="flex items-center justify-center py-12 text-muted text-[13px]">Cargando APU…</div>
      ) : error || apu?.error ? (
        <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
          No se pudo cargar el análisis. Recarga la página; si sigue pasando, avisa al administrador.
        </div>
      ) : c && (
        <>
          {/* Materiales */}
          <div className="text-[12px] font-bold text-ink mb-1.5">Materiales, por {unidad}</div>
          <div className="text-[12px] mb-2">
            {apu.materiales.length === 0 && <p className="text-muted py-1">Sin materiales.</p>}
            {apu.materiales.map((m: any) => (
              <div key={m.id} className="grid grid-cols-[1fr_auto_auto_20px] gap-2 items-center py-1.5 border-b border-canvas">
                <span className="text-ink font-semibold truncate">{m.material}</span>
                <span className="text-muted whitespace-nowrap">{Number(m.rendimiento)} {m.unidad} × {fmt(Number(m.precio_unitario) || 0)}</span>
                <span className="font-bold text-ink tabular-nums">{fmt(Math.round((Number(m.rendimiento) || 0) * (Number(m.precio_unitario) || 0)))}</span>
                {puedeEditar
                  ? <button onClick={() => enviar('/api/partida-materiales', 'DELETE', { id: m.id })} aria-label={`Quitar ${m.material}`} className="text-danger text-[12px]">✕</button>
                  : <span />}
              </div>
            ))}
          </div>
          {puedeEditar && (
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_70px_90px_100px_auto] gap-2 items-end mb-5">
              <div className="col-span-2 sm:col-span-1"><FormInput label="Material" value={material.material} onChange={v => setMaterial(f => ({ ...f, material: v }))} /></div>
              <FormInput label="Unidad" value={material.unidad} onChange={v => setMaterial(f => ({ ...f, unidad: v }))} />
              <FormInput label={`Por ${unidad}`} type="number" value={material.rendimiento} onChange={v => setMaterial(f => ({ ...f, rendimiento: v }))} />
              <FormInput label="Precio ($)" type="number" value={material.precio_unitario} onChange={v => setMaterial(f => ({ ...f, precio_unitario: v }))} />
              <div className="mb-3"><Btn onClick={agregarMaterial}>Agregar</Btn></div>
            </div>
          )}

          {/* Cuadrilla y equipos */}
          <div className="text-[12px] font-bold text-ink mb-1.5">Cuadrilla y equipos, por día</div>
          <div className="text-[12px] mb-2">
            {apu.recursos.length === 0 && <p className="text-muted py-1">Sin recursos.</p>}
            {apu.recursos.map((r: any) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto_20px] gap-2 items-center py-1.5 border-b border-canvas">
                <span className="min-w-0">
                  <span className="text-ink font-semibold">{r.descripcion}</span>
                  <span className="text-muted"> · {ETIQUETA_TIPO[r.tipo] ?? r.tipo}</span>
                </span>
                <span className="text-muted whitespace-nowrap">{Number(r.cantidad)} × {fmt(Number(r.costo_dia) || 0)}</span>
                <span className="font-bold text-ink tabular-nums">{fmt(Math.round((Number(r.cantidad) || 0) * (Number(r.costo_dia) || 0)))}</span>
                {puedeEditar
                  ? <button onClick={() => enviar('/api/apu', 'DELETE', { id: r.id })} aria-label={`Quitar ${r.descripcion}`} className="text-danger text-[12px]">✕</button>
                  : <span />}
              </div>
            ))}
          </div>
          {puedeEditar && (
            <div className="grid grid-cols-2 sm:grid-cols-[120px_1fr_70px_100px_auto] gap-2 items-end mb-4">
              <FormSelect label="Tipo" value={recurso.tipo} onChange={v => setRecurso(f => ({ ...f, tipo: v }))} options={TIPOS_RECURSO} />
              <FormInput label="Cantidad" type="number" value={recurso.cantidad} onChange={v => setRecurso(f => ({ ...f, cantidad: v }))} />
              <div className="col-span-2 sm:col-span-1 sm:order-first sm:hidden" />
              <div className="col-span-2 sm:col-span-1 sm:row-start-1 sm:col-start-2"><FormInput label="Descripción" value={recurso.descripcion} onChange={v => setRecurso(f => ({ ...f, descripcion: v }))} /></div>
              <FormInput label="Costo día ($)" type="number" value={recurso.costo_dia} onChange={v => setRecurso(f => ({ ...f, costo_dia: v }))} />
              <div className="mb-3"><Btn onClick={agregarRecurso}>Agregar</Btn></div>
            </div>
          )}

          {/* Rendimiento */}
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_auto_1fr] gap-2 items-end mb-4">
            <FormInput label={`Rendimiento (${unidad} por día)`} type="number" value={rendimiento} onChange={setRendimiento} />
            {puedeEditar && <div className="mb-3"><Btn onClick={guardarRendimiento}>Guardar</Btn></div>}
            {c.duracion_dias && (
              <p className="text-[12px] text-muted mb-4 col-span-2 sm:col-span-1">
                {Number(apu.partida.cantidad)} {unidad} tomarían {c.duracion_dias} {c.duracion_dias === 1 ? 'día' : 'días'} con una cuadrilla.
              </p>
            )}
          </div>

          {c.falta_rendimiento && (
            <div className="mb-3 text-[12px] font-semibold text-warning bg-warning-bg rounded-lg px-3 py-2">
              Falta el rendimiento: sin él, la cuadrilla y los equipos no se pueden llevar a costo por {unidad}.
            </div>
          )}

          {/* Resultado */}
          <div className="border border-line rounded-xl p-4 bg-canvas text-[12.5px]">
            {[
              ['Materiales', c.material],
              ['Mano de obra', c.mano_obra],
              ['Equipos', c.equipo],
              ['Otros', c.otro],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-0.5">
                <span className="text-muted">{k}</span>
                <span className="font-semibold text-ink tabular-nums">{fmt(v as number)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 mt-1 border-t border-line2 font-bold">
              <span className="text-ink">Costo por {unidad}</span>
              <span className="text-ink tabular-nums">{fmt(c.costo_unitario)}</span>
            </div>
            <div className="flex justify-between py-0.5 font-extrabold">
              <span className="text-ink">Precio de venta (markup {apu.markup}%)</span>
              <span className="text-brand tabular-nums">{fmt(c.precio_unitario)}</span>
            </div>
            <div className="flex justify-between gap-2 flex-wrap items-center mt-3">
              <span className="text-[11px] text-muted">
                Hoy la partida tiene costo {fmt(Number(apu.partida.costo_unitario) || 0)} y precio {fmt(Number(apu.partida.precio_unitario) || 0)}.
              </span>
              {puedeEditar && <Btn variant="primary" onClick={aplicar}>Aplicar a la partida</Btn>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

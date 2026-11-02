'use client'
// components/ParteDiarioPanel.tsx
//
// Parte diario de una obra: horas por trabajador y partida en un día.
// Con estas horas se reparte el sueldo de cada trabajador entre las obras.
// Se guarda en la cola de Terreno: sin señal queda en el teléfono y se envía después.

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn } from '@/components/ui'
import { opcionesPartida } from '@/lib/costos'
import { usePermisos } from '@/lib/usePermisos'
import { fmtFecha } from '@/lib/format'
import { claveParte, itemParte, registrar } from '@/lib/cola-terreno'
import { useColaTerreno } from '@/lib/useColaTerreno'

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
  const [copiando, setCopiando] = useState(false)
  const [horasTodos, setHorasTodos] = useState('8')
  const [msg, setMsg]       = useState<{ tipo: 'ok' | 'aviso' | 'error'; texto: string } | null>(null)

  const clave = `/api/parte-diario?proyecto_id=${proyectoId}&fecha=${fecha}`
  // Sin revalidar al volver la señal: borraría lo que se está escribiendo
  const { data, error, isLoading, mutate } = useSWR<any>(clave, fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false })
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)

  const empleados: any[] = Array.isArray(data?.empleados) ? data.empleados : []
  const opciones = useMemo(() => opcionesPartida(partidas), [partidas])

  const cola = useColaTerreno()
  const claveCola = claveParte(proyectoId, fecha)
  const enCola = cola.find(i => i.clave === claveCola)
  const idEnCola = enCola?.id
  const editando = useRef(false)   // hay cambios sin guardar: lo que llegue no los pisa

  useEffect(() => { editando.current = false }, [claveCola])

  // Lo que se envió sin nadie mirando: trae lo que quedó en el servidor
  const habiaEnCola = useRef(false)
  useEffect(() => {
    if (habiaEnCola.current && !idEnCola) mutate()
    habiaEnCola.current = !!idEnCola
  }, [idEnCola, mutate])

  // Filas del día (las sin enviar mandan) + los trabajadores asignados a esta obra que aún no tienen horas
  useEffect(() => {
    if (!data || editando.current) return
    const pendientes = enCola?.cuerpo.filas as any[] | undefined
    const guardadas: Fila[] = (pendientes ?? data.filas ?? []).map((f: any) => ({
      _k: f.id ?? crypto.randomUUID(), empleado_id: f.empleado_id, partida_id: f.partida_id || '', horas: String(f.horas),
    }))
    const conFila = new Set(guardadas.map(f => f.empleado_id))
    const asignados = (data.empleados ?? [])
      .filter((e: any) => e.proyecto_id === proyectoId && e.estado === 'activo' && !conFila.has(e.id))
      .map((e: any) => nuevaFila(e.id))
    setFilas([...guardadas, ...asignados])
    setMsg(enCola
      ? { tipo: 'aviso', texto: 'Este parte está guardado en el teléfono y aún no se envía.' }
      : data.sin_copia
        ? { tipo: 'aviso', texto: 'Sin señal, y este día no está en el teléfono. Si ya tenía horas, se avisará al enviar.' }
        : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, proyectoId, idEnCola])

  const upd = (k: string, campo: keyof Fila, v: string) => {
    editando.current = true
    setFilas(prev => prev.map(f => f._k === k ? { ...f, [campo]: v } : f))
  }

  // Repite el último parte de los 7 días anteriores: lo normal es que siga la misma cuadrilla
  const copiarAnterior = async () => {
    setCopiando(true)
    setMsg(null)
    let faltanDias = false
    for (let atras = 1; atras <= 7; atras++) {
      const d = new Date(`${fecha}T12:00:00`)
      d.setDate(d.getDate() - atras)
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const res = await fetch(`/api/parte-diario?proyecto_id=${proyectoId}&fecha=${dia}`).catch(() => null)
      const j = res?.ok ? await res.json().catch(() => null) : null
      if (!j || j.sin_copia) faltanDias = true
      if (j?.filas?.length) {
        editando.current = true
        setFilas(j.filas.map((f: any) => ({ ...nuevaFila(f.empleado_id), partida_id: f.partida_id || '', horas: String(f.horas) })))
        setMsg({ tipo: 'aviso', texto: `Copiado del ${fmtFecha(dia)}. Revísalo y guarda.` })
        setCopiando(false)
        return
      }
    }
    setCopiando(false)
    setMsg({ tipo: 'aviso', texto: faltanDias
      ? 'Sin señal: este teléfono no tiene los partes de los días anteriores.'
      : 'No hay partes en los 7 días anteriores.' })
  }

  const horasATodos = () => {
    const h = Number(horasTodos)
    if (!(h > 0 && h <= 24)) { setMsg({ tipo: 'error', texto: 'Las horas deben estar entre 0 y 24' }); return }
    editando.current = true
    setFilas(prev => prev.map(f => ({ ...f, horas: String(h) })))
  }

  const totalHoras = filas.reduce((s, f) => s + (Number(f.horas) || 0), 0)

  const guardar = async () => {
    const validas = filas.filter(f => f.empleado_id && Number(f.horas) > 0)
    setSaving(true)
    setMsg(null)
    editando.current = false
    const r = await registrar(itemParte({
      proyectoId,
      fecha,
      titulo: `Parte del ${fmtFecha(fecha)}`,
      filas: validas.map(f => ({ empleado_id: f.empleado_id, partida_id: f.partida_id || null, horas: Number(f.horas) })),
      filasBase: data?.filas ?? [],
    }))
    setSaving(false)
    if (r.estado === 'enviado') {
      await mutate()
      setMsg(r.aviso ? { tipo: 'aviso', texto: r.aviso } : { tipo: 'ok', texto: 'Parte diario guardado' })
    } else if (r.estado === 'guardado') {
      setMsg({ tipo: 'aviso', texto: 'Guardado en este teléfono. Se enviará solo cuando vuelva la señal.' })
    } else if (r.estado === 'sesion') {
      setMsg({ tipo: 'aviso', texto: 'Guardado en este teléfono. Entra de nuevo a tu cuenta para enviarlo.' })
    } else {
      setMsg({ tipo: 'error', texto: r.error || 'No se pudo guardar el parte diario' })
    }
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

      {puedeEditar && !isLoading && !error && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Btn onClick={copiarAnterior} disabled={copiando}>{copiando ? 'Buscando…' : 'Copiar último parte'}</Btn>
          <span className="flex items-center gap-1.5">
            <input type="number" min="0" max="24" step="0.5" value={horasTodos} onChange={e => setHorasTodos(e.target.value)}
              aria-label="Horas para todos" className="w-[64px] px-1.5 py-1.5 border border-line2 rounded-md text-right text-[12px]" />
            <Btn onClick={horasATodos} disabled={filas.length === 0}>Poner a todos</Btn>
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando parte diario…</div>
      ) : error || data?.error ? (
        <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
          No se pudo cargar el parte diario. Si no tienes señal, este teléfono aún no tiene los datos: abre Terreno una vez con conexión.
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
                    ? <button onClick={() => { editando.current = true; setFilas(prev => prev.filter(x => x._k !== f._k)) }} aria-label="Quitar fila"
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
              <Btn onClick={() => { editando.current = true; setFilas(prev => [...prev, nuevaFila()]) }}>+ Agregar fila</Btn>
              <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar parte'}</Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}

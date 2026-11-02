'use client'
// components/EquiposPanel.tsx
//
// Equipos y maquinaria en una obra: cada uso (cantidad × tarifa) es gasto real.
// Si el arriendo trae factura, se asocia al uso para no contarlo dos veces.

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

const UNIDADES = [
  { value: 'dia', label: 'Día' },
  { value: 'hora', label: 'Hora' },
  { value: 'mes', label: 'Mes' },
]
const UNIDAD_PLURAL: Record<string, string> = { dia: 'días', hora: 'horas', mes: 'meses' }

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function EquiposPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data: equipos, error: eE, isLoading: cargandoE, mutate: mutEquipos } = useSWR<any[]>('/api/equipos', fetcher)
  const { data: usos, error: eU, isLoading: cargandoU, mutate: mutUsos } = useSWR<any[]>(`/api/equipos/usos?proyecto_id=${proyectoId}`, fetcher)
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)

  const [uso, setUso]       = useState<any>(null)
  const [equipo, setEquipo] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  const listaEquipos: any[] = Array.isArray(equipos) ? equipos : []
  const listaUsos: any[] = Array.isArray(usos) ? usos : []
  const opciones = useMemo(() => [{ value: '', label: '— Sin partida —' }, ...opcionesPartida(partidas)], [partidas])
  const nombreEquipo = (id: string) => listaEquipos.find(e => e.id === id)
  const costoTotal = listaUsos.reduce((s, u) => s + (Number(u.monto) || 0), 0)

  const enviar = async (url: string, method: string, body: any) => {
    setMsg('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(j.error || 'No se pudo guardar'); return null }
    if (j.aviso) setMsg(j.aviso)
    return j
  }

  const elegirEquipo = (id: string) => {
    const e = nombreEquipo(id)
    setUso((u: any) => ({ ...u, equipo_id: id, tarifa: e ? String(e.tarifa ?? 0) : '' }))
  }

  const guardarUso = async () => {
    setSaving(true)
    const j = await enviar('/api/equipos/usos', 'POST', {
      equipo_id: uso.equipo_id,
      proyecto_id: proyectoId,
      partida_id: uso.partida_id || null,
      fecha_desde: uso.fecha_desde,
      fecha_hasta: uso.fecha_hasta || null,
      cantidad: Number(uso.cantidad),
      tarifa: Number(uso.tarifa) || 0,
      factura_id: uso.factura_id || null,
    })
    setSaving(false)
    if (j) { setUso(null); await mutUsos() }
  }

  const guardarEquipo = async () => {
    setSaving(true)
    const j = await enviar('/api/equipos', 'POST', { ...equipo, tarifa: Number(equipo.tarifa) || 0 })
    setSaving(false)
    if (j) {
      setEquipo(null)
      await mutEquipos()
      if (uso) setUso((u: any) => ({ ...u, equipo_id: j.id, tarifa: String(j.tarifa ?? 0) }))
    }
  }

  const eliminarUso = async (u: any) => {
    if (!(await confirmar('¿Eliminar este uso? Deja de contar como gasto de la obra.'))) return
    if (await enviar('/api/equipos/usos', 'DELETE', { id: u.id })) await mutUsos()
  }

  if (cargandoE || cargandoU) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando equipos…</div>
  if (eE || eU || (equipos as any)?.error || (usos as any)?.error) {
    return (
      <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
        No se pudieron cargar los equipos. Recarga la página; si sigue pasando, avisa al administrador.
      </div>
    )
  }

  const unidadUso = nombreEquipo(uso?.equipo_id)?.unidad_cobro

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Equipos y maquinaria</h4>
          <p className="text-[12px] text-muted mt-0.5 max-w-[520px]">
            Cada uso suma cantidad × tarifa al gasto real. En equipos propios, la tarifa es tu costo interno.
          </p>
        </div>
        {puedeEditar && !uso && (
          <Btn variant="primary" onClick={() => { setMsg(''); setUso({ equipo_id: '', partida_id: '', fecha_desde: hoyLocal(), fecha_hasta: '', cantidad: '', tarifa: '', factura_id: '' }) }}>
            + Registrar uso
          </Btn>
        )}
      </div>

      {msg && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{msg}</div>}

      {uso && (
        <div className="border border-line rounded-xl p-4 mb-5 bg-canvas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <div>
              <FormSelect label="Equipo" value={uso.equipo_id} onChange={elegirEquipo}
                options={[{ value: '', label: '— Elegir —' }, ...listaEquipos.filter(e => e.activo !== false).map(e => ({ value: e.id, label: `${e.nombre}${e.tipo === 'propio' ? ' (propio)' : ''}` }))]} />
              {!equipo && (
                <button onClick={() => setEquipo({ nombre: '', tipo: 'arrendado', proveedor: '', unidad_cobro: 'dia', tarifa: '' })}
                  className="block text-[11px] font-semibold text-brand hover:underline -mt-2 mb-3">+ Nuevo equipo</button>
              )}
            </div>
            <FormSelect label="Partida (opcional)" value={uso.partida_id} onChange={v => setUso((u: any) => ({ ...u, partida_id: v }))} options={opciones} />

            {equipo && (
              <div className="sm:col-span-2 border border-dashed border-line2 rounded-lg p-3 mb-3 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                  <FormInput label="Nombre del equipo *" value={equipo.nombre} onChange={v => setEquipo((e: any) => ({ ...e, nombre: v }))} />
                  <FormSelect label="Tipo" value={equipo.tipo} onChange={v => setEquipo((e: any) => ({ ...e, tipo: v }))}
                    options={[{ value: 'arrendado', label: 'Arrendado' }, { value: 'propio', label: 'Propio' }]} />
                  <FormSelect label="Se cobra por" value={equipo.unidad_cobro} onChange={v => setEquipo((e: any) => ({ ...e, unidad_cobro: v }))} options={UNIDADES} />
                  <FormInput label="Tarifa ($)" type="number" value={equipo.tarifa} onChange={v => setEquipo((e: any) => ({ ...e, tarifa: v }))} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Btn onClick={() => setEquipo(null)}>Cancelar</Btn>
                  <Btn onClick={guardarEquipo} disabled={saving}>Crear equipo</Btn>
                </div>
              </div>
            )}

            <FormInput label={`Cantidad${unidadUso ? ` (${UNIDAD_PLURAL[unidadUso]})` : ''}`} type="number" value={uso.cantidad} onChange={v => setUso((u: any) => ({ ...u, cantidad: v }))} />
            <FormInput label="Tarifa ($)" type="number" value={uso.tarifa} onChange={v => setUso((u: any) => ({ ...u, tarifa: v }))} />
            <FormInput label="Desde" type="date" value={uso.fecha_desde} onChange={v => setUso((u: any) => ({ ...u, fecha_desde: v }))} />
            <FormInput label="Hasta (opcional)" type="date" value={uso.fecha_hasta} onChange={v => setUso((u: any) => ({ ...u, fecha_hasta: v }))} />
          </div>
          <div className="mb-3">
            <label className="label-base">Factura del arriendo (opcional)</label>
            <SelectorFactura value={uso.factura_id} label={uso._folio}
              onPick={f => setUso((u: any) => ({ ...u, factura_id: f.id, _folio: String(f.numero) }))}
              onClear={() => setUso((u: any) => ({ ...u, factura_id: '', _folio: '' }))} />
            <p className="text-[11px] text-muted mt-1">Con factura asociada, cuenta la factura y no este uso (evita el doble conteo).</p>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-ink">Total {fmt(Math.round((Number(uso.cantidad) || 0) * (Number(uso.tarifa) || 0)))}</span>
            <div className="flex gap-2">
              <Btn onClick={() => { setUso(null); setEquipo(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={guardarUso} disabled={saving || !uso.equipo_id}>{saving ? 'Guardando…' : 'Guardar uso'}</Btn>
            </div>
          </div>
        </div>
      )}

      {listaUsos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <MetricCard label="Usos registrados" value={listaUsos.length} />
          <MetricCard label="Costo de equipos" value={fmt(costoTotal)} />
        </div>
      )}

      {listaUsos.length === 0 && !uso ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin equipos registrados en esta obra.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {listaUsos.map(u => {
            const e = nombreEquipo(u.equipo_id)
            return (
              <div key={u.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-canvas rounded-lg text-[12px]">
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{e?.nombre ?? 'Equipo'}</span>
                  <div className="text-[10px] text-muted truncate">
                    {fmtFecha(u.fecha_desde)}{u.fecha_hasta ? ` a ${fmtFecha(u.fecha_hasta)}` : ''} · {Number(u.cantidad)} {e ? UNIDAD_PLURAL[e.unidad_cobro] : ''} × {fmt(u.tarifa)}
                    {u.factura_id ? ' · con factura' : ''}
                  </div>
                </div>
                <div className={`font-bold tabular-nums whitespace-nowrap ${u.factura_id ? 'text-muted' : 'text-ink'}`}>{fmt(u.monto)}</div>
                {puedeEditar && (
                  <button onClick={() => eliminarUso(u)} aria-label="Eliminar uso" className="text-danger text-[12px] hover:opacity-70">✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

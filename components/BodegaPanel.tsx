'use client'
// components/BodegaPanel.tsx
//
// Bodega de una obra: stock valorizado y movimientos. Lo comprado ya es gasto al
// recibirlo: consumir controla el material; traspasar mueve también su costo.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, MetricCard, fmt } from '@/components/ui'
import { opcionesPartida } from '@/lib/costos'
import { usePermisos } from '@/lib/usePermisos'
import { fmtFecha } from '@/lib/format'
import { confirmar } from '@/lib/avisos'

interface Props {
  proyectoId: string
}

const TIPOS: Record<string, string> = {
  consumo: 'Consumo', traspaso: 'Traspaso a otra obra', ajuste: 'Ajuste de inventario', entrada: 'Entrada manual',
}
const AYUDA: Record<string, string> = {
  consumo: 'Saca material de la bodega. No suma gasto: ya se contó al recibirlo.',
  traspaso: 'Mueve el material y su costo a la otra obra.',
  ajuste: 'Corrige el stock tras un conteo: positivo suma, negativo resta. No cambia el gasto.',
  entrada: 'Para stock inicial o material sin orden de compra. No genera gasto.',
}
const ETIQUETA_MOV: Record<string, string> = { entrada: 'Entrada', consumo: 'Consumo', ajuste: 'Ajuste', traspaso: 'Traspaso' }

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BodegaPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, isLoading, mutate } = useSWR<any>(`/api/bodega?proyecto_id=${proyectoId}`, fetcher)
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)

  const [form, setForm]     = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  const stock: any[] = Array.isArray(data?.stock) ? data.stock : []
  const movimientos: any[] = Array.isArray(data?.movimientos) ? data.movimientos : []
  const opciones = useMemo(() => [{ value: '', label: '— Sin partida —' }, ...opcionesPartida(partidas)], [partidas])
  const destinos = useMemo(() => [
    { value: '', label: '— Elegir obra —' },
    ...(Array.isArray(proyectos) ? proyectos : []).filter((p: any) => p.id !== proyectoId).map((p: any) => ({ value: p.id, label: p.nombre })),
  ], [proyectos, proyectoId])

  const valorTotal = stock.reduce((s, l) => s + (l.valor || 0), 0)
  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const abrir = (tipo: string, linea?: any) => {
    setMsg('')
    setForm({ tipo, material: linea?.material ?? '', unidad: linea?.unidad ?? 'un', cantidad: '', costo_unitario: '', fecha: hoyLocal(), partida_id: '', destino_id: '', notas: '' })
  }

  const guardar = async () => {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/bodega', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        proyecto_id: proyectoId,
        cantidad: Number(form.cantidad),
        costo_unitario: form.tipo === 'entrada' ? Number(form.costo_unitario) || 0 : null,
        partida_id: form.partida_id || null,
        destino_id: form.destino_id || null,
        notas: form.notas || null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg(j.error || 'No se pudo registrar el movimiento'); return }
    setForm(null)
    await mutate()
  }

  const eliminar = async (m: any) => {
    if (!(await confirmar(m.traspaso_id ? '¿Eliminar el traspaso? Se revierte en ambas obras.' : '¿Eliminar este movimiento?'))) return
    setMsg('')
    const res = await fetch('/api/bodega', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(j.error || 'No se pudo eliminar el movimiento'); return }
    await mutate()
  }

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando bodega…</div>
  if (error || data?.error) {
    return (
      <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
        No se pudo cargar la bodega. Recarga la página; si sigue pasando, avisa al administrador.
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Bodega de la obra</h4>
          <p className="text-[12px] text-muted mt-0.5 max-w-[520px]">
            Lo recibido en las órdenes de compra entra solo. Registra aquí lo que se consume, se traspasa o se ajusta.
          </p>
        </div>
        {puedeEditar && !form && (
          <div className="flex gap-2 flex-wrap">
            <Btn onClick={() => abrir('entrada')}>+ Entrada manual</Btn>
            <Btn variant="primary" onClick={() => abrir('consumo')}>Registrar consumo</Btn>
          </div>
        )}
      </div>

      {msg && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{msg}</div>}

      {form && (
        <div className="border border-line rounded-xl p-4 mb-5 bg-canvas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <FormSelect label="Movimiento" value={form.tipo} onChange={v => upd('tipo', v)}
              options={Object.entries(TIPOS).map(([value, label]) => ({ value, label }))} />
            <FormInput label="Fecha" type="date" value={form.fecha} onChange={v => upd('fecha', v)} />
            {form.tipo === 'entrada'
              ? <FormInput label="Material" value={form.material} onChange={v => upd('material', v)} />
              : <FormSelect label="Material" value={form.material}
                  onChange={v => {
                    const l = stock.find(x => x.material === v)
                    setForm((f: any) => ({ ...f, material: v, unidad: l?.unidad ?? f.unidad }))
                  }}
                  options={[{ value: '', label: '— Elegir —' }, ...stock.map(l => ({ value: l.material, label: `${l.material} (${l.stock} ${l.unidad})` }))]} />}
            <div className="grid grid-cols-2 gap-x-3">
              <FormInput label={form.tipo === 'ajuste' ? 'Cantidad (+ o −)' : 'Cantidad'} type="number" value={form.cantidad} onChange={v => upd('cantidad', v)} />
              <FormInput label="Unidad" value={form.unidad} onChange={v => upd('unidad', v)} />
            </div>
            {form.tipo === 'entrada' && (
              <FormInput label="Costo unitario ($)" type="number" value={form.costo_unitario} onChange={v => upd('costo_unitario', v)} />
            )}
            {form.tipo === 'consumo' && (
              <FormSelect label="Partida (opcional)" value={form.partida_id} onChange={v => upd('partida_id', v)} options={opciones} />
            )}
            {form.tipo === 'traspaso' && (
              <FormSelect label="Obra de destino" value={form.destino_id} onChange={v => upd('destino_id', v)} options={destinos} />
            )}
          </div>
          <p className="text-[11px] text-muted mb-3">{AYUDA[form.tipo]}</p>
          <div className="flex gap-2 justify-end">
            <Btn onClick={() => setForm(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <MetricCard label="Materiales con stock" value={stock.filter(l => l.stock > 0).length} />
        <MetricCard label="Valor en bodega" value={fmt(valorTotal)} sub="Comprado y aún sin consumir" />
      </div>

      {stock.length === 0 ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin movimientos. Recibe una orden de compra de esta obra o registra una entrada manual.
        </div>
      ) : (
        <div className="overflow-x-auto mb-5">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-line2 text-left">
                <th className="py-2 pr-2 font-bold text-muted">Material</th>
                <th className="py-2 px-2 font-bold text-muted text-right">Stock</th>
                <th className="py-2 px-2 font-bold text-muted text-right">Costo prom.</th>
                <th className="py-2 px-2 font-bold text-muted text-right">Valor</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {stock.map(l => (
                <tr key={l.clave} className="border-b border-canvas">
                  <td className="py-1.5 pr-2 font-semibold text-ink">{l.material}</td>
                  <td className={`py-1.5 px-2 text-right whitespace-nowrap ${l.stock <= 0 ? 'text-muted' : 'text-ink font-semibold'}`}>{l.stock} {l.unidad}</td>
                  <td className="py-1.5 px-2 text-right text-muted">{fmt(l.costo_promedio)}</td>
                  <td className="py-1.5 px-2 text-right font-semibold text-ink">{fmt(l.valor)}</td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                    {puedeEditar && l.stock > 0 && (
                      <>
                        <button onClick={() => abrir('consumo', l)} className="text-[11px] font-semibold text-brand hover:underline mr-2">Consumir</button>
                        <button onClick={() => abrir('traspaso', l)} className="text-[11px] font-semibold text-brand hover:underline">Traspasar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movimientos.length > 0 && (
        <>
          <div className="text-[12px] font-bold text-ink mb-2">Últimos movimientos</div>
          <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
            {movimientos.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-canvas rounded-lg text-[12px]">
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{ETIQUETA_MOV[m.tipo] ?? m.tipo} · {m.material}</span>
                  <div className="text-[10px] text-muted truncate">{fmtFecha(m.fecha)}{m.notas ? ` · ${m.notas}` : ''}</div>
                </div>
                <div className={`font-bold tabular-nums whitespace-nowrap ${Number(m.cantidad) < 0 ? 'text-danger' : 'text-success'}`}>
                  {Number(m.cantidad) > 0 ? '+' : ''}{Number(m.cantidad)} {m.unidad}
                </div>
                {puedeEditar && !m.recepcion_id
                  ? <button onClick={() => eliminar(m)} aria-label="Eliminar movimiento" className="text-danger text-[12px] hover:opacity-70">✕</button>
                  : <span className="w-3" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

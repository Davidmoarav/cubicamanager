'use client'
// app/(protected)/ordenes-compra/page.tsx
// Listado y edición de órdenes de compra, con generación automática de
// líneas (cantidad x rendimiento + precio) desde las partidas del proyecto.

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th } from '@/components/ui'
import { fmt } from '@/lib/format'
import { UNIDADES } from '@/types/cotizaciones'

const IVA = 0.19

const ESTADO_OC: Record<string, { label: string; bg: string; color: string }> = {
  borrador: { label: 'Borrador', bg: '#f0f4f8', color: '#6b7a8d' },
  enviada:  { label: 'Enviada',  bg: '#e8f1fb', color: '#1e6bb8' },
  recibida: { label: 'Recibida', bg: '#e6f4ed', color: '#1a7a4a' },
  anulada:  { label: 'Anulada',  bg: '#fdecea', color: '#b0401a' },
}
const ESTADOS = Object.entries(ESTADO_OC).map(([value, v]) => ({ value, label: v.label }))

function BadgeOC({ estado }: { estado: string }) {
  const s = ESTADO_OC[estado] ?? { label: estado, bg: '#eee', color: '#555' }
  return (
    <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-[6px] whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

const nuevaLinea = () => ({ _k: crypto.randomUUID(), material: '', unidad: 'un', cantidad: 1, precio_unitario: 0 })

export default function OrdenesCompraPage() {
  const { data: items = [], isLoading, mutate } = useSWR<any[]>('/api/ordenes-compra', fetcher)
  const { data: proveedores = [] } = useSWR<any[]>('/api/proveedores', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)

  const [modal, setModal]     = useState<'nueva' | 'editar' | null>(null)
  const [editId, setEditId]   = useState<string | null>(null)
  const [form, setForm]       = useState<any>({})
  const [lineas, setLineas]   = useState<any[]>([])
  const [saving, setSaving]   = useState(false)
  const [sugiriendo, setSugiriendo] = useState(false)


  const provOptions = useMemo(
    () => [{ value: '', label: '— Sin proveedor —' }, ...proveedores.map(p => ({ value: p.id, label: p.nombre }))],
    [proveedores])
  const proyOptions = useMemo(
    () => [{ value: '', label: '— Sin proyecto —' }, ...proyectos.map(p => ({ value: p.id, label: p.nombre }))],
    [proyectos])

  const totales = useMemo(() => {
    const neto = Math.round(lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0))
    const iva = Math.round(neto * IVA)
    return { neto, iva, total: neto + iva }
  }, [lineas])

  const montoTotal = useMemo(
    () => items.filter(o => o.estado !== 'anulada').reduce((s, o) => s + (Number(o.total) || 0), 0),
    [items])

  // ─── abrir / editar ───────────────────────────────────────
  const openNueva = () => {
    setEditId(null)
    setForm({ proveedor_id: '', proyecto_id: '', fecha: new Date().toISOString().split('T')[0], estado: 'borrador', notas: '' })
    setLineas([nuevaLinea()])
    setModal('nueva')
  }
  const openEditar = async (oc: any) => {
    const full = await fetch(`/api/ordenes-compra?id=${oc.id}`).then(r => r.json()).catch(() => null)
    if (!full) { alert('No se pudo cargar la OC'); return }
    setEditId(oc.id)
    setForm({
      proveedor_id: full.proveedor_id || '', proyecto_id: full.proyecto_id || '',
      fecha: full.fecha, estado: full.estado, notas: full.notas || '',
    })
    setLineas((full.lineas || []).map((l: any) => ({ ...l, _k: crypto.randomUUID() })))
    setModal('editar')
  }

  // ─── líneas ───────────────────────────────────────────────
  const updLinea = (k: string, campo: string, val: any) =>
    setLineas(prev => prev.map(l => l._k === k ? { ...l, [campo]: val } : l))
  const addLinea = () => setLineas(prev => [...prev, nuevaLinea()])
  const delLinea = (k: string) => setLineas(prev => prev.filter(l => l._k !== k))

  const generarDesdeProyecto = async () => {
    if (!form.proyecto_id) { alert('Elige un proyecto primero para generar las líneas.'); return }
    setSugiriendo(true)
    const res = await fetch(`/api/ordenes-compra?sugerir=1&proyecto_id=${form.proyecto_id}`)
      .then(r => r.json()).catch(() => ({ lineas: [] }))
    setSugiriendo(false)
    const sug = (res.lineas || []).map((l: any) => ({ ...l, _k: crypto.randomUUID() }))
    if (sug.length === 0) {
      alert('Ese proyecto no tiene materiales con rendimiento cargado. Cárgalos en la pestaña Obra → partida → Materiales.')
      return
    }
    setLineas(sug)
  }

  // ─── guardar / estado / borrar ────────────────────────────
  const save = async () => {
    const validas = lineas.filter(l => l.material && (Number(l.cantidad) || 0) > 0)
    if (validas.length === 0) { alert('Agrega al menos una línea con material y cantidad.'); return }
    setSaving(true)
    const prov = proveedores.find(p => p.id === form.proveedor_id)
    const proy = proyectos.find(p => p.id === form.proyecto_id)
    const payload: any = {
      ...(editId ? { id: editId } : {}),
      proveedor_id: form.proveedor_id || null,
      proveedor:    prov?.nombre || null,
      proyecto_id:  form.proyecto_id || null,
      proyecto:     proy?.nombre || null,
      fecha: form.fecha, estado: form.estado, notas: form.notas,
      lineas: validas.map(l => ({
        material: l.material, unidad: l.unidad || 'un',
        cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
      })),
    }
    const res = await fetch('/api/ordenes-compra', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar: ' + (err.error || 'error desconocido') +
        '\n\nSi menciona "ordenes_compra", ejecuta el SQL 15_ordenes_compra.sql en Supabase.')
      return
    }
    await mutate(); setModal(null)
  }

  const cambiarEstado = async (oc: any, estado: string) => {
    await fetch('/api/ordenes-compra', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oc.id, estado }),
    })
    await mutate()
  }
  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta orden de compra?')) return
    await fetch('/api/ordenes-compra', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    await mutate()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <SectionTitle>Órdenes de compra</SectionTitle>
        <Btn variant="primary" onClick={openNueva}>+ Nueva OC</Btn>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total OCs" value={items.length} />
        <MetricCard label="En borrador" value={items.filter(o => o.estado === 'borrador').length} sub="Pendientes de enviar" />
        <MetricCard label="Monto comprometido" value={fmt(montoTotal)} sub="Excluye anuladas" />
      </div>

      {/* Tabla */}
      <div className="bg-white border border-line rounded-2xl p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : items.length === 0
          ? <p className="text-muted text-center p-10">Aún no hay órdenes de compra. Crea la primera.</p>
          : (
            <Table>
              <thead><tr>
                <Th>N°</Th><Th>Fecha</Th><Th>Proveedor</Th><Th>Proyecto</Th><Th>Total</Th><Th>Estado</Th><Th></Th>
              </tr></thead>
              <tbody>
                {items.map(o => (
                  <tr key={o.id}>
                    <Td className="font-bold text-brand">#{o.numero}</Td>
                    <Td className="text-muted">{o.fecha}</Td>
                    <Td className="font-semibold text-[#1a2535]">{o.proveedor || '—'}</Td>
                    <Td className="text-muted">{o.proyecto || '—'}</Td>
                    <Td className="font-bold tabular-nums">{fmt(o.total)}</Td>
                    <Td><BadgeOC estado={o.estado} /></Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        <select
                          value={o.estado}
                          onChange={e => cambiarEstado(o, e.target.value)}
                          className="input-base !mb-0 !py-1.5 w-[110px] cursor-pointer text-[12px]"
                        >
                          {ESTADOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <Btn onClick={() => openEditar(o)} className="px-2.5 py-1.5">Editar</Btn>
                        <Btn variant="danger" onClick={() => del(o.id)} className="px-2.5 py-1.5">✕</Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
      </div>

      {/* ══════ MODAL ══════ */}
      {modal && (
        <Modal title={editId ? 'Editar orden de compra' : 'Nueva orden de compra'} onClose={() => setModal(null)}>
          {/* Cabecera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <FormSelect label="Proveedor" value={form.proveedor_id || ''} onChange={v => setForm((f: any) => ({ ...f, proveedor_id: v }))} options={provOptions} />
            <FormSelect label="Proyecto" value={form.proyecto_id || ''} onChange={v => setForm((f: any) => ({ ...f, proyecto_id: v }))} options={proyOptions} />
            <div className="mb-3">
              <label className="label-base">Fecha</label>
              <input type="date" value={form.fecha || ''} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className="input-base" />
            </div>
          </div>

          {/* Generar desde proyecto */}
          <div className="flex items-center justify-between bg-brand-bg border border-[#b5d4f4] rounded-lg px-4 py-2.5 mb-3">
            <div className="text-[12px] text-[#0c447c]">
              <strong>Precios automáticos:</strong> genera las líneas desde los rendimientos del proyecto.
            </div>
            <Btn onClick={generarDesdeProyecto} disabled={sugiriendo || !form.proyecto_id}>
              {sugiriendo ? 'Generando…' : '⚡ Generar desde proyecto'}
            </Btn>
          </div>

          {/* Líneas */}
          <div className="border border-line rounded-lg overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-canvas text-[10px] font-bold text-muted uppercase tracking-wide">
              <span className="flex-1">Material</span>
              <span className="w-[70px]">Unidad</span>
              <span className="w-[80px] text-right">Cantidad</span>
              <span className="w-[100px] text-right">Precio</span>
              <span className="w-[100px] text-right">Subtotal</span>
              <span className="w-6" />
            </div>
            {lineas.map(l => {
              const subtotal = Math.round((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))
              return (
                <div key={l._k} className="flex items-center gap-2 px-3 py-2 border-t border-[#e4e9f0]">
                  <input value={l.material} onChange={e => updLinea(l._k, 'material', e.target.value)}
                    placeholder="Ej: Adhesivo EIFS" className="input-base flex-1 !mb-0" />
                  <select value={l.unidad} onChange={e => updLinea(l._k, 'unidad', e.target.value)} className="input-base w-[70px] !mb-0">
                    {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
                  </select>
                  <input type="number" value={l.cantidad} onChange={e => updLinea(l._k, 'cantidad', e.target.value)}
                    className="input-base w-[80px] text-right !mb-0" />
                  <input type="number" value={l.precio_unitario} onChange={e => updLinea(l._k, 'precio_unitario', e.target.value)}
                    className="input-base w-[100px] text-right !mb-0" />
                  <span className="w-[100px] text-right text-[13px] font-semibold tabular-nums">{fmt(subtotal)}</span>
                  <button onClick={() => delLinea(l._k)} className="w-6 h-6 rounded-[5px] border-none bg-danger-bg text-danger text-[11px] font-bold cursor-pointer flex items-center justify-center">✕</button>
                </div>
              )
            })}
          </div>
          <button onClick={addLinea} className="w-full py-2 mb-3 bg-white border border-dashed border-[#d1d9e6] rounded-[6px] text-[12px] text-brand font-semibold cursor-pointer">
            + Agregar línea
          </button>

          {/* Totales */}
          <div className="flex flex-col items-end gap-0.5 text-[13px] mb-3">
            <div className="flex gap-6"><span className="text-muted">Neto</span><span className="font-semibold tabular-nums w-[110px] text-right">{fmt(totales.neto)}</span></div>
            <div className="flex gap-6"><span className="text-muted">IVA 19%</span><span className="font-semibold tabular-nums w-[110px] text-right">{fmt(totales.iva)}</span></div>
            <div className="flex gap-6 text-[15px]"><span className="font-bold text-ink">Total</span><span className="font-extrabold text-brand tabular-nums w-[110px] text-right">{fmt(totales.total)}</span></div>
          </div>

          {/* Estado + notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormSelect label="Estado" value={form.estado || 'borrador'} onChange={v => setForm((f: any) => ({ ...f, estado: v }))} options={ESTADOS} />
            <div className="mb-3">
              <label className="label-base">Notas</label>
              <input value={form.notas || ''} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))} className="input-base" placeholder="Opcional" />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-2">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar OC'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
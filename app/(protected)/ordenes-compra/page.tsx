'use client'
// app/(protected)/ordenes-compra/page.tsx
// Listado y edición de órdenes de compra, con generación automática de
// líneas (cantidad x rendimiento + precio) desde las partidas del proyecto.

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import DescargarOCBtn from '@/components/DescargarOCBtn'
import SelectorCatalogo from '@/components/SelectorCatalogo'
import SelectorFactura from '@/components/SelectorFactura'
import RecepcionOC from '@/components/RecepcionOC'
import FiltroObra, { useObraFiltro } from '@/components/FiltroObra'
import { Btn, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th } from '@/components/ui'
import { fmt, fmtFecha } from '@/lib/format'
import { opcionesPartida } from '@/lib/costos'
import { UNIDADES } from '@/types/cotizaciones'
import { avisar, confirmar } from '@/lib/avisos'
import { usePermisos } from '@/lib/usePermisos'

const IVA = 0.19

const ESTADO_OC: Record<string, { label: string; bg: string; color: string }> = {
  borrador: { label: 'Borrador', bg: '#F1ECE6', color: '#6b7a8d' },
  enviada:  { label: 'Enviada',  bg: '#FCEAE3', color: '#E5502A' },
  parcial:  { label: 'Parcial',  bg: '#fff4dc', color: '#b07d1a' },
  recibida: { label: 'Recibida', bg: '#e6f4ed', color: '#1a7a4a' },
  anulada:  { label: 'Anulada',  bg: '#fdecea', color: '#b0401a' },
}
const ESTADOS = Object.entries(ESTADO_OC).map(([value, v]) => ({ value, label: value === 'recibida' ? 'Recibida (recibe todo lo pendiente)' : v.label }))

function BadgeOC({ estado }: { estado: string }) {
  const s = ESTADO_OC[estado] ?? { label: estado, bg: '#eee', color: '#555' }
  return (
    <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-[6px] whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

const nuevaLinea = () => ({ _k: crypto.randomUUID(), material: '', unidad: 'un', cantidad: 1, precio_unitario: 0, partida_id: '' })

const CONCILIACION: Record<string, { texto: string; cls: string }> = {
  cuadra:        { texto: 'La factura cuadra con lo recibido', cls: 'text-success bg-success-bg' },
  factura_mayor: { texto: 'La factura supera lo recibido', cls: 'text-danger bg-danger-bg' },
  factura_menor: { texto: 'La factura es menor que lo recibido', cls: 'text-warning bg-warning-bg' },
}

export default function OrdenesCompraPage() {
  const { puedeEditar } = usePermisos('obra')
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite]     = useState(60)
  const [obra, setObra] = useObraFiltro()
  const paramObra = obra ? `&obra=${obra}` : ''
  const buscando = busqueda.trim().length >= 1
  const { data: items = [], isLoading, mutate } = useSWR<any[]>(
    buscando ? `/api/ordenes-compra?buscar=${encodeURIComponent(busqueda.trim())}${paramObra}` : `/api/ordenes-compra?limit=${limite}${paramObra}`,
    fetcher)
  const { data: resumen, mutate: mutResumen } = useSWR<any>(`/api/ordenes-compra?resumen=1${paramObra}`, fetcher)
  const { data: proveedores = [] } = useSWR<any[]>('/api/proveedores', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)

  const [modal, setModal]     = useState<'nueva' | 'editar' | null>(null)
  const [editId, setEditId]   = useState<string | null>(null)
  const [form, setForm]       = useState<any>({})
  const [lineas, setLineas]   = useState<any[]>([])
  const [saving, setSaving]   = useState(false)
  const [sugiriendo, setSugiriendo] = useState(false)
  const [recibiendo, setRecibiendo] = useState<string | null>(null)
  const [conciliacion, setConciliacion] = useState<any>(null)
  const { data: partidasProy = [] } = useSWR<any[]>(
    modal && form.proyecto_id ? `/api/partidas-proyecto?proyecto_id=${form.proyecto_id}` : null, fetcher)
  const partidaOptions = useMemo(
    () => [{ value: '', label: '— Sin partida —' }, ...opcionesPartida(partidasProy)],
    [partidasProy])

  const provOptions = useMemo(
    () => [{ value: '', label: '— Sin proveedor —' }, ...proveedores.map(p => ({ value: p.id, label: p.nombre }))],
    [proveedores])
  const proyOptions = useMemo(
    () => [{ value: '', label: '— Sin obra —' }, ...proyectos.map(p => ({ value: p.id, label: p.nombre }))],
    [proyectos])

  const totales = useMemo(() => {
    const neto = Math.round(lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0))
    const iva = Math.round(neto * IVA)
    return { neto, iva, total: neto + iva }
  }, [lineas])

  // ─── abrir / editar ───────────────────────────────────────
  const openNueva = () => {
    setEditId(null)
    setForm({ proveedor_id: '', proyecto_id: '', partida_id: '', fecha: new Date().toISOString().split('T')[0], estado: 'borrador', notas: '' })
    setLineas([nuevaLinea()])
    setConciliacion(null)
    setModal('nueva')
  }
  const openEditar = async (oc: any, irAFactura = false) => {
    const res = await fetch(`/api/ordenes-compra?id=${oc.id}`).catch(() => null)
    const full = await res?.json().catch(() => null)
    if (!res?.ok || !full) {
      avisar('No se pudo cargar la orden' + (full?.error ? `: ${full.error}` : ''))
      return
    }
    setConciliacion(full.conciliacion ?? null)
    setEditId(oc.id)
    setForm({
      proveedor_id: full.proveedor_id || '', proyecto_id: full.proyecto_id || '', partida_id: full.partida_id || '',
      fecha: full.fecha, estado: full.estado, notas: full.notas || '',
      factura_id: full.factura_id || '', _facturaFolio: full.conciliacion?.factura_numero || '',
    })
    setLineas((full.lineas || []).map((l: any) => ({ ...l, partida_id: l.partida_id || '', _k: crypto.randomUUID() })))
    setModal('editar')
    if (irAFactura) setTimeout(() => document.getElementById('oc-factura')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  // ─── líneas ───────────────────────────────────────────────
  const updLinea = (k: string, campo: string, val: any) =>
    setLineas(prev => prev.map(l => l._k === k ? { ...l, [campo]: val } : l))
  const addLinea = () => setLineas(prev => [...prev, nuevaLinea()])
  const addDelCatalogo = (p: any) => setLineas(prev => [...prev, {
    _k: crypto.randomUUID(),
    material: p.descripcion,
    unidad: p.unidad || 'un',
    cantidad: 1,
    precio_unitario: Number(p.precio) || 0,
    partida_id: '',
  }])
  const delLinea = (k: string) => setLineas(prev => prev.filter(l => l._k !== k))

  const generarDesdeProyecto = async () => {
    if (!form.proyecto_id) { avisar('Elige una obra primero para generar las líneas.'); return }
    setSugiriendo(true)
    const res = await fetch(`/api/ordenes-compra?sugerir=1&proyecto_id=${form.proyecto_id}`)
      .then(r => r.json()).catch(() => ({ lineas: [] }))
    setSugiriendo(false)
    const sug = (res.lineas || []).map((l: any) => ({ ...l, partida_id: l.partida_id || '', _k: crypto.randomUUID() }))
    if (sug.length === 0) {
      avisar('Esa obra no tiene materiales con rendimiento cargado. Cárgalos en Partidas y avance.')
      return
    }
    setLineas(sug)
  }

  // ─── guardar / estado / borrar ────────────────────────────
  const save = async () => {
    const validas = lineas.filter(l => l.material && (Number(l.cantidad) || 0) > 0)
    if (validas.length === 0) { avisar('Agrega al menos una línea con material y cantidad.'); return }
    setSaving(true)
    const prov = proveedores.find(p => p.id === form.proveedor_id)
    const proy = proyectos.find(p => p.id === form.proyecto_id)
    const payload: any = {
      ...(editId ? { id: editId } : {}),
      proveedor_id: form.proveedor_id || null,
      proveedor:    prov?.nombre || null,
      proyecto_id:  form.proyecto_id || null,
      proyecto:     proy?.nombre || null,
      partida_id:   form.partida_id || null,
      fecha: form.fecha, estado: form.estado, notas: form.notas,
      factura_id: form.factura_id || null,
      lineas: validas.map(l => ({
        ...(l.id ? { id: l.id } : {}),
        material: l.material, unidad: l.unidad || 'un',
        cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
        partida_id: l.partida_id || null,
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
      avisar('No se pudo guardar: ' + (err.error || 'error desconocido'))
      return
    }
    await mutate(); mutResumen(); setModal(null)
  }

  const cambiarEstado = async (oc: any, estado: string) => {
    const res = await fetch('/api/ordenes-compra', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oc.id, estado }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      avisar('No se pudo cambiar el estado: ' + (err.error || 'error desconocido'))
    }
    await mutate(); mutResumen()
  }
  const del = async (id: string) => {
    if (!(await confirmar('¿Eliminar esta orden de compra?'))) return
    const res = await fetch('/api/ordenes-compra', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      avisar('No se pudo eliminar: ' + (err.error || 'error desconocido'))
    }
    await mutate(); mutResumen()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <SectionTitle>Órdenes de compra</SectionTitle>
        {puedeEditar && (<Btn variant="primary" onClick={openNueva}>+ Nueva orden</Btn>)}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total órdenes" value={resumen?.total_count ?? '—'} />
        <MetricCard label="En borrador" value={resumen?.borrador ?? '—'} sub="Pendientes de enviar" />
        <MetricCard label="Monto comprometido" value={fmt(resumen?.monto_total ?? 0)} sub="Excluye anuladas" />
      </div>

      {/* Buscador */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por proveedor o proyecto…"
          className="input-base !mb-0 flex-1 min-w-[220px] max-w-sm" />
        <FiltroObra value={obra} onChange={setObra} proyectos={proyectos} />
      </div>

      {/* Tabla */}
      <div className="bg-white border border-line rounded-card p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : items.length === 0
          ? <p className="text-muted text-center p-10">{buscando ? 'Sin resultados para la búsqueda.' : 'Aún no hay órdenes de compra. Crea la primera.'}</p>
          : (
            <Table>
              <thead><tr>
                <Th>N°</Th><Th>Fecha</Th><Th>Proveedor</Th><Th>Obra</Th><Th>Total</Th><Th>Estado</Th><Th></Th>
              </tr></thead>
              <tbody>
                {items.map(o => (
                  <tr key={o.id}>
                    <Td className="font-bold text-brand">#{o.numero}</Td>
                    <Td className="text-muted">{fmtFecha(o.fecha)}</Td>
                    <Td className="font-semibold text-[#1a2535]">{o.proveedor || '—'}</Td>
                    <Td className="text-muted">{o.proyecto || '—'}</Td>
                    <Td className="font-bold tabular-nums">{fmt(o.total)}</Td>
                    <Td><BadgeOC estado={o.estado} />{o.factura_id ? <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-success-bg text-success">facturada</span> : null}</Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        {puedeEditar && o.estado === 'borrador' && <Btn variant="primary" onClick={() => cambiarEstado(o, 'enviada')} className="px-2.5 py-1.5 whitespace-nowrap">Marcar enviada</Btn>}
                        {puedeEditar && (o.estado === 'enviada' || o.estado === 'parcial') && <Btn variant="primary" onClick={() => setRecibiendo(o.id)} className="px-2.5 py-1.5">Recibir</Btn>}
                        {puedeEditar && o.estado === 'recibida' && !o.factura_id && <Btn variant="primary" onClick={() => openEditar(o, true)} className="px-2.5 py-1.5 whitespace-nowrap">Asociar factura</Btn>}
                        {(o.estado === 'recibida' || (!puedeEditar && o.estado === 'parcial')) && <Btn onClick={() => setRecibiendo(o.id)} className="px-2.5 py-1.5">Recepciones</Btn>}
                        <DescargarOCBtn orden={o} proveedores={proveedores} />
                        {puedeEditar && (<Btn onClick={() => openEditar(o)} className="px-2.5 py-1.5">Editar</Btn>)}
                        {puedeEditar && (<Btn variant="danger" onClick={() => del(o.id)} className="px-2.5 py-1.5">✕</Btn>)}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        {!buscando && !isLoading && items.length >= limite && (
          <div className="text-center mt-4">
            <button onClick={() => setLimite(l => l + 60)}
              className="px-4 py-2 rounded-lg border border-line text-brand text-[13px] font-semibold hover:bg-canvas">
              Cargar más
            </button>
          </div>
        )}
      </div>

      {/* ══════ MODAL ══════ */}
      {modal && (
        <Modal title={editId ? 'Editar orden de compra' : 'Nueva orden de compra'} onClose={() => setModal(null)}>
          {/* Cabecera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <FormSelect label="Proveedor" value={form.proveedor_id || ''} onChange={v => setForm((f: any) => ({ ...f, proveedor_id: v }))} options={provOptions} />
            <FormSelect label="Obra" value={form.proyecto_id || ''}
              onChange={v => {
                setForm((f: any) => ({ ...f, proyecto_id: v, partida_id: '' }))
                setLineas(prev => prev.map(l => ({ ...l, partida_id: '' })))
              }}
              options={proyOptions} />
            <div className="mb-3">
              <label className="label-base">Fecha</label>
              <input type="date" value={form.fecha || ''} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className="input-base" />
            </div>
          </div>
          {form.proyecto_id && (
            <div className="-mt-1 mb-1">
              <FormSelect label="Partida de la orden (la de cada línea manda sobre esta)" value={form.partida_id || ''} onChange={v => setForm((f: any) => ({ ...f, partida_id: v }))} options={partidaOptions} />
            </div>
          )}

          {/* Generar desde la obra */}
          <div className="flex items-center justify-between bg-brand-bg border border-[#b5d4f4] rounded-lg px-4 py-2.5 mb-3">
            <div className="text-[12px] text-[#0c447c]">
              <strong>Precios automáticos:</strong> genera las líneas desde los rendimientos del proyecto.
            </div>
            <Btn onClick={generarDesdeProyecto} disabled={sugiriendo || !form.proyecto_id}>
              {sugiriendo ? 'Generando…' : 'Generar desde la obra'}
            </Btn>
          </div>

          {/* Agregar desde el catálogo del proveedor */}
          <SelectorCatalogo proveedorId={form.proveedor_id || ''} onPick={addDelCatalogo} />

          {/* Líneas */}
          <div className="border border-line rounded-lg overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-canvas text-[10px] font-bold text-muted uppercase tracking-wide">
              <span className="flex-1">Material</span>
              <span className="w-[70px]">Unidad</span>
              <span className="w-[80px] text-right">Cantidad</span>
              <span className="w-[100px] text-right">Precio neto</span>
              <span className="w-[100px] text-right">Subtotal</span>
              <span className="w-6" />
            </div>
            {lineas.map(l => {
              const subtotal = Math.round((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))
              return (
                <div key={l._k} className="flex items-center gap-2 px-3 py-2 border-t border-[#e4e9f0]">
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <input value={l.material} onChange={e => updLinea(l._k, 'material', e.target.value)}
                      placeholder="Ej: Adhesivo EIFS" className="input-base !mb-0" />
                    {form.proyecto_id && (
                      <select value={l.partida_id || ''} onChange={e => updLinea(l._k, 'partida_id', e.target.value)}
                        aria-label={`Partida de ${l.material || 'la línea'}`}
                        className="input-base !mb-0 !py-1 text-[11px] cursor-pointer">
                        <option value="">Partida: la de la orden</option>
                        {partidaOptions.slice(1).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
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

          {/* Factura de compra (opción A: al asociarla, el gasto de la OC se reemplaza por el de la factura) */}
          {editId && (
            <div id="oc-factura" className="mb-3">
              <label className="label-base">Factura de compra asociada</label>
              <SelectorFactura
                value={form.factura_id || ''}
                label={form._facturaFolio || ''}
                onPick={f => setForm((prev: any) => ({ ...prev, factura_id: f.id, _facturaFolio: String(f.numero) }))}
                onClear={() => setForm((prev: any) => ({ ...prev, factura_id: '', _facturaFolio: '' }))}
              />
              <p className="text-[11px] text-muted mt-1">Cuando llegue la factura del proveedor, asóciala aquí: el gasto de esta orden deja de contar y cuenta la factura (evita el doble conteo).</p>
              {conciliacion && (
                <div className="mt-2 border border-line rounded-lg px-3 py-2 text-[12px]">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
                    <span>Pedido: <strong className="text-ink">{fmt(conciliacion.neto_oc)}</strong></span>
                    <span>Recibido: <strong className="text-ink">{fmt(conciliacion.recibido)}</strong></span>
                    {conciliacion.facturado !== null && <span>Facturado: <strong className="text-ink">{fmt(conciliacion.facturado)}</strong></span>}
                    {conciliacion.n_ordenes > 1 && <span>{conciliacion.n_ordenes} órdenes en esta factura</span>}
                  </div>
                  {CONCILIACION[conciliacion.estado] && (
                    <div className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${CONCILIACION[conciliacion.estado].cls}`}>
                      {CONCILIACION[conciliacion.estado].texto}
                      {conciliacion.estado !== 'cuadra' && ` (${fmt(Math.abs(conciliacion.diferencia))})`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar orden'}</Btn>
          </div>
        </Modal>
      )}

      {recibiendo && (
        <RecepcionOC ordenId={recibiendo} onClose={() => setRecibiendo(null)} onCambio={() => { mutate(); mutResumen() }} />
      )}
    </div>
  )
}
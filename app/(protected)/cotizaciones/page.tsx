'use client'
// app/(protected)/cotizaciones/page.tsx — v5 con CONVERSIÓN

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import Link from 'next/link'
import { Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th } from '@/components/ui'
import { fmt, fmtM } from '@/lib/format'
import { UNIDADES, type Cotizacion, type PartidaCotizacion } from '@/types/cotizaciones'
import type { Cliente } from '@/types/cliente'
import type { CatalogoPartida } from '@/types/catalogo-partida'
import DescargarPDFBtn from '@/components/DescargarPDFBtn'
import ConvertirBtn from '@/components/ConvertirBtn'

const IVA = 0.19

const EMPTY_COTIZACION: any = {
  numero: '', cliente_id: '', cliente: '', proyecto_nombre: '', descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  validez_dias: 30, estado: 'borrador', notas: '', partidas: [],
}

const EMPTY_PARTIDA = (): PartidaCotizacion => ({
  id: crypto.randomUUID(), orden: 0, descripcion: '', unidad: 'un',
  cantidad: 1, precio_unitario: 0,
})

const ESTADO_COTIZ: Record<string, { label: string; bg: string; color: string }> = {
  borrador:   { label: 'Borrador',   bg: '#f0f4f8', color: '#6b7a8d' },
  enviada:    { label: 'Enviada',    bg: '#e8f1fb', color: '#1e6bb8' },
  aprobada:   { label: 'Aprobada',   bg: '#e6f4ed', color: '#1a7a4a' },
  rechazada:  { label: 'Rechazada',  bg: '#fdecea', color: '#b0401a' },
  convertida: { label: 'Convertida', bg: '#eeedfe', color: '#534ab7' },
}

function BadgeCotiz({ estado }: { estado: string }) {
  const s = ESTADO_COTIZ[estado] ?? { label: estado, bg: '#eee', color: '#555' }
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-[3px] rounded-[6px] whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

export default function CotizacionesPage() {
  const [filtro, setFiltro]     = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite]     = useState(60)
  const buscando = busqueda.trim().length >= 1
  const { data: itemsRaw = [], isLoading, mutate } = useSWR<Cotizacion[]>(
    buscando
      ? `/api/cotizaciones?buscar=${encodeURIComponent(busqueda.trim())}`
      : `/api/cotizaciones?limit=${limite}&estado=${filtro}`,
    fetcher)
  const items = Array.isArray(itemsRaw) ? itemsRaw : []
  const { data: resumen, mutate: mutResumen } = useSWR<any>('/api/cotizaciones?resumen=1', fetcher)
  const { data: clientes = [] } = useSWR<Cliente[]>('/api/clientes', fetcher)
  const [modal, setModal]       = useState<'nuevo' | 'editar' | 'ver' | null>(null)
  const [form, setForm]         = useState<any>(EMPTY_COTIZACION)
  const [saving, setSaving]     = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // ─── Importar del catálogo ───────────────────────────────
  const [showImport, setShowImport] = useState(false)
  const [catalogo, setCatalogo]     = useState<CatalogoPartida[]>([])
  const [catLoading, setCatLoading] = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())


  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const handleClienteChange = (cliente_id: string) => {
    const c = clientes.find(x => x.id === cliente_id)
    setForm((f: any) => ({
      ...f,
      cliente_id,
      cliente: c?.razon_social || '',
    }))
  }

  const addPartida = () => {
    setForm((f: any) => ({
      ...f,
      partidas: [...(f.partidas ?? []), { ...EMPTY_PARTIDA(), orden: (f.partidas?.length ?? 0) }]
    }))
  }
  const updPartida = (idx: number, k: string, v: any) => {
    setForm((f: any) => ({
      ...f,
      partidas: f.partidas.map((p: any, i: number) => i === idx ? { ...p, [k]: v } : p)
    }))
  }
  const delPartida = (idx: number) => {
    setForm((f: any) => ({
      ...f,
      partidas: f.partidas.filter((_: any, i: number) => i !== idx)
    }))
  }

  // ─── IMPORTAR PARTIDAS DEL CATÁLOGO ──────────────────────
  const openImport = async () => {
    setShowImport(true)
    setCatLoading(true)
    setSelected(new Set())
    const res  = await fetch('/api/catalogo-partidas')
    const data = await res.json()
    setCatalogo(Array.isArray(data) ? data : [])
    setCatLoading(false)
  }

  const catalogoPadres = useMemo(() => {
    const ps = catalogo.filter(c => !c.parent_id).sort((a, b) => a.orden - b.orden)
    return ps.map(p => ({
      ...p,
      children: catalogo.filter(h => h.parent_id === p.id).sort((a, b) => a.orden - b.orden),
    }))
  }, [catalogo])

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Importa las partidas seleccionadas como ítems de la cotización.
  // En una cotización las partidas son planas: importamos el PADRE como
  // título-partida con su precio de referencia (el desglose en sub-partidas
  // se controla luego en el proyecto, no en la cotización).
  const importarSeleccion = () => {
    const seleccionados = catalogoPadres.filter(p => selected.has(p.id))
    if (seleccionados.length === 0) { alert('Selecciona al menos una partida'); return }

    setForm((f: any) => {
      const base = f.partidas ?? []
      const nuevas = seleccionados.map((cat, i) => ({
        id: crypto.randomUUID(),
        orden: base.length + i,
        descripcion: cat.descripcion,
        unidad: cat.unidad || 'gl',
        cantidad: 1,
        precio_unitario: cat.precio_unitario_ref || 0,
        catalogo_id: cat.id,   // ← recuerda el origen; al convertir trae las sub-partidas
      }))
      return { ...f, partidas: [...base, ...nuevas] }
    })

    setShowImport(false)
  }

  const totales = useMemo(() => {
    const partidas = form.partidas ?? []
    const neto = partidas.reduce((s: number, p: any) => s + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0), 0)
    const iva = Math.round(neto * IVA)
    return { neto: Math.round(neto), iva, total: Math.round(neto) + iva }
  }, [form.partidas])

  const metricas = {
    total:       resumen?.total_count ?? 0,
    aprobadas:   resumen?.aprobadas   ?? 0,
    convertidas: resumen?.convertidas ?? 0,
    monto:       resumen?.monto       ?? 0,
  }

  const save = async () => {
    if (!form.cliente_id && !form.cliente) {
      alert('Debes seleccionar un cliente'); return
    }
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    const res = await fetch('/api/cotizaciones', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const { error } = await res.json()
      alert('Error: ' + error)
      setSaving(false); return
    }
    await mutate(); mutResumen(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar cotización?')) return
    await fetch('/api/cotizaciones', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await mutate(); mutResumen()
  }

  // El servidor ya filtra por estado (y búsqueda); acá solo mostramos lo que llegó
  const filtered = Array.isArray(items) ? items : []

  const calcTotal = (c: Cotizacion) => {
    const neto = (c.partidas ?? []).reduce((s, p) => s + p.cantidad * p.precio_unitario, 0)
    return Math.round(neto * (1 + IVA))
  }

  // ¿La cotización en el modal está bloqueada para editar?
  const esConvertida = modal === 'editar' && form.estado === 'convertida'

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <SectionTitle>Cotizaciones</SectionTitle>
          <p className="text-sm text-muted mt-1">{metricas.total} cotización{metricas.total !== 1 ? 'es' : ''} · {fmtM(metricas.monto)} en cartera</p>
        </div>
        <Btn variant="primary" onClick={() => { setForm({ ...EMPTY_COTIZACION, partidas: [] }); setModal('nuevo') }}>
          + Nueva cotización
        </Btn>
      </div>

      {apiError && (
        <div className="bg-danger-bg border border-[#f5c6c2] text-danger px-4 py-3 rounded-xl mb-4 text-[13px]">
          <strong>Error de la API:</strong> {apiError}
        </div>
      )}

      {!isLoading && clientes.length === 0 && (
        <div className="bg-brand-bg border border-[#b5d4f4] text-[#0c447c] px-4 py-3 rounded-xl mb-4 text-[13px]">
          💡 Aún no tienes clientes guardados. <Link href="/clientes" className="underline font-semibold">Crea uno aquí</Link> antes de hacer una cotización.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total cotizaciones" value={metricas.total} />
        <MetricCard label="Aprobadas"          value={metricas.aprobadas}   sub="Listas para convertir" subColor="#1a7a4a" />
        <MetricCard label="Convertidas"        value={metricas.convertidas} sub="Ya son proyecto"        subColor="#534ab7" />
        <MetricCard label="Monto en cartera"   value={fmtM(metricas.monto)} sub="Excluye rechazadas" />
      </div>

      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-6 shadow-card flex-wrap">
        {['todos', 'borrador', 'enviada', 'aprobada', 'rechazada', 'convertida'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition
              ${filtro === f ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {f === 'todos' ? 'Todas' : ESTADO_COTIZ[f]?.label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N°, cliente o proyecto…"
          className="input-base !mb-0 w-full max-w-sm" />
        {buscando && <p className="text-[11px] text-muted mt-1">Buscando en todas las cotizaciones (el filtro por estado se ignora).</p>}
      </div>

      <div className="bg-white border border-line rounded-2xl p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : filtered.length === 0
          ? <p className="text-muted text-center p-10">{buscando ? 'Sin resultados para la búsqueda.' : 'Sin cotizaciones en este filtro'}</p>
          : (
            <Table>
              <thead><tr>
                <Th>N°</Th><Th>Cliente</Th><Th>Proyecto</Th><Th>Fecha</Th><Th>Partidas</Th><Th>Total (con IVA)</Th><Th>Estado</Th><Th>Acciones</Th>
              </tr></thead>
              <tbody>
                {filtered.map(c => {
                  const cli = clientes.find(x => x.id === c.cliente_id)
                  const bloqueada = c.estado === 'convertida'
                  return (
                    <tr key={c.id}>
                      <Td><span className="font-mono font-bold text-brand text-[12px]">{c.numero || '—'}</span></Td>
                      <Td>
                        <div className="font-semibold">{c.cliente}</div>
                        {cli?.rut && <div className="text-[11px] text-muted font-mono">{cli.rut}</div>}
                      </Td>
                      <Td style={{ color: '#6b7a8d' }}>{c.proyecto_nombre || '—'}</Td>
                      <Td style={{ color: '#6b7a8d' }}>{c.fecha || '—'}</Td>
                      <Td style={{ textAlign: 'center', color: '#6b7a8d' }}>{c.partidas?.length ?? 0}</Td>
                      <Td style={{ fontWeight: 700 }}>{fmt(calcTotal(c))}</Td>
                      <Td><BadgeCotiz estado={c.estado} /></Td>
                      <Td>
                        <div className="flex gap-1 flex-nowrap">
                          <DescargarPDFBtn cotizacion={c} />
                          <ConvertirBtn cotizacion={c} onSuccess={mutate} />
                          <Btn
                            onClick={() => { setForm({ ...c, partidas: c.partidas ?? [] }); setModal(bloqueada ? 'ver' : 'editar') }}
                            style={{ fontSize: 11, padding: '4px 8px' }}>
                            {bloqueada ? 'Ver' : 'Editar'}
                          </Btn>
                          {!bloqueada && (
                            <Btn variant="danger" onClick={() => del(c.id)} style={{ fontSize: 11, padding: '4px 8px' }}>✕</Btn>
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        {!buscando && !isLoading && filtered.length >= limite && (
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
        <Modal wide
          title={modal === 'nuevo' ? 'Nueva cotización' : modal === 'ver' ? 'Cotización convertida (solo lectura)' : 'Editar cotización'}
          onClose={() => setModal(null)}
        >
          {/* AVISO si está convertida */}
          {esConvertida || modal === 'ver' ? (
            <div className="bg-accent-bg border border-[#ccc5fc] text-accent px-3.5 py-2.5 rounded-lg mb-4 text-[13px]">
              🔒 Esta cotización ya fue convertida a proyecto. No se puede editar para mantener la trazabilidad.
              {form.proyecto_id && (
                <>
                  {' '}
                  <Link href="/proyectos" className="text-accent underline font-bold">
                    Ver el proyecto creado
                  </Link>
                </>
              )}
            </div>
          ) : null}

          <fieldset
            disabled={modal === 'ver'}
            className={`border-none p-0 m-0 ${modal === 'ver' ? 'opacity-85' : 'opacity-100'}`}
          >
            <div className="grid grid-cols-2 gap-3">
              <FormInput label="N° cotización" value={form.numero || ''} onChange={v => upd('numero', v)} placeholder="Ej: COT-2026-015" />

              <div>
                <label className="block text-[12px] font-semibold text-muted mb-1">
                  Cliente *
                </label>
                <select
                  value={form.cliente_id || ''}
                  onChange={e => handleClienteChange(e.target.value)}
                  disabled={modal === 'ver'}
                  className="w-full px-[11px] py-2 border border-[#d1d9e6] rounded-[7px] text-[13px] bg-[#fafbfc] outline-none"
                >
                  <option value="">— Selecciona un cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.razon_social}{c.rut ? ` · ${c.rut}` : ''}
                    </option>
                  ))}
                </select>
                {modal !== 'ver' && (
                  <div className="mt-1">
                    <Link href="/clientes" target="_blank" className="text-[11px] text-brand underline">
                      + Crear cliente nuevo (en otra pestaña)
                    </Link>
                  </div>
                )}
              </div>

              <FormInput label="Proyecto"        value={form.proyecto_nombre || ''}  onChange={v => upd('proyecto_nombre', v)} />
              <FormInput label="Fecha"           value={form.fecha || ''}            onChange={v => upd('fecha', v)} type="date" />
              <FormInput label="Validez (días)"  value={form.validez_dias ?? 30}     onChange={v => upd('validez_dias', v)} type="number" />
              <FormSelect label="Estado"         value={form.estado || 'borrador'}   onChange={v => upd('estado', v)}
                options={[
                  { value: 'borrador',   label: 'Borrador' },
                  { value: 'enviada',    label: 'Enviada' },
                  { value: 'aprobada',   label: 'Aprobada' },
                  { value: 'rechazada',  label: 'Rechazada' },
                  { value: 'convertida', label: 'Convertida' },
                ]} />
              <div className="col-span-full">
                <FormInput label="Descripción general (aparece como intro en el PDF)" value={form.descripcion || ''} onChange={v => upd('descripcion', v)} placeholder="Junto con saludar, envío la siguiente cotización por..." />
              </div>
            </div>

            <div className="mt-5 mb-2.5 flex justify-between items-center">
              <div className="text-[14px] font-bold text-[#1a2535]">Partidas ({form.partidas?.length ?? 0})</div>
              {modal !== 'ver' && (
                <div className="flex gap-1.5">
                  <Btn onClick={openImport} style={{ fontSize: 12, padding: '5px 12px', background: '#eeedfe', borderColor: '#ccc5fc', color: '#534ab7', fontWeight: 700 }}>📋 Importar del catálogo</Btn>
                  <Btn variant="primary" onClick={addPartida} style={{ fontSize: 12, padding: '5px 12px' }}>+ Agregar partida</Btn>
                </div>
              )}
            </div>

            {form.partidas?.length === 0 && (
              <div className="bg-[#f8fafc] border border-dashed border-[#d1d9e6] rounded-lg p-7 text-center text-[12px] text-muted">
                Sin partidas aún.
              </div>
            )}

            {form.partidas?.map((p: any, idx: number) => {
              const subtotal = (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0)
              return (
                <div key={p.id || idx} className="bg-[#fafbfc] border border-[#e4e9f0] rounded-lg p-3.5 mb-2.5">
                  <div className="flex justify-between items-center mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[11px] font-bold text-brand bg-[#e8f1fb] px-2 py-[2px] rounded">
                        PARTIDA {idx + 1}
                      </div>
                      {p.catalogo_id && (
                        <span
                          className="text-[10px] font-semibold text-accent bg-accent-bg px-2 py-[2px] rounded"
                          title="Esta partida traerá sus sub-partidas del catálogo al convertir a proyecto"
                        >
                          📋 con desglose
                        </span>
                      )}
                    </div>
                    {modal !== 'ver' && (
                      <button
                        onClick={() => delPartida(idx)}
                        title="Eliminar partida"
                        className="bg-transparent border-none text-danger cursor-pointer text-[13px] p-1 font-semibold"
                      >
                        ✕ Eliminar
                      </button>
                    )}
                  </div>
                  <div className="mb-2.5">
                    <label className={lblClass}>Descripción</label>
                    <input value={p.descripcion}
                      onChange={e => updPartida(idx, 'descripcion', e.target.value)}
                      className={inputClass} />
                  </div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: '1.2fr 1fr 1.3fr 1.2fr' }}>
                    <div>
                      <label className={lblClass}>Unidad</label>
                      <select value={p.unidad} onChange={e => updPartida(idx, 'unidad', e.target.value)} className={inputClass}>
                        {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lblClass}>Cantidad</label>
                      <input type="number" step="0.01" value={p.cantidad}
                        onChange={e => updPartida(idx, 'cantidad', e.target.value)}
                        className={`${inputClass} text-right`} />
                    </div>
                    <div>
                      <label className={lblClass}>Precio unitario</label>
                      <input type="number" value={p.precio_unitario}
                        onChange={e => updPartida(idx, 'precio_unitario', e.target.value)}
                        className={`${inputClass} text-right`} />
                    </div>
                    <div>
                      <label className={lblClass}>Subtotal</label>
                      <div className="px-2.5 py-2 bg-white border border-[#d1d9e6] rounded-[6px] text-[13px] font-bold text-right text-[#1a2535]">
                        {fmt(subtotal)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {form.partidas?.length > 0 && (
              <div className="mt-3.5 p-4 bg-canvas rounded-[10px]">
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-muted">Neto</span>
                  <span className="font-semibold">{fmt(totales.neto)}</span>
                </div>
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="text-muted">IVA (19%)</span>
                  <span className="font-semibold">{fmt(totales.iva)}</span>
                </div>
                <div className="flex justify-between text-[17px] pt-2 border-t border-[#d1d9e6]">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-brand">{fmt(totales.total)}</span>
                </div>
              </div>
            )}

            <div className="mt-3.5">
              <FormInput label="Notas / términos (opcional, aparecen al pie del PDF)" value={form.notas || ''} onChange={v => upd('notas', v)} />
            </div>
          </fieldset>

          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setModal(null)}>{modal === 'ver' ? 'Cerrar' : 'Cancelar'}</Btn>
            {modal !== 'ver' && (
              <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
            )}
          </div>
        </Modal>
      )}

      {/* ═══════ MODAL IMPORTAR DEL CATÁLOGO ═══════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/45 z-[200] flex items-center justify-center p-5">
          <div className="bg-white rounded-[14px] p-7 max-w-[640px] w-full shadow-[0_8px_32px_rgba(0,0,0,0.18)] max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[16px] font-bold text-[#1a2535] m-0">Importar partidas del catálogo</h3>
              <button onClick={() => setShowImport(false)} className="bg-transparent border-none text-[22px] cursor-pointer text-muted leading-none">×</button>
            </div>

            {catLoading
              ? <p className="text-muted text-center p-5">Cargando catálogo...</p>
              : catalogoPadres.length === 0
              ? <div className="text-center p-5">
                  <p className="text-[13px] text-muted mb-2.5">Tu catálogo está vacío.</p>
                  <p className="text-[12px] text-muted">Ve a <strong>Admin → Catálogo de partidas</strong> para crear tus partidas tipo.</p>
                </div>
              : (
                <>
                  <p className="text-[12px] text-muted mb-3.5">
                    Selecciona las partidas a agregar a la cotización. Se importa el título con su precio de referencia (editable después).
                  </p>
                  <div className="max-h-[380px] overflow-y-auto flex flex-col gap-1.5">
                    {catalogoPadres.map(cp => {
                      const isSel = selected.has(cp.id)
                      return (
                        <div
                          key={cp.id}
                          onClick={() => toggleSelect(cp.id)}
                          className={`flex items-center gap-3 px-3.5 py-2.5 border-[1.5px] rounded-lg cursor-pointer ${isSel ? 'border-brand bg-[#e8f1fb]' : 'border-[#e4e9f0] bg-white'}`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 text-white text-[12px] font-bold ${isSel ? 'border-brand bg-brand' : 'border-[#d1d9e6] bg-white'}`}>
                            {isSel ? '✓' : ''}
                          </div>
                          <div className="flex-1">
                            <div className="text-[13px] font-bold text-[#1a2535]">{cp.descripcion}</div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {cp.unidad}{cp.precio_unitario_ref > 0 ? ` · ${fmt(cp.precio_unitario_ref)}` : ''}
                              {cp.children.length > 0 && ` · ${cp.children.length} sub-partidas`}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 justify-between items-center mt-4">
                    <span className="text-[12px] text-muted">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                    <div className="flex gap-2">
                      <Btn onClick={() => setShowImport(false)}>Cancelar</Btn>
                      <Btn variant="primary" onClick={importarSeleccion} disabled={selected.size === 0}>
                        Importar {selected.size > 0 ? selected.size : ''}
                      </Btn>
                    </div>
                  </div>
                </>
              )}
          </div>
        </div>
      )}
    </div>
  )
}

const inputClass = 'w-full px-2.5 py-2 border border-[#d1d9e6] rounded-[6px] text-[13px] bg-white text-[#1a2535] outline-none box-border'

const lblClass = 'block text-[11px] font-semibold text-muted mb-1 uppercase tracking-[0.3px]'
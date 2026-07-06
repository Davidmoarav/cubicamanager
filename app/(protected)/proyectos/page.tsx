'use client'
// app/(protected)/proyectos/page.tsx — v4 Tailwind moderno

import { useState, useEffect, useCallback } from 'react'
import { Btn, FormInput, FormSelect, Modal, SectionTitle, fmtM } from '@/components/ui'
import type { Proyecto } from '@/types'
import DocumentosPanel from '@/components/DocumentosPanel'
import PartidasPanel from '@/components/PartidasPanel'
import PresupuestoPanel from '@/components/PresupuestoPanel'
import ManoObraPanel from '@/components/ManoObraPanel'
import InformePanel from '@/components/InformePanel'

const EMPTY: Omit<Proyecto, 'id'|'created_at'|'user_id'> = { nombre:'', cliente:'', descripcion:'', valor:0, avance:0, estado:'cotizacion', inicio:'', fin:'' }

const META: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  activo:     { label: 'En curso',      dot: 'bg-brand',   chip: 'text-brand bg-brand-bg',     bar: 'from-brand/70 to-brand' },
  terminado:  { label: 'Terminado',     dot: 'bg-success', chip: 'text-success bg-success-bg', bar: 'from-success/70 to-success' },
  cotizacion: { label: 'En cotización', dot: 'bg-warning', chip: 'text-warning bg-warning-bg', bar: 'from-warning/70 to-warning' },
}

export default function ProyectosPage() {
  const [items, setItems]     = useState<Proyecto[]>([])
  const [modal, setModal]     = useState<'nuevo'|'editar'|null>(null)
  const [gestion, setGestion] = useState<Proyecto | null>(null)
  const [tab, setTab]         = useState<'obra' | 'presupuesto' | 'mano_obra' | 'informe' | 'docs'>('obra')
  const [form, setForm]       = useState<any>({})
  const [filtro, setFiltro]   = useState('todos')
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis]       = useState<Record<string, any>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [res, kpiRes] = await Promise.all([
      fetch('/api/proyectos').then(r => r.json()),
      fetch('/api/informe').then(r => r.json()).catch(() => []),
    ])
    setItems(Array.isArray(res) ? res : [])
    const map: Record<string, any> = {}
    if (Array.isArray(kpiRes)) kpiRes.forEach((k: any) => { map[k.proyecto_id] = k })
    setKpis(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const openNew = () => { setForm({ ...EMPTY }); setModal('nuevo') }
  const openEdit = (p: Proyecto) => { setForm({ ...p }); setModal('editar') }
  const openGestion = (p: Proyecto) => { setGestion(p); setTab('obra') }

  const save = async () => {
    if (!form.nombre || !form.cliente) return
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    await fetch('/api/proyectos', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ...form,
      valor: Number(form.valor), avance: Number(form.avance),
      utilidad_pct: Number((form as any).utilidad_pct) || 0,
      gg_pct: Number((form as any).gg_pct) || 0,
      anticipo_pct: Number((form as any).anticipo_pct) || 0,
      retencion_pct: Number((form as any).retencion_pct) || 0,
    }) })
    await load(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto y todos sus datos?')) return
    await fetch('/api/proyectos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const filtered = filtro === 'todos' ? items : items.filter(i => i.estado === filtro)
  const ESTADOS = [
    { value: 'cotizacion', label: 'En cotización' },
    { value: 'activo',     label: 'En curso' },
    { value: 'terminado',  label: 'Terminado' },
  ]

  const cuenta = (k: string) => items.filter(i => i.estado === k).length

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <SectionTitle>Proyectos</SectionTitle>
          <p className="text-sm text-muted mt-1">{items.length} proyecto{items.length !== 1 ? 's' : ''} en total</p>
        </div>
        <Btn variant="primary" onClick={openNew}>+ Nuevo proyecto</Btn>
      </div>

      {/* Filtros tipo segmented */}
      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-6 shadow-card">
        {[
          { k: 'todos', label: 'Todos', n: items.length },
          { k: 'activo', label: 'En curso', n: cuenta('activo') },
          { k: 'terminado', label: 'Terminado', n: cuenta('terminado') },
          { k: 'cotizacion', label: 'En cotización', n: cuenta('cotizacion') },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition flex items-center gap-1.5
              ${filtro === f.k ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {f.label}
            <span className={`text-[11px] px-1.5 rounded-full ${filtro === f.k ? 'bg-white/25' : 'bg-line'}`}>{f.n}</span>
          </button>
        ))}
      </div>

      {loading
        ? <div className="flex items-center justify-center py-20 text-muted">Cargando proyectos…</div>
        : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(p => {
            const m = META[p.estado] || META.cotizacion
            return (
              <div key={p.id}
                className="group bg-white border border-line rounded-2xl p-5 shadow-card hover:shadow-pop hover:-translate-y-0.5 transition-all duration-200">
                {/* Estado chip */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${m.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                    {m.label}
                  </span>
                  <span className="text-[11px] text-subtle">{p.fin ? `Vence ${p.fin}` : ''}</span>
                </div>

                {/* Título */}
                <h3 className="text-[15px] font-bold text-ink leading-snug mb-1">{p.nombre}</h3>
                <p className="text-[13px] text-muted mb-4">{p.cliente}</p>

                {/* Avance */}
                {p.estado !== 'cotizacion' && (
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-muted mb-1.5">
                      <span>Avance</span>
                      <span className="font-bold text-ink">{p.avance}%</span>
                    </div>
                    <div className="h-2 bg-[#eef2f7] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${m.bar} transition-all duration-500`} style={{ width: `${p.avance}%` }} />
                    </div>
                  </div>
                )}

                {/* Valor */}
                <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-line">
                  <span className="text-xl font-extrabold text-ink tabular-nums">{fmtM(p.valor)}</span>
                  <span className="text-[11px] text-subtle">valor contrato</span>
                </div>

                {/* Resumen KPI (informe ejecutivo) */}
                {kpis[p.id] && (kpis[p.id].cobrado_pct > 0 || kpis[p.id].gasto_mo_pendiente > 0) && (
                  <div className="grid grid-cols-3 gap-2 mb-4 pb-4 border-b border-line">
                    <div>
                      <div className="text-[10px] text-muted">Cobrado</div>
                      <div className="text-[13px] font-bold text-success">{kpis[p.id].cobrado_pct}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">Por facturar</div>
                      <div className="text-[13px] font-bold text-brand">{fmtM(kpis[p.id].saldo_por_facturar)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">M.O pendiente</div>
                      <div className="text-[13px] font-bold text-danger">{fmtM(kpis[p.id].gasto_mo_pendiente)}</div>
                    </div>
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-2">
                  <button onClick={() => openGestion(p)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold text-brand bg-brand-bg hover:bg-brand hover:text-white transition">
                    🏗 Gestionar
                  </button>
                  <button onClick={() => openEdit(p)}
                    className="px-3 py-2 rounded-lg text-[13px] font-semibold text-muted bg-canvas border border-line hover:bg-line transition">
                    Editar
                  </button>
                  <button onClick={() => del(p.id)}
                    className="px-3 py-2 rounded-lg text-[13px] font-semibold text-danger bg-danger-bg hover:bg-[#fbdbd7] transition">
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          {/* Tarjeta nueva */}
          <button onClick={openNew}
            className="border-2 border-dashed border-line2 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-muted hover:border-brand hover:text-brand hover:bg-brand-bg/40 transition min-h-[210px] cursor-pointer">
            <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-2xl">+</div>
            <div className="text-[13px] font-semibold">Nuevo proyecto</div>
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">🏗</div>
          <p className="text-sm">No hay proyectos en este filtro.</p>
        </div>
      )}

      {/* ── MODAL EDITAR/NUEVO ── */}
      {modal && (
        <Modal title={modal === 'nuevo' ? 'Nuevo proyecto' : 'Editar proyecto'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><FormInput label="Nombre del proyecto" value={form.nombre || ''} onChange={v => upd('nombre', v)} required /></div>
            <FormInput label="Cliente"      value={form.cliente || ''}          onChange={v => upd('cliente', v)} />
            <FormInput label="Valor (CLP)"  value={form.valor || ''}            onChange={v => upd('valor', v)}   type="number" />
            <FormInput label="Fecha inicio" value={form.inicio || ''}           onChange={v => upd('inicio', v)}  type="date" />
            <FormInput label="Fecha fin"    value={form.fin || ''}              onChange={v => upd('fin', v)}     type="date" />
            <FormSelect label="Estado"      value={form.estado || 'cotizacion'} onChange={v => upd('estado', v)} options={ESTADOS} />
            <FormInput label="Avance %"     value={form.avance ?? 0}            onChange={v => upd('avance', v)}  type="number" />
            <div className="col-span-2"><FormInput label="Descripción" value={form.descripcion || ''} onChange={v => upd('descripcion', v)} /></div>

            {/* Parámetros de estados de pago */}
            <div className="col-span-2 mt-1 mb-0.5 text-[11px] font-bold text-muted uppercase tracking-wide">Parámetros de estados de pago</div>
            <FormInput label="Utilidad %"        value={(form as any).utilidad_pct ?? 0}  onChange={v => upd('utilidad_pct' as any, v)}  type="number" />
            <FormInput label="Gastos Generales %" value={(form as any).gg_pct ?? 0}        onChange={v => upd('gg_pct' as any, v)}        type="number" />
            <FormInput label="Anticipo carátula %" value={(form as any).anticipo_pct ?? 0} onChange={v => upd('anticipo_pct' as any, v)}  type="number" />
            <FormInput label="Retención %"        value={(form as any).retencion_pct ?? 0} onChange={v => upd('retencion_pct' as any, v)} type="number" />
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}

      {/* ── MODAL GESTIÓN DE OBRA (3 tabs) ── */}
      {gestion && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-5" onClick={() => { setGestion(null); load() }}>
          <div className="bg-white rounded-2xl p-4 sm:p-7 max-w-[860px] w-full shadow-pop max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-ink m-0 flex items-center gap-2">🏗 {gestion.nombre}</h3>
              <button onClick={() => { setGestion(null); load() }} className="text-2xl text-muted hover:text-ink leading-none transition">×</button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-canvas rounded-xl overflow-x-auto no-scrollbar">
              {[
                { key: 'obra' as const,        label: '📋 Control de obra' },
                { key: 'presupuesto' as const, label: '💵 Presupuesto y pagos' },
                { key: 'mano_obra' as const,   label: '👷 Mano de obra' },
                { key: 'informe' as const,     label: '📊 Informe ejecutivo' },
                { key: 'docs' as const,        label: '📎 Documentos' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`shrink-0 lg:flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-[13px] font-semibold transition
                    ${tab === t.key ? 'bg-white text-brand shadow-card' : 'text-muted hover:text-ink'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'obra'        && <PartidasPanel proyectoId={gestion.id} markupGlobal={(gestion as any).markup_global ?? 20} onAvanceChange={load} />}
            {tab === 'presupuesto' && <PresupuestoPanel proyectoId={gestion.id} valorContrato={gestion.valor} proyectoNombre={gestion.nombre} proyectoCliente={gestion.cliente} proyectoDireccion={(gestion as any).direccion} />}
            {tab === 'mano_obra'   && <ManoObraPanel proyectoId={gestion.id} proyectoNombre={gestion.nombre} />}
            {tab === 'informe'     && <InformePanel proyectoId={gestion.id} proyectoNombre={gestion.nombre} />}
            {tab === 'docs'        && <DocumentosPanel proyectoId={gestion.id} proyectoNombre={gestion.nombre} />}
          </div>
        </div>
      )}
    </div>
  )
}
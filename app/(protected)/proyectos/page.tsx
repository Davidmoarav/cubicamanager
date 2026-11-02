'use client'
// app/(protected)/proyectos/page.tsx — v4 Tailwind moderno

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { fetcher } from '@/lib/fetcher'
import { usePermisos } from '@/lib/usePermisos'
import { Btn, FormInput, FormSelect, Modal, SectionTitle, fmt } from '@/components/ui'
import type { Proyecto } from '@/types'
import { fmtFecha } from '@/lib/format'
import Link from 'next/link'

const OTRO_CLIENTE = '__otro__'

const EMPTY: Omit<Proyecto, 'id'|'created_at'|'user_id'> = { nombre:'', cliente:'', descripcion:'', valor:0, avance:0, estado:'cotizacion', inicio:'', fin:'' }

const META: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  activo:     { label: 'En curso',      dot: 'bg-brand',   chip: 'text-brand bg-brand-bg',     bar: 'from-brand/70 to-brand' },
  terminado:  { label: 'Terminado',     dot: 'bg-success', chip: 'text-success bg-success-bg', bar: 'from-success/70 to-success' },
  cotizacion: { label: 'En cotización', dot: 'bg-warning', chip: 'text-warning bg-warning-bg', bar: 'from-warning/70 to-warning' },
}

export default function ProyectosPage() {
  const { data: items = [], isLoading, mutate } = useSWR<Proyecto[]>('/api/proyectos', fetcher)
  const [modal, setModal]     = useState<'nuevo'|'editar'|null>(null)
  const router = useRouter()
  const [form, setForm]       = useState<any>({})
  const [filtro, setFiltro]   = useState('todos')
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState('')
  const [borrando, setBorrando] = useState<Proyecto | null>(null)
  const [confirmacion, setConfirmacion] = useState('')
  const { data: kpiRes = [], mutate: mutateKpis } = useSWR<any[]>('/api/informe', fetcher)
  const { data: clientes = [] } = useSWR<any[]>('/api/clientes', fetcher)
  const kpis = useMemo(() => {
    const map: Record<string, any> = {}
    if (Array.isArray(kpiRes)) kpiRes.forEach((k: any) => { map[k.proyecto_id] = k })
    return map
  }, [kpiRes])

  const refresh = () => { mutate(); mutateKpis() }


  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const elegirCliente = (v: string) => {
    if (v === OTRO_CLIENTE) { setForm((f: any) => ({ ...f, cliente_id: null, cliente: '', _clienteOtro: true })); return }
    const c = (Array.isArray(clientes) ? clientes : []).find((x: any) => x.id === v) as any
    setForm((f: any) => ({ ...f, cliente_id: c?.id ?? null, cliente: c?.razon_social ?? '', _clienteOtro: false }))
  }

  const { puedeEditar, soloLectura } = usePermisos('obra')

  const openNew = () => { setForm({ ...EMPTY }); setFormError(''); setModal('nuevo') }
  const openEdit = (p: Proyecto) => { setForm({ ...p }); setFormError(''); setModal('editar') }
  const openGestion = (p: Proyecto) => router.push(`/obra/${p.id}`)

  const save = async () => {
    if (!form.nombre || !form.cliente) {
      setFormError('Completa el nombre de la obra y el cliente.')
      return
    }
    setFormError('')
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    try {
      const res = await fetch('/api/proyectos', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...form,
        valor: Number(form.valor), avance: Number(form.avance),
        utilidad_pct: Number((form as any).utilidad_pct) || 0,
        gg_pct: Number((form as any).gg_pct) || 0,
        anticipo_pct: Number((form as any).anticipo_pct) || 0,
        anticipo: Number((form as any).anticipo) || 0,
        moneda: (form as any).moneda || 'peso',
        valor_uf: Number((form as any).valor_uf) || 0,
        retencion_pct: Number((form as any).retencion_pct) || 0,
      }) })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setFormError(data?.error || 'No se pudo guardar la obra.')
        setSaving(false)
        return
      }
      await mutate()
      setSaving(false)
      setModal(null)
    } catch {
      setFormError('Error de conexion al guardar. Revisa tu internet e intentalo de nuevo.')
      setSaving(false)
    }
  }

  const del = async () => {
    if (!borrando) return
    await fetch('/api/proyectos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: borrando.id }) })
    setBorrando(null)
    await mutate()
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
          <SectionTitle>Obras</SectionTitle>
          <p className="text-sm text-muted mt-1">{items.length} {items.length === 1 ? 'obra' : 'obras'} en total</p>
        </div>
        {puedeEditar && (
          <div className="flex gap-2 flex-wrap justify-end">
            <Link href="/obra" className="px-3.5 py-2 rounded-lg border border-line bg-white text-[13px] font-semibold text-ink hover:bg-canvas transition">Crear con Copiloto</Link>
            <Btn variant="primary" onClick={openNew}>+ Nueva obra</Btn>
          </div>
        )}
      </div>

      {soloLectura && (
        <div className="bg-[#fff8e6] border border-[#f0dca8] text-[#8a6314] text-[12px] px-4 py-2.5 rounded-lg mb-5">
          <strong>Solo lectura.</strong> Puedes consultar las obras y sus datos para contabilizar, pero no modificarlas.
        </div>
      )}

      {/* Filtros tipo segmented */}
      <div className="inline-flex max-w-full overflow-x-auto gap-1 p-1 bg-white border border-line rounded-xl mb-6 shadow-card">
        {[
          { k: 'todos', label: 'Todos', n: items.length },
          { k: 'activo', label: 'En curso', n: cuenta('activo') },
          { k: 'terminado', label: 'Terminado', n: cuenta('terminado') },
          { k: 'cotizacion', label: 'En cotización', n: cuenta('cotizacion') },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0
              ${filtro === f.k ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {f.label}
            <span className={`text-[11px] px-1.5 rounded-full ${filtro === f.k ? 'bg-white/25' : 'bg-line'}`}>{f.n}</span>
          </button>
        ))}
      </div>

      {isLoading
        ? <div className="flex items-center justify-center py-20 text-muted">Cargando obras…</div>
        : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(p => {
            const m = META[p.estado] || META.cotizacion
            return (
              <div key={p.id}
                className="group bg-white border border-line rounded-card p-5 shadow-card hover:shadow-pop hover:-translate-y-0.5 transition-all duration-200">
                {/* Estado chip */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${m.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                    {m.label}
                  </span>
                  <span className="text-[11px] text-subtle">{p.fin ? `Vence ${fmtFecha(p.fin)}` : ''}</span>
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
                    <div className="h-2 bg-[#F1ECE6] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${m.bar} transition-all duration-500`} style={{ width: `${p.avance}%` }} />
                    </div>
                  </div>
                )}

                {/* Valor */}
                <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-line">
                  <span className="text-xl font-extrabold text-ink tabular-nums">
                    {(p as any).moneda === 'uf' ? `${(p.valor || 0).toLocaleString('es-CL')} UF` : fmt(p.valor)}
                  </span>
                  <span className="text-[11px] text-subtle">valor contrato{(p as any).moneda === 'uf' ? ' (UF)' : ''}</span>
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
                      <div className="text-[11px] sm:text-[13px] font-bold text-brand [overflow-wrap:anywhere]">{fmt(kpis[p.id].saldo_por_facturar)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">Mano de obra por pagar</div>
                      <div className="text-[13px] font-bold text-danger [overflow-wrap:anywhere]">{fmt(kpis[p.id].gasto_mo_pendiente)}</div>
                    </div>
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-2">
                  <button onClick={() => openGestion(p)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold text-brand bg-brand-bg hover:bg-brand hover:text-white transition">
                    Abrir
                  </button>
                  {puedeEditar && (
                    <>
                      <button onClick={() => openEdit(p)}
                        className="px-3 py-2 rounded-lg text-[13px] font-semibold text-muted bg-canvas border border-line hover:bg-line transition">
                        Editar
                      </button>
                      <button onClick={() => { setConfirmacion(''); setBorrando(p) }} aria-label={`Eliminar ${p.nombre}`}
                        className="px-3 py-2 rounded-lg text-[13px] font-semibold text-danger bg-danger-bg hover:bg-[#fbdbd7] transition">
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* Tarjeta nueva */}
          {puedeEditar && <button onClick={openNew}
            className="border-2 border-dashed border-line2 rounded-card p-5 flex flex-col items-center justify-center gap-2 text-muted hover:border-brand hover:text-brand hover:bg-brand-bg/40 transition min-h-[210px] cursor-pointer">
            <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-2xl">+</div>
            <div className="text-[13px] font-semibold">Nueva obra</div>
          </button>}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3"></div>
          <p className="text-sm">No hay obras en este filtro.</p>
        </div>
      )}

      {borrando && (
        <Modal title="Eliminar obra" onClose={() => setBorrando(null)}>
          <p className="text-[13px] text-ink mb-3">
            Se eliminará <strong>{borrando.nombre}</strong> con todos sus datos: partidas, gastos, estados de pago, parte diario y documentos. No se puede deshacer.
          </p>
          <FormInput label="Escribe el nombre de la obra para confirmar" value={confirmacion} onChange={setConfirmacion} />
          <div className="flex gap-2 justify-end mt-3">
            <Btn onClick={() => setBorrando(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={del} disabled={confirmacion.trim() !== (borrando.nombre ?? '').trim()}>Eliminar obra</Btn>
          </div>
        </Modal>
      )}

      {/* ── MODAL EDITAR/NUEVO ── */}
      {modal && (
        <Modal title={modal === 'nuevo' ? 'Nueva obra' : 'Editar obra'} onClose={() => { setFormError(''); setModal(null) }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><FormInput label="Nombre de la obra *" value={form.nombre || ''} onChange={v => upd('nombre', v)} required /></div>
            <FormSelect label="Cliente *" value={form.cliente_id || (form._clienteOtro || form.cliente ? OTRO_CLIENTE : '')} onChange={elegirCliente}
              options={[
                { value: '', label: '— Selecciona un cliente —' },
                ...(Array.isArray(clientes) ? clientes : []).map((c: any) => ({ value: c.id, label: c.razon_social })),
                { value: OTRO_CLIENTE, label: 'Otro (escribir el nombre)' },
              ]} />
            <FormSelect label="Moneda del contrato" value={(form as any).moneda || 'peso'} onChange={v => upd('moneda' as any, v)}
              options={[{ value: 'peso', label: 'Pesos (CLP)' }, { value: 'uf', label: 'UF' }]} />
            {!form.cliente_id && (form._clienteOtro || form.cliente) && (
              <div className="col-span-2"><FormInput label="Nombre del cliente *" value={form.cliente || ''} onChange={v => upd('cliente', v)} required /></div>
            )}
            <FormInput label={(form as any).moneda === 'uf' ? 'Valor contrato (UF)' : 'Valor (CLP)'}
              value={form.valor || ''} onChange={v => upd('valor', v)} type="number" />
            {(form as any).moneda === 'uf' && (
              <div className="col-span-2 bg-[#fff8e6] border border-[#f0dca8] rounded-lg px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-[#8a6314] block mb-1">Valor de la UF (en pesos)</label>
                  <input type="number" value={(form as any).valor_uf || ''}
                    onChange={e => upd('valor_uf' as any, e.target.value === '' ? 0 : Number(e.target.value))}
                    className="input-base !mb-0" placeholder="Ej: 39000" />
                </div>
                <div className="text-[11px] text-[#8a6314] max-w-[190px]">
                  Se usa para medir rentabilidad (contrato en UF vs costos en pesos). Actualízalo cuando quieras.
                </div>
              </div>
            )}
            <FormInput label="Fecha inicio" value={form.inicio || ''}           onChange={v => upd('inicio', v)}  type="date" />
            <FormInput label="Fecha fin"    value={form.fin || ''}              onChange={v => upd('fin', v)}     type="date" />
            <FormSelect label="Estado"      value={form.estado || 'cotizacion'} onChange={v => upd('estado', v)} options={ESTADOS} />
            {modal === 'editar' && <FormInput label="Avance % (se recalcula desde las partidas)" value={form.avance ?? 0} onChange={v => upd('avance', v)} type="number" />}
            <div className="col-span-2"><FormInput label="Descripción" value={form.descripcion || ''} onChange={v => upd('descripcion', v)} /></div>

            {/* Parámetros de estados de pago */}
            <details className="col-span-2 mt-1">
              <summary className="text-[12.5px] font-semibold text-brand cursor-pointer mb-2">Condiciones de cobro (opcional): utilidad, gastos generales, anticipo y retención</summary>
              <div className="grid grid-cols-2 gap-3">
            <FormInput label="Utilidad %"        value={(form as any).utilidad_pct ?? 0}  onChange={v => upd('utilidad_pct' as any, v)}  type="number" />
            <FormInput label="Gastos Generales %" value={(form as any).gg_pct ?? 0}        onChange={v => upd('gg_pct' as any, v)}        type="number" />
            <FormInput label="Anticipo carátula %" value={(form as any).anticipo_pct ?? 0} onChange={v => upd('anticipo_pct' as any, v)}  type="number" />
            <FormInput label="Anticipo recibido ($)" value={(form as any).anticipo ?? 0} onChange={v => upd('anticipo' as any, v)} type="number" />
            <FormInput label="Retención %"        value={(form as any).retencion_pct ?? 0} onChange={v => upd('retencion_pct' as any, v)} type="number" />
              </div>
            </details>
          </div>
          {formError && <p className="text-[12.5px] text-danger font-semibold mt-3">{formError}</p>}
          <div className="flex gap-2 justify-end mt-3">
            <Btn onClick={() => { setFormError(''); setModal(null) }}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
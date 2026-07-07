'use client'
// app/(protected)/catalogo-partidas/page.tsx

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, Modal, SectionTitle, MetricCard } from '@/components/ui'
import { fmt } from '@/lib/format'
import { UNIDADES } from '@/types/cotizaciones'
import type { CatalogoPartida } from '@/types/catalogo-partida'

export default function CatalogoPartidasPage() {
  const { data: allItems = [], isLoading, mutate } = useSWR<CatalogoPartida[]>('/api/catalogo-partidas', fetcher)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modal, setModal]       = useState<{ type: 'padre' | 'hijo' | 'editar'; parentId?: string } | null>(null)
  const [form, setForm]         = useState<any>({})
  const [saving, setSaving]     = useState(false)


  const padres = useMemo(() => {
    const ps = allItems.filter(p => !p.parent_id).sort((a, b) => a.orden - b.orden)
    return ps.map(padre => ({
      ...padre,
      children: allItems.filter(h => h.parent_id === padre.id).sort((a, b) => a.orden - b.orden),
    }))
  }, [allItems])

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const toggle = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const save = async () => {
    if (!form.descripcion) { alert('La descripción es obligatoria'); return }
    setSaving(true)
    const method = modal?.type === 'editar' ? 'PUT' : 'POST'
    const body = {
      ...form,
      parent_id: modal?.type === 'hijo' ? modal.parentId : (form.parent_id || null),
    }
    await fetch('/api/catalogo-partidas', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await mutate()
    setSaving(false)
    setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta partida del catálogo y todas sus sub-partidas?')) return
    await fetch('/api/catalogo-partidas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await mutate()
  }

  const openNewPadre = () => {
    setForm({ descripcion: '', unidad: 'gl', precio_unitario_ref: 0, orden: padres.length })
    setModal({ type: 'padre' })
  }
  const openNewHijo = (parentId: string, childCount: number) => {
    setForm({ descripcion: '', unidad: 'gl', precio_unitario_ref: 0, orden: childCount })
    setModal({ type: 'hijo', parentId })
  }
  const openEdit = (p: CatalogoPartida) => {
    setForm({ ...p })
    setModal({ type: 'editar' })
  }

  const totalPadres = padres.length
  const totalHijos  = allItems.filter(i => i.parent_id).length

  return (
    <div className="max-w-[860px]">
      <div className="flex justify-between items-center mb-6">
        <SectionTitle>Catálogo de partidas</SectionTitle>
        <Btn variant="primary" onClick={openNewPadre}>+ Nueva partida</Btn>
      </div>

      <p className="text-[13px] text-muted mb-5">
        Define tus partidas tipo con sus sub-partidas. Al crear una cotización o proyecto, podrás importarlas directamente sin volver a escribirlas.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Partidas principales" value={totalPadres} />
        <MetricCard label="Sub-partidas"         value={totalHijos} />
        <MetricCard label="Total ítems"          value={allItems.length} />
      </div>

      {isLoading
        ? <p className="text-muted text-center p-[30px]">Cargando catálogo...</p>
        : padres.length === 0
        ? <div className="bg-[#f8fafc] border border-dashed border-[#d1d9e6] rounded-[10px] p-9 text-center">
            <div className="text-[28px] mb-2">📋</div>
            <div className="text-sm font-semibold text-[#1a2535] mb-1.5">Tu catálogo está vacío</div>
            <div className="text-[12px] text-muted mb-3.5">
              Agrega partidas comunes como "Obra Gruesa", "Instalaciones Eléctricas", "Terminaciones", etc.
              Luego podrás importarlas a cualquier cotización o proyecto con un clic.
            </div>
            <Btn variant="primary" onClick={openNewPadre}>+ Crear primera partida</Btn>
          </div>
        : (
          <div className="flex flex-col gap-2">
            {padres.map((padre, idx) => {
              const isOpen = expanded.has(padre.id)
              return (
                <div key={padre.id} className="border border-[#e4e9f0] rounded-[10px] overflow-hidden">

                  {/* CABECERA PADRE */}
                  <div
                    onClick={() => toggle(padre.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-l-4 border-brand ${isOpen ? 'bg-[#f4f7fb]' : 'bg-white'}`}
                  >
                    <span className={`text-[12px] text-muted flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>▶</span>

                    <span className="text-[11px] font-bold text-brand bg-[#e8f1fb] px-2 py-0.5 rounded flex-shrink-0">
                      {idx + 1}
                    </span>

                    <div className="flex-1">
                      <div className="text-sm font-bold text-[#1a2535]">{padre.descripcion}</div>
                      <div className="flex gap-[10px] text-[11px] text-muted mt-0.5">
                        <span>{padre.unidad}</span>
                        {padre.precio_unitario_ref > 0 && <span>P.U ref: {fmt(padre.precio_unitario_ref)}</span>}
                        <span>{padre.children.length} sub-partida{padre.children.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(padre)} className="w-6 h-6 rounded-[5px] border-0 bg-canvas text-muted text-[11px] font-bold cursor-pointer flex items-center justify-center">✎</button>
                      <button onClick={() => del(padre.id)} className="w-6 h-6 rounded-[5px] border-0 bg-danger-bg text-danger text-[11px] font-bold cursor-pointer flex items-center justify-center">✕</button>
                    </div>
                  </div>

                  {/* SUB-PARTIDAS */}
                  {isOpen && (
                    <div className="px-4 pt-3 pb-3.5 pl-9 bg-[#fafbfc] border-t border-[#e4e9f0]">
                      {padre.children.length === 0 && (
                        <p className="text-[12px] text-muted text-center py-1.5">
                          Sin sub-partidas definidas aún.
                        </p>
                      )}

                      {padre.children.map((hijo, hIdx) => (
                        <div key={hijo.id} className={`flex items-center gap-[10px] py-2 ${hIdx < padre.children.length - 1 ? 'border-b border-[#e4e9f0]' : ''}`}>
                          <span className="text-[11px] text-muted font-semibold min-w-[30px]">
                            {idx + 1}.{hIdx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="text-[12px] font-semibold text-[#1a2535]">{hijo.descripcion}</div>
                            <div className="text-[11px] text-muted">
                              {hijo.unidad}{hijo.precio_unitario_ref > 0 ? ` · P.U ref: ${fmt(hijo.precio_unitario_ref)}` : ''}
                            </div>
                          </div>
                          <div className="flex gap-[3px]">
                            <button onClick={() => openEdit(hijo)} className="w-6 h-6 rounded-[5px] border-0 bg-canvas text-muted text-[11px] font-bold cursor-pointer flex items-center justify-center">✎</button>
                            <button onClick={() => del(hijo.id)} className="w-6 h-6 rounded-[5px] border-0 bg-danger-bg text-danger text-[11px] font-bold cursor-pointer flex items-center justify-center">✕</button>
                          </div>
                        </div>
                      ))}

                      <button onClick={() => openNewHijo(padre.id, padre.children.length)}
                        className="w-full py-2 mt-2 bg-white border border-dashed border-[#d1d9e6] rounded-[6px] text-[12px] text-brand font-semibold cursor-pointer">
                        + Agregar sub-partida a "{padre.descripcion}"
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      {/* MODAL */}
      {modal && (
        <Modal
          title={
            modal.type === 'padre' ? 'Nueva partida en catálogo' :
            modal.type === 'hijo'  ? 'Nueva sub-partida' : 'Editar partida'
          }
          onClose={() => setModal(null)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-full">
              <FormInput label="Descripción *" value={form.descripcion || ''} onChange={v => upd('descripcion', v)}
                placeholder={modal.type === 'hijo' ? 'Ej: Excavación de fundaciones' : 'Ej: Obra Gruesa'} required />
            </div>
            <FormSelect label="Unidad" value={form.unidad || 'gl'} onChange={v => upd('unidad', v)} options={UNIDADES} />
            <FormInput label="Precio unitario referencial" value={form.precio_unitario_ref ?? 0} onChange={v => upd('precio_unitario_ref', v)} type="number"
              placeholder="Precio estimado (se puede ajustar al usar)" />
          </div>
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
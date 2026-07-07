'use client'
// app/(protected)/contratos/page.tsx

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt, fmtM } from '@/components/ui'
import type { Contrato } from '@/types'

const EMPTY: Omit<Contrato,'id'|'created_at'|'user_id'> = { numero:'', contraparte:'', tipo:'Suma alzada', valor:0, inicio:'', fin:'', estado:'ejecucion' }

export default function ContratosPage() {
  const { data: items = [], isLoading, mutate } = useSWR<Contrato[]>('/api/contratos', fetcher)
  const [modal, setModal]   = useState<'nuevo'|'editar'|null>(null)
  const [form, setForm]     = useState<any>({})
  const [saving, setSaving] = useState(false)

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.contraparte) return
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    await fetch('/api/contratos', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...form, valor: Number(form.valor) }) })
    await mutate(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar contrato?')) return
    await fetch('/api/contratos', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    await mutate()
  }

  const totalCartera = items.reduce((s,c) => s+c.valor, 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <SectionTitle>Contratos</SectionTitle>
        <Btn variant="primary" onClick={() => { setForm({ ...EMPTY }); setModal('nuevo') }}>+ Nuevo contrato</Btn>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard label="Contratos vigentes" value={items.filter(c=>c.estado==='ejecucion').length} />
        <MetricCard label="Cartera total"       value={fmtM(totalCartera)} sub="Suma alzada + serie" />
        <MetricCard label="Liquidados"          value={items.filter(c=>c.estado==='liquidado').length} sub="Este año" subColor="#1a7a4a" />
      </div>

      <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px]">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : items.length === 0
          ? <p className="text-muted text-center p-10">Sin contratos aún</p>
          : (
          <Table>
            <thead><tr><Th>N° Contrato</Th><Th>Contraparte</Th><Th>Tipo</Th><Th>Valor</Th><Th>Vigencia</Th><Th>Estado</Th><Th></Th></tr></thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <Td><span className="font-mono font-bold text-brand text-[12px]">{c.numero||'—'}</span></Td>
                  <Td className="font-semibold">{c.contraparte}</Td>
                  <Td className="text-muted">{c.tipo}</Td>
                  <Td className="font-bold">{fmt(c.valor)}</Td>
                  <Td className="text-[12px] text-muted">{c.inicio||'—'} → {c.fin||'—'}</Td>
                  <Td><Badge estado={c.estado} tipo="contrato" /></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Btn onClick={() => { setForm({ ...c }); setModal('editar') }} className="text-[11px] px-2 py-1">Editar</Btn>
                      <Btn variant="danger" onClick={() => del(c.id)} className="text-[11px] px-2 py-1">✕</Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {modal && (
        <Modal title={modal==='nuevo'?'Nuevo contrato':'Editar contrato'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="N° Contrato"    value={form.numero||''}      onChange={v=>upd('numero',v)} />
            <FormInput label="Contraparte"    value={form.contraparte||''} onChange={v=>upd('contraparte',v)} required />
            <FormSelect label="Tipo" value={form.tipo||'Suma alzada'} onChange={v=>upd('tipo',v)}
              options={[{value:'Suma alzada',label:'Suma alzada'},{value:'Serie de precios',label:'Serie de precios'},{value:'Administración delegada',label:'Administración delegada'}]} />
            <FormInput label="Valor (CLP)"   value={form.valor||''}  onChange={v=>upd('valor',v)} type="number" />
            <FormInput label="Fecha inicio"  value={form.inicio||''} onChange={v=>upd('inicio',v)} type="date" />
            <FormInput label="Fecha fin"     value={form.fin||''}    onChange={v=>upd('fin',v)}    type="date" />
            <FormSelect label="Estado" value={form.estado||'ejecucion'} onChange={v=>upd('estado',v)}
              options={[{value:'ejecucion',label:'En ejecución'},{value:'liquidado',label:'Liquidado'},{value:'pendiente',label:'Pendiente'}]} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
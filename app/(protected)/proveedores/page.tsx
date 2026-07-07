'use client'
// app/(protected)/proveedores/page.tsx

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Badge, Btn, FormInput, FormSelect, Modal, SectionTitle, Table, Td, Th, fmt } from '@/components/ui'
import type { Proveedor } from '@/types'

const EMPTY: Omit<Proveedor,'id'|'created_at'|'user_id'> = { nombre:'', rut:'', rubro:'', contacto:'', telefono:'', monto3m:0, estado:'activo' }

export default function ProveedoresPage() {
  const { data: items = [], isLoading, mutate } = useSWR<Proveedor[]>('/api/proveedores', fetcher)
  const [modal, setModal]   = useState<'nuevo'|'editar'|null>(null)
  const [form, setForm]     = useState<any>({})
  const [saving, setSaving] = useState(false)

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nombre) return
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    await fetch('/api/proveedores', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...form, monto3m: Number(form.monto3m) }) })
    await mutate(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar proveedor?')) return
    await fetch('/api/proveedores', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    await mutate()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <SectionTitle>Proveedores</SectionTitle>
        <Btn variant="primary" onClick={() => { setForm({ ...EMPTY }); setModal('nuevo') }}>+ Agregar proveedor</Btn>
      </div>

      <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px]">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : items.length === 0
          ? <p className="text-muted text-center p-10">Sin proveedores aún</p>
          : (
          <Table>
            <thead><tr><Th>Proveedor</Th><Th>Rubro</Th><Th>Contacto</Th><Th>Últimos 3 meses</Th><Th>Estado</Th><Th></Th></tr></thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  <Td>
                    <div className="font-bold">{p.nombre}</div>
                    <div className="text-[11px] text-muted font-mono">{p.rut}</div>
                  </Td>
                  <Td className="text-muted">{p.rubro}</Td>
                  <Td>
                    <div className="text-[12px]">{p.contacto}</div>
                    <div className="text-[11px] text-brand">{p.telefono}</div>
                  </Td>
                  <Td className="font-bold">{fmt(p.monto3m)}</Td>
                  <Td><Badge estado={p.estado} tipo="proveedor" /></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Btn onClick={() => { setForm({ ...p }); setModal('editar') }} className="text-[11px] px-2 py-1">Editar</Btn>
                      <Btn variant="danger" onClick={() => del(p.id)} className="text-[11px] px-2 py-1">✕</Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {modal && (
        <Modal title={modal==='nuevo'?'Nuevo proveedor':'Editar proveedor'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="Razón social"       value={form.nombre||''}   onChange={v=>upd('nombre',v)} required />
            <FormInput label="RUT"                value={form.rut||''}      onChange={v=>upd('rut',v)} />
            <FormInput label="Rubro"              value={form.rubro||''}    onChange={v=>upd('rubro',v)} />
            <FormInput label="Contacto"           value={form.contacto||''} onChange={v=>upd('contacto',v)} />
            <FormInput label="Teléfono"           value={form.telefono||''} onChange={v=>upd('telefono',v)} />
            <FormInput label="Compras últimos 3m" value={form.monto3m||''}  onChange={v=>upd('monto3m',v)} type="number" />
            <FormSelect label="Estado" value={form.estado||'activo'} onChange={v=>upd('estado',v)}
              options={[{value:'activo',label:'Activo'},{value:'cotizacion',label:'En cotización'}]} />
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
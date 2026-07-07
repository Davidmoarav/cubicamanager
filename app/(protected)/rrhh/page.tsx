'use client'
// app/(protected)/rrhh/page.tsx

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt, fmtM } from '@/components/ui'
import type { Empleado } from '@/types'

const EMPTY: Omit<Empleado,'id'|'created_at'|'user_id'> = { nombre:'', rut:'', cargo:'', sueldo:0, horas_extra:0, estado:'activo', tipo:'planta', inicio:'' }

export default function RRHHPage() {
  const { data: items = [], isLoading, mutate } = useSWR<Empleado[]>('/api/empleados', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)
  const [modal, setModal]   = useState<'nuevo'|'editar'|null>(null)
  const [form, setForm]     = useState<any>({})
  const [saving, setSaving] = useState(false)


  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nombre) return
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    await fetch('/api/empleados', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sueldo: Number(form.sueldo), horas_extra: Number(form.horas_extra), proyecto_id: form.proyecto_id || null }) })
    await mutate(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar trabajador?')) return
    await fetch('/api/empleados', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    await mutate()
  }

  const totalNomina = items.reduce((s, e) => s + e.sueldo + e.horas_extra * 14000, 0)
  const totalHE     = items.reduce((s, e) => s + e.horas_extra, 0)

  const initials = (n: string) => n.split(' ').map(x => x[0]).slice(0,2).join('')

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <SectionTitle>Recursos humanos</SectionTitle>
        <Btn variant="primary" onClick={() => { setForm({ ...EMPTY }); setModal('nuevo') }}>+ Agregar trabajador</Btn>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total personal"  value={items.length} />
        <MetricCard label="Nómina mensual"  value={fmtM(totalNomina)} />
        <MetricCard label="Horas extra"     value={`${totalHE} h`} sub="Este mes" subColor="#b07d1a" />
        <MetricCard label="Vacaciones"      value={items.filter(e=>e.estado==='vacaciones').length} sub="trabajadores" />
      </div>

      {isLoading
        ? <p className="text-muted text-center p-10">Cargando...</p>
        : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista */}
          <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px]">
            <div className="text-sm font-bold mb-3.5 text-[#1a2535]">Personal</div>
            {items.length === 0
              ? <p className="text-[13px] text-muted text-center p-5">Sin trabajadores aún</p>
              : items.map(e => (
              <div key={e.id} className="flex items-center gap-3 py-2.5 border-b border-canvas">
                <div className="w-9 h-9 rounded-full bg-[#e8f1fb] flex items-center justify-center text-[12px] font-bold text-brand shrink-0">
                  {initials(e.nombre)}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{e.nombre}</div>
                  <div className="text-[12px] text-muted">{e.cargo} · {e.tipo}</div>
                </div>
                <Badge estado={e.estado} tipo="empleado" />
                <div className="flex gap-1">
                  <Btn onClick={() => { setForm({ ...e }); setModal('editar') }} className="px-2.5 py-1.5">✎</Btn>
                  <Btn variant="danger" onClick={() => del(e.id)} className="px-2.5 py-1.5">✕</Btn>
                </div>
              </div>
            ))}
          </div>

          {/* Liquidaciones */}
          <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px]">
            <div className="text-sm font-bold mb-3.5 text-[#1a2535]">Liquidaciones del mes</div>
            <Table>
              <thead><tr><Th>Trabajador</Th><Th>Base</Th><Th>HH.EE</Th><Th>Total</Th></tr></thead>
              <tbody>
                {items.map(e => {
                  const he = e.horas_extra * 14000
                  return (
                    <tr key={e.id}>
                      <Td className="font-semibold">{e.nombre.split(' ')[0]} {e.nombre.split(' ')[1]?.[0]}.</Td>
                      <Td>{fmt(e.sueldo)}</Td>
                      <Td className={he > 0 ? 'text-warning' : 'text-[#aaa]'}>{he>0 ? fmt(he):'—'}</Td>
                      <Td className="font-bold">{fmt(e.sueldo + he)}</Td>
                    </tr>
                  )
                })}
                {items.length > 0 && (
                  <tr>
                    <Td colSpan={3} className="font-bold text-right pt-3">Total nómina</Td>
                    <Td className="font-bold text-brand pt-3">{fmt(totalNomina)}</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      {modal && (
        <Modal title={modal==='nuevo'?'Nuevo trabajador':'Editar trabajador'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2"><FormInput label="Nombre completo" value={form.nombre||''} onChange={v=>upd('nombre',v)} required /></div>
            <FormInput label="RUT"                value={form.rut||''}          onChange={v=>upd('rut',v)} />
            <FormInput label="Cargo"              value={form.cargo||''}        onChange={v=>upd('cargo',v)} />
            <FormInput label="Sueldo base (CLP)"  value={form.sueldo||''}       onChange={v=>upd('sueldo',v)}      type="number" />
            <FormInput label="Horas extra / mes"  value={form.horas_extra??0}   onChange={v=>upd('horas_extra',v)} type="number" />
            <FormSelect label="Tipo"  value={form.tipo||'planta'} onChange={v=>upd('tipo',v)}
              options={[{value:'planta',label:'Planta'},{value:'subcontrato',label:'Subcontrato'}]} />
            <FormSelect label="Estado" value={form.estado||'activo'} onChange={v=>upd('estado',v)}
              options={[{value:'activo',label:'Activo'},{value:'vacaciones',label:'Vacaciones'},{value:'inactivo',label:'Inactivo'}]} />
            <FormInput label="Fecha ingreso" value={form.inicio||''} onChange={v=>upd('inicio',v)} type="date" />
            <div className="col-span-2">
              <FormSelect label="Obra / proyecto asignado" value={form.proyecto_id || ''} onChange={v=>upd('proyecto_id', v)}
                options={[{ value: '', label: '— Sin asignar —' }, ...proyectos.map((p: any) => ({ value: p.id, label: p.nombre }))]} />
            </div>
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
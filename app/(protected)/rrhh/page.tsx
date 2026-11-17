'use client'
// app/(protected)/rrhh/page.tsx

import { MODALIDADES_PAGO, sueldoMensualEstimado } from '@/lib/tratos'
import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt } from '@/components/ui'
import FiltroObra, { useObraFiltro } from '@/components/FiltroObra'
import { filtrarPorObra } from '@/lib/consolidado'
import { IconEdit } from '@/components/Icon'
import type { Empleado } from '@/types'
import { confirmar } from '@/lib/avisos'

const EMPTY: Omit<Empleado,'id'|'created_at'|'user_id'> = { nombre:'', rut:'', cargo:'', sueldo:0, horas_extra:0, estado:'activo', tipo:'planta', modalidad:'mensual', inicio:'' }

export default function RRHHPage() {
  const { data: todos = [], isLoading, mutate } = useSWR<Empleado[]>('/api/empleados', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)
  const [obra, setObra] = useObraFiltro()
  const items = filtrarPorObra(todos as any[], obra) as Empleado[]
  const [modal, setModal]   = useState<'nuevo'|'editar'|null>(null)
  const [form, setForm]     = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')


  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.nombre) return
    setSaving(true); setError('')
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    const res = await fetch('/api/empleados', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sueldo: Number(form.sueldo), horas_extra: Number(form.horas_extra), inicio: form.inicio || null, proyecto_id: form.proyecto_id || null }) })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'No se pudo guardar el trabajador'); setSaving(false); return
    }
    await mutate(); setSaving(false); setModal(null)
  }

  const del = async (id: string) => {
    if (!(await confirmar('¿Eliminar trabajador?'))) return
    await fetch('/api/empleados', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    await mutate()
  }

  // Horas extra: valor hora × 1,5 (misma fórmula que la liquidación real,
  // no un valor fijo: depende del sueldo de cada trabajador)
  // Nómina estimada de un mes normal. Por día, por hora y a trato dependen del mes:
  // su monto real sale de la liquidación en Remuneraciones.
  const totalNomina = items.reduce((s, e) => s + sueldoMensualEstimado(e as any), 0)
  const totalHE     = items.reduce((s, e) => s + (e.modalidad === 'por_metas' ? 0 : e.horas_extra), 0)

  const initials = (n: string) => n.split(' ').map(x => x[0]).slice(0,2).join('')

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <SectionTitle>Recursos humanos</SectionTitle>
        <div className="flex gap-2 items-center flex-wrap">
          <FiltroObra value={obra} onChange={setObra} proyectos={proyectos} />
          <Btn variant="primary" onClick={() => { setForm({ ...EMPTY }); setModal('nuevo') }}>+ Agregar trabajador</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total personal"  value={items.length} />
        <MetricCard label="Sueldos del mes"  value={fmt(totalNomina)} />
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
                <div className="w-9 h-9 rounded-full bg-[#FCEAE3] flex items-center justify-center text-[12px] font-bold text-brand shrink-0">
                  {initials(e.nombre)}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{e.nombre}</div>
                  <div className="text-[12px] text-muted">{e.cargo} · {e.tipo} · {(MODALIDADES_PAGO.find(m => m.value === (e.modalidad || 'mensual'))?.label ?? 'Mensual').split(' (')[0].toLowerCase()}</div>
                </div>
                <Badge estado={e.estado} tipo="empleado" />
                <div className="flex gap-1">
                  <Btn onClick={() => { setForm({ ...e }); setModal('editar') }} className="px-2.5 py-1.5"><IconEdit className="w-3.5 h-3.5" /></Btn>
                  <Btn variant="danger" onClick={() => del(e.id)} className="px-2.5 py-1.5">✕</Btn>
                </div>
              </div>
            ))}
          </div>

          {/* Liquidaciones */}
          <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px]">
            <div className="text-sm font-bold mb-3.5 text-[#1a2535]">Sueldos del mes</div>
            <Table>
              <thead><tr><Th>Trabajador</Th><Th>Base</Th><Th>Horas extra</Th><Th>Total</Th></tr></thead>
              <tbody>
                {items.map(e => {
                  const porMetas = e.modalidad === 'por_metas'
                  const variable = ['diario', 'por_hora', 'trato'].includes(e.modalidad || '')
                  const total = sueldoMensualEstimado(e as any)
                  const he = porMetas || variable ? 0 : total - (Number(e.sueldo) || 0)
                  return (
                    <tr key={e.id}>
                      <Td className="font-semibold">{e.nombre.split(' ')[0]} {e.nombre.split(' ')[1]?.[0]}.</Td>
                      <Td>{e.modalidad === 'diario' ? `${fmt((e as any).valor_dia || 0)} / día` : e.modalidad === 'por_hora' ? `${fmt((e as any).valor_hora || 0)} / hora` : fmt(e.sueldo)}{porMetas && <span className="text-[10px] text-muted ml-1">(metas)</span>}</Td>
                      <Td className={he > 0 ? 'text-warning' : 'text-[#aaa]'}>{he>0 ? fmt(he):'—'}</Td>
                      <Td className="font-bold">{fmt(total)}{variable && <span className="text-[10px] text-muted font-normal ml-1">(estimado)</span>}</Td>
                    </tr>
                  )
                })}
                {items.length > 0 && (
                  <tr>
                    <Td colSpan={3} className="font-bold text-right pt-3">Total</Td>
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
            <FormSelect label="Modalidad de pago" value={form.modalidad||'mensual'} onChange={v=>upd('modalidad',v)}
              options={MODALIDADES_PAGO} />
            {form.modalidad==='diario' &&
              <FormInput label="Valor día (CLP)" value={form.valor_dia||''} onChange={v=>upd('valor_dia',v)} type="number" />}
            {form.modalidad==='por_hora' &&
              <FormInput label="Valor hora (CLP)" value={form.valor_hora||''} onChange={v=>upd('valor_hora',v)} type="number" />}
            {form.modalidad!=='diario' && form.modalidad!=='por_hora' &&
              <FormInput
                label={form.modalidad==='por_metas' ? 'Monto por metas (CLP)' : form.modalidad==='trato' ? 'Mínimo garantizado del mes (CLP)' : 'Sueldo base (CLP)'}
                value={form.sueldo||''} onChange={v=>upd('sueldo',v)} type="number" />}
            {(form.modalidad==='diario' || form.modalidad==='por_hora' || form.modalidad==='trato' || form.modalidad==='mixto') &&
              <p className="col-span-2 text-[11.5px] text-muted -mt-1">
                {form.modalidad==='diario' && 'Se paga el valor día por cada día con parte diario, más la semana corrida.'}
                {form.modalidad==='por_hora' && 'Se pagan las horas del parte diario, más la semana corrida.'}
                {form.modalidad==='trato' && 'Se paga lo aprobado en sus tratos más la semana corrida; si no alcanza el mínimo garantizado (o el ingreso mínimo, si es mayor), se completa. Pensado para jornada completa.'}
                {form.modalidad==='mixto' && 'Sueldo base fijo más lo aprobado en sus tratos, con semana corrida sobre el trato.'}
              </p>}
            {form.modalidad!=='por_metas' &&
              <FormInput label="Horas extra / mes"  value={form.horas_extra??0}   onChange={v=>upd('horas_extra',v)} type="number" />}
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
          {error && <p className="text-[12px] text-danger mt-3 bg-danger-bg rounded-lg p-2.5">{error}</p>}
          <div className="flex gap-2 justify-end mt-2">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
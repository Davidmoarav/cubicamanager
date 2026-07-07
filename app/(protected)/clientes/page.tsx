'use client'
// app/(protected)/clientes/page.tsx

import { useState, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, MetricCard, Modal, SectionTitle, Table, Td, Th } from '@/components/ui'
import { formatRut, isValidRut, cleanRut } from '@/lib/rut'
import { fmt } from '@/lib/format'
import type { Cliente } from '@/types/cliente'
import type { Proyecto } from '@/types'

const EMPTY: any = {
  razon_social: '', rut: '', giro: '', contacto: '', email: '', telefono: '',
  direccion: '', comuna: '', ciudad: '', notas: '',
}

export default function ClientesPage() {
  const { data: items = [], isLoading, mutate } = useSWR<Cliente[]>('/api/clientes', fetcher)
  const { data: proyectos = [] } = useSWR<Proyecto[]>('/api/proyectos', fetcher)
  const [modal, setModal]     = useState<'nuevo' | 'editar' | null>(null)
  const [form, setForm]       = useState<any>(EMPTY)
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [rutError, setRutError] = useState<string | null>(null)
  const [verProyectos, setVerProyectos] = useState<Cliente | null>(null)

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // ─── RUT handlers ────────────────────────────────────────
  const handleRutChange = (v: string) => {
    setRutError(null)
    // Permitimos escribir libremente; formateamos al perder foco
    upd('rut', v)
  }
  const handleRutBlur = () => {
    if (!form.rut) return
    const formatted = formatRut(form.rut)
    upd('rut', formatted)
    if (!isValidRut(form.rut)) {
      setRutError('RUT inválido (verifica el dígito verificador)')
    }
  }

  // ─── Save / Delete ───────────────────────────────────────
  const save = async () => {
    if (!form.razon_social) { alert('La razón social es obligatoria'); return }
    if (form.rut && !isValidRut(form.rut)) {
      setRutError('RUT inválido (verifica el dígito verificador)')
      return
    }
    setSaving(true)
    const method = modal === 'nuevo' ? 'POST' : 'PUT'
    const res = await fetch('/api/clientes', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, rut: form.rut ? formatRut(form.rut) : null }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      alert('Error: ' + error)
      setSaving(false)
      return
    }
    await mutate()
    setSaving(false)
    setModal(null)
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar cliente? Esto NO elimina sus cotizaciones, pero sí desvincula el cliente.')) return
    await fetch('/api/clientes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await mutate()
  }

  // ─── Filtrado por búsqueda ───────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    const qRut = cleanRut(search)
    return items.filter(c =>
      c.razon_social.toLowerCase().includes(q) ||
      (c.rut && cleanRut(c.rut).includes(qRut)) ||
      (c.contacto && c.contacto.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    )
  }, [items, search])

  // Proyectos de un cliente: por FK cliente_id, o por nombre para proyectos antiguos sin FK
  const proyectosDe = useCallback((c: Cliente) =>
    proyectos.filter(p =>
      p.cliente_id
        ? p.cliente_id === c.id
        : (p.cliente || '').trim().toLowerCase() === (c.razon_social || '').trim().toLowerCase()
    ), [proyectos])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <SectionTitle>Clientes</SectionTitle>
        <Btn variant="primary" onClick={() => { setForm({ ...EMPTY }); setRutError(null); setModal('nuevo') }}>
          + Nuevo cliente
        </Btn>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total clientes" value={items.length} />
        <MetricCard label="Con RUT"        value={items.filter(c => c.rut).length} sub="Empresas registradas" />
        <MetricCard label="Sin RUT"        value={items.filter(c => !c.rut).length} sub="Personas o pendientes" />
      </div>

      {/* Buscador */}
      <div className="mb-3.5">
        <input
          type="text"
          placeholder="Buscar por razón social, RUT, contacto o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-[#d1d9e6] rounded-lg text-[13px] bg-white outline-none"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white border border-line rounded-2xl p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : filtered.length === 0
          ? <p className="text-muted text-center p-10">
              {search ? 'Sin resultados para la búsqueda' : 'Aún no hay clientes. Crea el primero.'}
            </p>
          : (
            <Table>
              <thead><tr>
                <Th>Razón social</Th><Th>RUT</Th><Th>Contacto</Th><Th>Email / Teléfono</Th><Th>Ciudad</Th><Th>Proyectos</Th><Th></Th>
              </tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <Td>
                      <div className="font-bold text-[#1a2535]">{c.razon_social}</div>
                      {c.giro && <div className="text-[11px] text-muted mt-[1px]">{c.giro}</div>}
                    </Td>
                    <Td className="font-mono text-[12px] text-brand font-semibold">
                      {c.rut || '—'}
                    </Td>
                    <Td className="text-muted">{c.contacto || '—'}</Td>
                    <Td>
                      {c.email && <div className="text-[12px] text-brand">{c.email}</div>}
                      {c.telefono && <div className="text-[12px] text-muted">{c.telefono}</div>}
                    </Td>
                    <Td className="text-muted">{c.ciudad || c.comuna || '—'}</Td>
                    <Td>
                      {proyectosDe(c).length > 0
                        ? <button
                            onClick={() => setVerProyectos(c)}
                            className="px-2.5 py-1 rounded-md border border-line text-brand text-[12px] font-bold hover:bg-canvas"
                          >
                            {proyectosDe(c).length} {proyectosDe(c).length === 1 ? 'proyecto' : 'proyectos'}
                          </button>
                        : <span className="text-muted text-[12px]">—</span>}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Btn onClick={() => { setForm({ ...c }); setRutError(null); setModal('editar') }} className="px-2.5 py-1.5">Editar</Btn>
                        <Btn variant="danger" onClick={() => del(c.id)} className="px-2.5 py-1.5">✕</Btn>
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
        <Modal title={modal === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full">
              <FormInput label="Razón social *" value={form.razon_social || ''} onChange={v => upd('razon_social', v)} required placeholder="Ej: Inmobiliaria Ejemplo SpA" />
            </div>

            {/* RUT con validación visual */}
            <div>
              <label className="block text-[12px] font-semibold text-muted mb-1">RUT</label>
              <input
                value={form.rut || ''}
                onChange={e => handleRutChange(e.target.value)}
                onBlur={handleRutBlur}
                placeholder="76.123.456-7"
                className={`w-full px-[11px] py-2 border rounded-[7px] text-[13px] font-mono bg-[#fafbfc] box-border outline-none ${rutError ? 'border-danger' : 'border-[#d1d9e6]'}`}
              />
              {rutError && <div className="text-[11px] text-danger mt-1">{rutError}</div>}
              {form.rut && !rutError && isValidRut(form.rut) && (
                <div className="text-[11px] text-success mt-1">✓ RUT válido</div>
              )}
            </div>

            <FormInput label="Giro"     value={form.giro || ''}     onChange={v => upd('giro', v)}     placeholder="Construcción y obras civiles" />
            <FormInput label="Contacto" value={form.contacto || ''} onChange={v => upd('contacto', v)} placeholder="Nombre Apellido" />
            <FormInput label="Email"    value={form.email || ''}    onChange={v => upd('email', v)}    placeholder="contacto@cliente.cl" type="email" />
            <FormInput label="Teléfono" value={form.telefono || ''} onChange={v => upd('telefono', v)} placeholder="+56 9 1234 5678" />

            <div className="col-span-full">
              <FormInput label="Dirección" value={form.direccion || ''} onChange={v => upd('direccion', v)} placeholder="Av. 1 Sur 123" />
            </div>
            <FormInput label="Comuna" value={form.comuna || ''} onChange={v => upd('comuna', v)} placeholder="Ej: Santiago" />
            <FormInput label="Ciudad" value={form.ciudad || ''} onChange={v => upd('ciudad', v)} placeholder="Ej: Santiago" />

            <div className="col-span-full">
              <FormInput label="Notas" value={form.notas || ''} onChange={v => upd('notas', v)} placeholder="Cliente preferente, paga a 30 días, etc." />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}

      {/* ══════ MODAL: proyectos del cliente ══════ */}
      {verProyectos && (
        <Modal title={`Proyectos de ${verProyectos.razon_social}`} onClose={() => setVerProyectos(null)}>
          <div className="flex flex-col gap-2">
            {proyectosDe(verProyectos).length === 0
              ? <p className="text-muted text-[13px] text-center p-4">Este cliente no tiene proyectos asociados.</p>
              : proyectosDe(verProyectos).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2.5 px-3 bg-canvas rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#1a2535] text-[13px] truncate">{p.nombre}</div>
                    <div className="text-[11px] text-muted mt-[1px]">{fmt(p.valor)} · Avance {p.avance || 0}%</div>
                  </div>
                  <span className={`ml-3 px-2 py-0.5 rounded-full border border-line text-[10px] font-bold capitalize whitespace-nowrap ${
                    p.estado === 'activo' ? 'text-success'
                    : p.estado === 'terminado' ? 'text-muted'
                    : 'text-warning'}`}>{p.estado}</span>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
'use client'
// app/(protected)/clientes/page.tsx

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Btn, FormInput, MetricCard, Modal, SectionTitle, Table, Td, Th } from '@/components/ui'
import { formatRut, isValidRut, cleanRut } from '@/lib/rut'
import type { Cliente } from '@/types/cliente'

const EMPTY: any = {
  razon_social: '', rut: '', giro: '', contacto: '', email: '', telefono: '',
  direccion: '', comuna: '', ciudad: '', notas: '',
}

export default function ClientesPage() {
  const [items, setItems]     = useState<Cliente[]>([])
  const [modal, setModal]     = useState<'nuevo' | 'editar' | null>(null)
  const [form, setForm]       = useState<any>(EMPTY)
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [rutError, setRutError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/clientes')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
    await load()
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
    await load()
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
        {loading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : filtered.length === 0
          ? <p className="text-muted text-center p-10">
              {search ? 'Sin resultados para la búsqueda' : 'Aún no hay clientes. Crea el primero.'}
            </p>
          : (
            <Table>
              <thead><tr>
                <Th>Razón social</Th><Th>RUT</Th><Th>Contacto</Th><Th>Email / Teléfono</Th><Th>Ciudad</Th><Th></Th>
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
    </div>
  )
}

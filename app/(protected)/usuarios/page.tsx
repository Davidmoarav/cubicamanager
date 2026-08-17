'use client'
// app/(protected)/usuarios/page.tsx
// Gestión de usuarios de la organización. Solo el administrador.

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, SectionTitle, Table, Td, Th } from '@/components/ui'

const ROLES = [
  { value: 'admin',     label: 'Administrador' },
  { value: 'contador',  label: 'Contador' },
  { value: 'jefe_obra', label: 'Jefe de obra' },
]

const LABEL_ROL: Record<string, string> = {
  admin: 'Administrador', contador: 'Contador', jefe_obra: 'Jefe de obra',
}

const PERMISOS: Record<string, string> = {
  admin:     'Acceso total, incluida la gestión de usuarios.',
  contador:  'Facturación, finanzas (IVA/PPM), remuneraciones, comercial. Ve las obras.',
  jefe_obra: 'Obras, presupuestos, estados de pago, órdenes de compra, proveedores. Sin acceso a finanzas ni sueldos.',
}

export default function UsuariosPage() {
  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)
  const { data: miembros = [], isLoading, mutate, error } = useSWR<any[]>('/api/miembros', fetcher)
  const [email, setEmail] = useState('')
  const [rol, setRol]     = useState('jefe_obra')
  const [msg, setMsg]     = useState('')
  const [saving, setSaving] = useState(false)

  const esAdmin = miRol?.rol === 'admin'

  const invitar = async () => {
    if (!email.trim()) return
    setSaving(true); setMsg('')
    const res = await fetch('/api/miembros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), rol }),
    })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { setMsg(data.error || 'Error al invitar'); return }
    setEmail(''); setMsg(`Invitación creada para ${data.member_email}. Pídele que se registre con ese email.`)
    mutate()
  }

  const cambiarRol = async (id: string, nuevoRol: string) => {
    await fetch('/api/miembros', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rol: nuevoRol }),
    })
    mutate()
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/miembros', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado }),
    })
    mutate()
  }

  const quitar = async (id: string, mail: string) => {
    if (!confirm(`¿Quitar el acceso de ${mail}? Dejará de ver los datos de la empresa.`)) return
    await fetch('/api/miembros', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  if (miRol && !esAdmin) {
    return (
      <div className="p-6">
        <SectionTitle>Usuarios y roles</SectionTitle>
        <div className="bg-white border border-line rounded-card p-8 text-center shadow-card">
          <p className="text-muted text-[14px]">Solo el administrador puede gestionar los usuarios de la empresa.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <SectionTitle>Usuarios y roles</SectionTitle>

      {/* Invitar */}
      <div className="bg-white border border-line rounded-card p-5 shadow-card mb-6">
        <div className="text-[14px] font-bold text-ink mb-1">Dar acceso a un usuario</div>
        <p className="text-[12px] text-muted mb-3">
          Ingresa su email y elige su rol. Luego pídele que <strong>cree su cuenta con ese mismo email</strong> en la
          pantalla de registro: al entrar quedará vinculado automáticamente a la empresa con el rol que le asignaste.
          Cada persona define su propia contraseña (tú no la ves ni la administras).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1.3fr_auto] gap-3 items-end">
          <FormInput label="Email del usuario" value={email} onChange={setEmail} placeholder="contador@empresa.cl" />
          <FormSelect label="Rol" value={rol} onChange={setRol} options={ROLES} />
          <Btn variant="primary" onClick={invitar} disabled={saving}>{saving ? 'Creando…' : 'Dar acceso'}</Btn>
        </div>
        {msg && <p className="text-[12px] mt-2 font-semibold text-success">{msg}</p>}
        <div className="mt-4 pt-3 border-t border-line2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="bg-canvas rounded-lg p-2.5">
              <div className="text-[12px] font-bold text-ink mb-0.5">{r.label}</div>
              <div className="text-[11px] text-muted leading-snug">{PERMISOS[r.value]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white border border-line rounded-card p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : error
          ? <p className="text-danger text-center p-10">No se pudieron cargar los usuarios.</p>
          : miembros.length === 0
          ? <p className="text-muted text-center p-10">Aún no has dado acceso a nadie. Solo tú (el administrador) usas el sistema.</p>
          : (
            <Table>
              <thead><tr><Th>Email</Th><Th>Rol</Th><Th>Estado</Th><Th></Th></tr></thead>
              <tbody>
                {miembros.map(m => (
                  <tr key={m.id} className="border-t border-line2">
                    <Td className="font-semibold">{m.member_email}</Td>
                    <Td>
                      <select value={m.rol} onChange={e => cambiarRol(m.id, e.target.value)}
                        className="text-[12px] border border-line rounded-md px-2 py-1 bg-white">
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.estado === 'activo'    ? 'bg-success-bg text-success'
                        : m.estado === 'pendiente' ? 'bg-[#fff4e5] text-[#b0641a]'
                        : 'bg-danger-bg text-danger'}`}>
                        {m.estado === 'activo' ? 'Activo' : m.estado === 'pendiente' ? 'Pendiente de registro' : 'Suspendido'}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex gap-1 justify-end">
                        {m.estado === 'activo' && (
                          <Btn onClick={() => cambiarEstado(m.id, 'suspendido')} className="text-[11px] px-2 py-1">Suspender</Btn>
                        )}
                        {m.estado === 'suspendido' && (
                          <Btn onClick={() => cambiarEstado(m.id, 'activo')} className="text-[11px] px-2 py-1">Reactivar</Btn>
                        )}
                        <Btn variant="danger" onClick={() => quitar(m.id, m.member_email)} className="text-[11px] px-2 py-1">✕</Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        <p className="text-[11px] text-muted mt-3">
          <strong>Pendiente de registro</strong>: la persona aún no ha creado su cuenta con ese email.
          <strong className="ml-2">Suspendido</strong>: mantiene la cuenta pero no puede ver los datos de la empresa.
        </p>
      </div>
    </div>
  )
}
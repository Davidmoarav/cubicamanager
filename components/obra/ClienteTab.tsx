'use client'
// components/obra/ClienteTab.tsx — Pestaña Cliente (Fase 2).
// Asocia un cliente existente al proyecto y muestra el trío
// MI EMPRESA / CLIENTE / UBICACIÓN, como el documento de ObraMaestra.

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import type { Proyecto } from '@/types'
import type { Cliente } from '@/types/cliente'
import type { EmpresaConfig } from '@/types/empresa'

function Campo({ v, placeholder }: { v?: string | null; placeholder: string }) {
  return v
    ? <div className="text-[13px] text-ink">{v}</div>
    : <div className="text-[13px] text-subtle italic">{placeholder}</div>
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted mb-2">
        {titulo}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

export default function ClienteTab({ proyecto, onCambio }: {
  proyecto: Proyecto
  onCambio: () => void
}) {
  const { data: clientes } = useSWR<Cliente[]>('/api/clientes')
  const { data: empresa } = useSWR<EmpresaConfig>('/api/empresa')
  const [guardando, setGuardando] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const [error, setError] = useState('')

  const lista = Array.isArray(clientes) ? clientes : []
  const cliente = lista.find(c => c.id === proyecto.cliente_id)

  const asociar = async (clienteId: string) => {
    const c = lista.find(x => x.id === clienteId)
    if (!c) return
    setGuardando(true)
    setError('')
    try {
      const res = await fetch('/api/proyectos', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: proyecto.id, cliente_id: c.id, cliente: c.razon_social }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'No se pudo asociar el cliente')
      setEligiendo(false)
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Trío estilo documento */}
      <div className="bg-white rounded-card border border-line shadow-card p-5 lg:p-6">
        <div className="flex flex-wrap gap-6 divide-x-0 lg:divide-x lg:divide-line [&>*+*]:lg:pl-6">
          <Bloque titulo="Mi empresa">
            <Campo v={empresa?.razon_social} placeholder="Configura tu empresa" />
            <Campo v={empresa?.rut ? `RUT: ${empresa.rut}` : undefined} placeholder="RUT pendiente" />
            <Campo v={empresa?.telefono} placeholder="Teléfono pendiente" />
            <Campo v={empresa?.email} placeholder="Email pendiente" />
            <Link href="/configuracion" className="inline-block text-[12px] font-bold text-om hover:text-om-dark mt-1">
              Editar en Configuración →
            </Link>
          </Bloque>

          <Bloque titulo="Cliente">
            {cliente ? (
              <>
                <div className="text-[13.5px] font-bold text-ink">{cliente.razon_social}</div>
                <Campo v={cliente.rut ? `RUT: ${cliente.rut}` : undefined} placeholder="RUT pendiente" />
                <Campo v={cliente.email} placeholder="email@cliente.com" />
                <Campo v={cliente.telefono} placeholder="Teléfono del cliente" />
                <button
                  onClick={() => setEligiendo(true)}
                  className="text-[12px] font-bold text-om hover:text-om-dark mt-1"
                >
                  Cambiar cliente
                </button>
              </>
            ) : (
              <>
                <div className="text-[13px] text-subtle italic">Sin datos del cliente.</div>
                <button
                  onClick={() => setEligiendo(true)}
                  className="mt-2 px-3.5 py-2 rounded-xl bg-om hover:bg-om-dark text-white text-[12.5px] font-bold transition"
                >
                  + Asociar cliente
                </button>
              </>
            )}
          </Bloque>

          <Bloque titulo="Ubicación del proyecto">
            <Campo v={cliente?.direccion} placeholder="Dirección (Av. Las Condes 1234, Depto 5)" />
            <Campo
              v={[cliente?.comuna, cliente?.ciudad].filter(Boolean).join(' / ') || undefined}
              placeholder="Ciudad / Comuna"
            />
            <div className="text-[11px] text-subtle mt-1">
              Se usa la dirección del cliente. Podrás fijar otra ubicación de obra en la Fase 5.
            </div>
          </Bloque>
        </div>
      </div>

      {/* Selector de cliente */}
      {eligiendo && (
        <div className="bg-white rounded-card border border-om/40 shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-extrabold text-ink">Elige un cliente</div>
            <button onClick={() => setEligiendo(false)} className="text-muted hover:text-ink text-[13px]">✕ Cerrar</button>
          </div>
          {lista.length === 0 ? (
            <p className="text-[13px] text-muted">
              No tienes clientes aún. Créalos en{' '}
              <Link href="/clientes" className="text-om font-bold">Clientes</Link> y vuelve aquí.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {lista.map(c => (
                <button
                  key={c.id}
                  onClick={() => asociar(c.id)}
                  disabled={guardando}
                  className={[
                    'text-left px-4 py-3 rounded-xl border transition',
                    c.id === proyecto.cliente_id
                      ? 'border-om bg-om-bg'
                      : 'border-line hover:border-om/50 hover:bg-canvas',
                  ].join(' ')}
                >
                  <div className="font-bold text-ink text-[13.5px]">{c.razon_social}</div>
                  <div className="text-[12px] text-muted">{c.rut ?? 'Sin RUT'}{c.comuna ? ` · ${c.comuna}` : ''}</div>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-[12.5px] text-danger font-semibold mt-3">{error}</p>}
          <div className="mt-3 text-[12px] text-muted">
            ¿Cliente nuevo? <Link href="/clientes" className="text-om font-bold">Créalo en el módulo Clientes →</Link>
          </div>
        </div>
      )}
    </div>
  )
}

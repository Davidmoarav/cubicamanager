'use client'
// Módulo Filtro DS27 Cap. IV: barra propia del módulo (pestañas y llamado) dentro de Cubica Manager.
// Usa la sesión de Cubica; los datos son de la empresa y solo los ven administrador y jefe de obra.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { DataProvider, useDatos } from './DataProvider'
import { NuevoLlamado } from './NuevoLlamado'
import { Boton } from './ui'

const PESTANAS = [
  { href: '/filtro', label: 'Grupos', exacta: true },
  { href: '/filtro/postulantes', label: 'Postulantes' },
  { href: '/filtro/criterios', label: 'Criterios' },
  { href: '/filtro/resolucion', label: 'Resolución' },
]

function Contenido({ children }: { children: ReactNode }) {
  const { cargando, error, recargar, llamados, llamado, elegirLlamado } = useDatos()
  const pathname = usePathname() ?? ''
  const [creando, setCreando] = useState(false)
  const activa = (p: (typeof PESTANAS)[number]) =>
    p.exacta ? pathname === p.href || pathname.startsWith('/filtro/grupos') : pathname.startsWith(p.href)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-extrabold text-ink">Filtro DS27 Cap. IV</h1>
          <p className="text-[13px] text-muted">Pre-evaluación de postulaciones de Acondicionamiento Térmico</p>
        </div>
        {llamados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
              Llamado
              <select
                aria-label="Llamado"
                className="max-w-[280px] rounded-lg border border-line2 bg-white px-3 py-2 text-[13px] font-semibold text-ink cursor-pointer"
                value={llamado?.id}
                onChange={(e) => elegirLlamado(e.target.value)}
              >
                {llamados.map((l) => (
                  <option key={l.id} value={l.id}>{l.bloqueado ? '🔒 ' : ''}{l.nombre}</option>
                ))}
              </select>
            </label>
            <Boton onClick={() => setCreando(true)}>+ Nuevo llamado</Boton>
          </div>
        )}
      </div>

      <nav className="flex gap-1 border-b border-line mb-5 overflow-x-auto">
        {PESTANAS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`px-3.5 py-2 text-[13px] font-semibold -mb-px border-b-2 whitespace-nowrap transition ${
              activa(p) ? 'border-om text-om' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <div className="rounded-card bg-danger-bg p-4 text-[13px] text-danger">
          <p className="font-bold">No se pudieron cargar los datos.</p>
          <p className="mt-1">
            {/relation .* does not exist|schema cache|could not find/i.test(error)
              ? 'El módulo aún no está activado en la base de datos. Avisa al administrador (sql/50_filtro_ds27.sql).'
              : error}
          </p>
          <Boton className="mt-3" onClick={recargar}>Reintentar</Boton>
        </div>
      ) : cargando ? (
        <p className="text-muted text-center py-10 text-[13px]">Cargando…</p>
      ) : !llamado && pathname !== '/filtro/criterios' ? (
        <div className="bg-white rounded-card border border-line shadow-card p-8 text-center">
          <p className="text-ink text-[14px]">Primero crea un llamado con sus criterios.</p>
          <Link href="/filtro/criterios" className="mt-3 inline-block text-[13px] font-semibold text-om hover:underline">Ir a Criterios →</Link>
        </div>
      ) : (
        children
      )}
      {creando && <NuevoLlamado onCerrar={() => setCreando(false)} />}
    </div>
  )
}

export default function FiltroShell({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <Contenido>{children}</Contenido>
    </DataProvider>
  )
}

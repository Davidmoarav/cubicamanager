'use client'
// components/FiltroObra.tsx
// Filtro por obra de las vistas de empresa: todas, una obra o lo que no tiene obra.

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SIN_OBRA } from '@/lib/consolidado'

interface Props {
  value: string
  onChange: (v: string) => void
  proyectos: { id: string; nombre?: string }[]
  // En vistas donde "sin obra" no aplica, como un proyecto
  sinObra?: boolean
  className?: string
}

const CLAVE = 'cubica.filtroObra'

// La obra elegida sigue elegida al pasar de una pantalla a otra
export function useObraFiltro(): [string, (v: string) => void] {
  const [obra, setObra] = useState('')
  useEffect(() => {
    try { setObra(window.localStorage.getItem(CLAVE) ?? '') } catch {}
  }, [])
  const elegir = (v: string) => {
    setObra(v)
    try {
      if (v) window.localStorage.setItem(CLAVE, v)
      else window.localStorage.removeItem(CLAVE)
    } catch {}
  }
  return [obra, elegir]
}

export default function FiltroObra({ value, onChange, proyectos, sinObra = true, className = '' }: Props) {
  const lista = Array.isArray(proyectos) ? proyectos : []
  // Una obra recordada que ya no existe dejaría la pantalla vacía sin explicación
  useEffect(() => {
    if (value && value !== SIN_OBRA && lista.length > 0 && !lista.some(p => p.id === value)) onChange('')
  }, [value, lista.length])
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Filtrar por obra"
      className={`input-base !mb-0 !py-1.5 cursor-pointer w-auto min-w-[180px] max-w-[280px] ${className}`}>
      <option value="">Todas las obras</option>
      {sinObra && <option value={SIN_OBRA}>Sin obra</option>}
      {lista.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  )
}

// Para páginas del servidor: el filtro vive en la URL
export function FiltroObraUrl({ value, proyectos }: { value: string; proyectos: { id: string; nombre?: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  return <FiltroObra value={value} proyectos={proyectos} onChange={v => router.push(v ? `${pathname}?obra=${v}` : pathname)} />
}

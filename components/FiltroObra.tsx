'use client'
// components/FiltroObra.tsx
// Filtro por obra de las vistas de empresa: todas, una obra o lo que no tiene obra.

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

export default function FiltroObra({ value, onChange, proyectos, sinObra = true, className = '' }: Props) {
  const lista = Array.isArray(proyectos) ? proyectos : []
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

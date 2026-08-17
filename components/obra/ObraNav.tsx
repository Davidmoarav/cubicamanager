'use client'
// components/obra/ObraNav.tsx — Nav superior oscuro del módulo Obra (estilo ObraMaestra)

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const LINKS = [
  { href: '/obra', label: 'Proyectos' },
  { href: '/catalogo-partidas', label: 'Catálogos' },
]

export default function ObraNav() {
  const pathname = usePathname()
  const [empresa, setEmpresa] = useState('')

  useEffect(() => {
    fetch('/api/empresa')
      .then(r => r.json())
      .then(d => { if (d?.razon_social) setEmpresa(d.razon_social) })
      .catch(() => {})
  }, [])

  const iniciales = empresa
    ? empresa.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'CM'

  return (
    <nav className="sticky top-0 z-40 bg-om-ink text-white">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 h-14 flex items-center gap-5">
        {/* Volver al panel clásico */}
        <Link
          href="/dashboard"
          title="Volver al panel"
          className="w-8 h-8 shrink-0 rounded-full border border-om-navline flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 transition"
        >
          ‹
        </Link>

        {/* Logo */}
        <Link href="/obra" className="flex items-center gap-2 shrink-0">
          <span className="w-7 h-7 rounded-full bg-om flex items-center justify-center font-black text-[13px]">C</span>
          <span className="font-extrabold text-[15px] tracking-tight">
            Cubica<span className="text-om">Manager</span>
          </span>
        </Link>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-1 ml-4">
          {LINKS.map(l => {
            const activo = l.href === '/obra'
              ? pathname === '/obra' || pathname?.startsWith('/obra/')
              : pathname?.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={[
                  'px-3 py-1.5 rounded-lg text-[13.5px] font-medium transition',
                  activo ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5',
                ].join(' ')}
              >
                {l.label}
              </Link>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Acciones derecha */}
        <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-om text-white text-[12.5px] font-bold">
          Copiloto de obra
        </span>
        <span className="w-8 h-8 rounded-full bg-white/10 border border-om-navline flex items-center justify-center text-[11px] font-bold text-white/90">
          {iniciales}
        </span>
      </div>
    </nav>
  )
}

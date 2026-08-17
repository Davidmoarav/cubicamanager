'use client'
// components/Sidebar.tsx — Drawer de navegación SOLO móvil (oscuro, estilo Obra).
// En desktop la navegación la da AppTopNav. Comparte el menú vía lib/nav.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { createClient } from '@/lib/supabase'
import { menuPorRol, etiquetaRol } from '@/lib/nav'

export default function Sidebar({ userEmail, open = false, onClose }: {
  userEmail?: string
  open?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [empresa, setEmpresa] = useState<string>('')

  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)
  const rol = miRol?.rol || 'admin'
  const menuVisible = menuPorRol(rol)
  const sections = [...new Set(menuVisible.map(m => m.section))]

  useEffect(() => {
    fetch('/api/empresa')
      .then(r => r.json())
      .then(d => { if (d?.razon_social) setEmpresa(d.razon_social) })
      .catch(() => {})
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className={[
      'w-[230px] shrink-0 flex flex-col bg-om-ink border-r border-om-navline',
      // Drawer deslizable; oculto en desktop (ahí manda AppTopNav)
      'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out lg:hidden',
      open ? 'translate-x-0' : '-translate-x-full',
    ].join(' ')}>

      {/* Logo */}
      <div className="px-4 pt-[18px] pb-4 border-b border-om-navline">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Cubica Manager" className="w-[34px] h-[34px] rounded-lg object-contain" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold tracking-tight text-white">Cubica<span className="text-om">Manager</span></div>
            <div className="text-[10px] mt-px truncate text-white/50">{empresa || 'Sistema de gestión'}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar menú" className="text-white/60 hover:text-white transition text-xl leading-none p-1 -mr-1">✕</button>
        </div>
      </div>

      {/* Acceso directo Copiloto */}
      <div className="px-3 pt-3">
        <Link href="/obra" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-om text-white font-bold text-[13px]">
          Copiloto de obra
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2.5 overflow-y-auto">
        {sections.map(sec => (
          <div key={sec}>
            <div className="text-[10px] font-bold uppercase tracking-wider px-4 pt-3 pb-1 text-white/35">{sec}</div>
            {menuVisible.filter(m => m.section === sec).map(m => {
              const active = pathname === m.href || (m.href !== '/dashboard' && pathname.startsWith(m.href))
              return (
                <Link key={m.href} href={m.href}
                  className={`flex items-center gap-2.5 px-4 py-2 text-[13px] no-underline transition
                    ${active
                      ? 'font-bold text-white bg-white/10 border-l-[3px] border-om'
                      : 'font-normal text-white/60 border-l-[3px] border-transparent hover:bg-white/5 hover:text-white'}`}>
                  <span className="text-[15px]">{m.icon}</span>
                  {m.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-om-navline">
        {userEmail && <div className="text-[11px] mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-white/50">{userEmail}</div>}
        {etiquetaRol(rol) && <div className="text-[10px] font-bold uppercase tracking-wide text-om mb-2">{etiquetaRol(rol)}</div>}
        <button onClick={logout}
          className="w-full py-2 rounded-lg text-xs font-semibold cursor-pointer transition bg-white/5 border border-om-navline text-white/70 hover:bg-white/10 hover:text-white">
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

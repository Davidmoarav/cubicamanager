'use client'
// components/AppTopNav.tsx — Barra superior oscura estilo ObraMaestra para
// TODA la app. Desktop: logo + secciones en menús desplegables + pill Copiloto
// + avatar. Móvil: barra slim con hamburguesa que abre el drawer (Sidebar).

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { createClient } from '@/lib/supabase'
import { menuPorRol, SECCIONES, etiquetaRol, type NavItem } from '@/lib/nav'
import Sidebar from '@/components/Sidebar'
import { IconMenu } from '@/components/Icon'

export default function AppTopNav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [drawer, setDrawer] = useState(false)          // drawer móvil
  const [abierto, setAbierto] = useState<string | null>(null) // dropdown desktop
  const [avatar, setAvatar] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const navRef = useRef<HTMLDivElement>(null)

  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)
  const rol = miRol?.rol || 'admin'
  const menu = menuPorRol(rol)
  const secciones = SECCIONES.filter(s => s !== 'Principal' && menu.some(m => m.section === s))

  useEffect(() => { setDrawer(false); setAbierto(null); setAvatar(false) }, [pathname])

  useEffect(() => {
    fetch('/api/empresa').then(r => r.json()).then(d => { if (d?.razon_social) setEmpresa(d.razon_social) }).catch(() => {})
  }, [])

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) { setAbierto(null); setAvatar(false) }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const iniciales = (empresa || userEmail || 'CM').split(/[\s@]/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const activo = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const seccionActiva = (sec: string) => menu.some(m => m.section === sec && activo(m.href))

  return (
    <>
      {/* ─── Barra desktop ─── */}
      <nav ref={navRef} className="hidden lg:block sticky top-0 z-40 bg-om-ink text-white">
        <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center gap-1">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0 mr-3">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg object-contain" />
            <span className="font-extrabold text-[15px] tracking-tight">Cubica<span className="text-om">Manager</span></span>
          </Link>

          {/* Dashboard directo */}
          <TopLink href="/dashboard" label="Dashboard" activo={activo('/dashboard')} />

          {/* Secciones como dropdowns */}
          {secciones.map(sec => {
            const items = menu.filter(m => m.section === sec)
            const open = abierto === sec
            return (
              <div key={sec} className="relative">
                <button
                  onClick={() => setAbierto(open ? null : sec)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-[13.5px] font-medium transition flex items-center gap-1',
                    open || seccionActiva(sec) ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5',
                  ].join(' ')}
                >
                  {sec} <span className={`text-[9px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {open && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-card shadow-pop border border-line py-1.5 z-50">
                    {items.map(m => (
                      <MenuItem key={m.href} item={m} activo={activo(m.href)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex-1" />

          {/* Pill Copiloto */}
          <Link
            href="/obra"
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-bold transition mr-1',
              pathname.startsWith('/obra') ? 'bg-om text-white' : 'bg-om/90 text-white hover:bg-om',
            ].join(' ')}
          >
            Copiloto de obra
          </Link>

          {/* Avatar */}
          <div className="relative">
            <button
              onClick={() => setAvatar(!avatar)}
              className="w-8 h-8 rounded-full bg-white/10 border border-om-navline flex items-center justify-center text-[11px] font-bold text-white/90 hover:border-white/40 transition"
            >
              {iniciales}
            </button>
            {avatar && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-card shadow-pop border border-line py-2 z-50">
                <div className="px-3 pb-2 border-b border-line">
                  <div className="text-[12.5px] font-bold text-ink truncate">{empresa || 'Mi empresa'}</div>
                  {userEmail && <div className="text-[11px] text-muted truncate">{userEmail}</div>}
                  {etiquetaRol(rol) && <div className="text-[10px] font-bold uppercase tracking-wide text-om mt-1">{etiquetaRol(rol)}</div>}
                </div>
                <Link href="/configuracion" className="block px-3 py-2 text-[13px] text-ink hover:bg-canvas transition">Configuración</Link>
                <button onClick={logout} className="w-full text-left px-3 py-2 text-[13px] text-danger hover:bg-danger-bg transition">Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Barra móvil ─── */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-om-ink border-b border-om-navline">
        <button onClick={() => setDrawer(true)} aria-label="Abrir menú" className="p-2 -ml-2 text-white/70 hover:text-white transition"><IconMenu className="w-6 h-6" /></button>
        <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg object-contain" />
        <span className="font-bold text-white text-sm">Cubica<span className="text-om">Manager</span></span>
        <Link href="/obra" className="ml-auto text-[12px] font-bold text-white bg-om px-2.5 py-1 rounded-lg">Obra</Link>
      </header>

      {/* Drawer móvil = Sidebar */}
      {drawer && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setDrawer(false)} />}
      <Sidebar userEmail={userEmail} open={drawer} onClose={() => setDrawer(false)} />
    </>
  )
}

function TopLink({ href, label, activo }: { href: string; label: string; activo: boolean }) {
  return (
    <Link
      href={href}
      className={[
        'px-3 py-1.5 rounded-lg text-[13.5px] font-medium transition',
        activo ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

function MenuItem({ item, activo }: { item: NavItem; activo: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        'flex items-center gap-2.5 px-3 py-2 text-[13px] transition',
        activo ? 'text-om font-bold bg-om-bg' : 'text-ink hover:bg-canvas',
      ].join(' ')}
    >
      <span className="text-[14px] w-4 text-center">{item.icon}</span>
      {item.label}
    </Link>
  )
}

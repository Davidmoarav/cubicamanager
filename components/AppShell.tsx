'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SWRConfig } from 'swr'
import Sidebar from '@/components/Sidebar'
import { fetcher } from '@/lib/fetcher'

export default function AppShell({ userEmail, children }: { userEmail?: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, keepPreviousData: true }}>
      <div className="flex min-h-screen">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar userEmail={userEmail} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior móvil */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-line sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-muted hover:text-ink transition text-[22px] leading-none"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <img src="/logo.png" alt="Cubica Manager" className="w-7 h-7 rounded-lg object-contain" />
          <span className="font-bold text-ink text-sm">Cubica Manager</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-7">
          {children}
        </main>
      </div>
      </div>
    </SWRConfig>
  )
}
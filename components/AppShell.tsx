'use client'

import { usePathname } from 'next/navigation'
import { SWRConfig } from 'swr'
import AppTopNav from '@/components/AppTopNav'
import { fetcher } from '@/lib/fetcher'

export default function AppShell({ userEmail, children }: { userEmail?: string; children: React.ReactNode }) {
  const pathname = usePathname()

  // El módulo /obra trae su propio layout (ObraNav) → no duplicar barra
  if (pathname?.startsWith('/obra')) {
    return (
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, keepPreviousData: true }}>
        {children}
      </SWRConfig>
    )
  }

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, keepPreviousData: true }}>
      <div className="min-h-screen bg-om-canvas flex flex-col">
        <AppTopNav userEmail={userEmail} />
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 lg:px-6 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </SWRConfig>
  )
}

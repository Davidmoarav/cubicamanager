'use client'

import { usePathname } from 'next/navigation'
import { SWRConfig } from 'swr'
import AppTopNav from '@/components/AppTopNav'
import GuardRuta from '@/components/GuardRuta'
import Avisos from '@/components/Avisos'
import ColaTerreno from '@/components/ColaTerreno'
import { fetcher } from '@/lib/fetcher'

export default function AppShell({ userEmail, children }: { userEmail?: string; children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, keepPreviousData: true }}>
      <div className="min-h-screen bg-om-canvas flex flex-col">
        <AppTopNav userEmail={userEmail} />
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 lg:px-6 py-6 lg:py-8">
          <ColaTerreno usuario={userEmail} />
          <GuardRuta pathname={pathname ?? ''}>{children}</GuardRuta>
        </main>
      </div>
      <Avisos />
    </SWRConfig>
  )
}

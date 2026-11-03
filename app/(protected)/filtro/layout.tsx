// app/(protected)/filtro/layout.tsx
// Módulo Filtro DS27 Cap. IV: funciona aparte del resto de Cubica Manager (sus propias tablas),
// con la misma sesión y estética. Lo ven el administrador y el jefe de obra.
import { Suspense } from 'react'
import FiltroShell from '@/components/filtro/FiltroShell'

export const metadata = { title: 'Filtro DS27 · Cubica Manager' }

export default function FiltroLayout({ children }: { children: React.ReactNode }) {
  return (
    <FiltroShell>
      {/* Los filtros viven en la URL: sin este límite, Next no puede prerenderizar la página */}
      <Suspense fallback={<p className="text-muted text-center py-10 text-[13px]">Cargando…</p>}>{children}</Suspense>
    </FiltroShell>
  )
}

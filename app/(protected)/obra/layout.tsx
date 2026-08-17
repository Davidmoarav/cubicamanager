// app/(protected)/obra/layout.tsx — Módulo Obra: nav oscuro + fondo cálido, sin sidebar
import ObraNav from '@/components/obra/ObraNav'

export default function ObraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-om-canvas flex flex-col">
      <ObraNav />
      {/* pb amplio para no tapar contenido con la CopilotoBar fija */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 lg:px-8 py-6 pb-32">
        {children}
      </main>
    </div>
  )
}

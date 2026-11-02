'use client'
// components/GuardRuta.tsx
// Sin permiso, una pantalla mostraría ceros como si no hubiera datos: aquí se dice
// que no hay acceso. El permiso real se sigue aplicando en el servidor.

import Link from 'next/link'
import useSWR from 'swr'
import { avisoSoloLectura, etiquetaRol, rutaProtegida, rutaPermitida } from '@/lib/nav'

export default function GuardRuta({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const protegida = rutaProtegida(pathname)
  const { data, error } = useSWR<any>('/api/mi-rol')
  const aviso = data?.rol ? avisoSoloLectura(pathname, data.rol) : null

  if (aviso) {
    return (
      <>
        <div className="mb-4 text-[12.5px] font-semibold text-warning bg-warning-bg rounded-lg px-3.5 py-2.5">{aviso}</div>
        {children}
      </>
    )
  }
  if (!protegida || error) return <>{children}</>
  if (!data) return <p className="text-muted text-center py-10 text-[13px]">Cargando...</p>
  if (rutaPermitida(pathname, data.rol)) return <>{children}</>

  return (
    <div className="bg-white border border-line rounded-card p-8 shadow-card text-center max-w-[480px] mx-auto mt-10">
      <h1 className="text-[17px] font-extrabold text-ink mb-2">No tienes acceso a esta sección</h1>
      <p className="text-[13px] text-muted mb-5">
        Tu rol es {etiquetaRol(data.rol) || 'sin definir'}. Si necesitas entrar, pídeselo al administrador de tu empresa.
      </p>
      <Link href="/dashboard" className="text-[13px] font-semibold text-brand">Ir al panel general</Link>
    </div>
  )
}

'use client'
// app/auth/confirm/page.tsx
// Destino del correo de recuperación (ver DESPLIEGUE_OBRAMAESTRA.md).
// El link se canjea al apretar el botón: los antivirus de correo que abren los links
// no lo consumen, y funciona en cualquier navegador o dispositivo.

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { motivoDeError } from '@/lib/auth-recuperacion'

function ConfirmForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const tokenHash = searchParams.get('token_hash')
  const valido = !!tokenHash && searchParams.get('type') === 'recovery'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!valido) router.replace('/auth/forgot?error=link-invalido')
  }, [valido])

  const continuar = async () => {
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash as string, type: 'recovery' })
    if (error) { router.replace(`/auth/forgot?error=${motivoDeError(error)}`); return }
    router.replace('/auth/update-password')
  }

  if (!valido) return null

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-card px-9 py-10 w-full max-w-[420px] shadow-[var(--shadow-lg)]">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Cubica Manager" className="w-14 h-14 rounded-xl object-contain mx-auto mb-3 block" />
          <h1 className="text-[22px] font-extrabold text-[var(--text)] tracking-[-0.5px]">Recuperar contraseña</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">Continúa para crear una contraseña nueva</p>
        </div>
        <button
          type="button"
          onClick={continuar}
          disabled={loading}
          className={`w-full py-[11px] text-white border-none rounded-lg text-[14px] font-bold transition-all
            ${loading ? 'bg-[var(--subtle)] cursor-default' : 'bg-[var(--primary)] cursor-pointer'}`}>
          {loading ? 'Verificando...' : 'Continuar'}
        </button>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmForm />
    </Suspense>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function ForgotForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (searchParams.get('error') === 'link-invalido') {
      setError('El link de recuperación es inválido o ya expiró. Solicita uno nuevo.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-card px-9 py-10 w-full max-w-[420px] shadow-[var(--shadow-lg)]">

        <div className="text-center mb-8">
          <img src="/logo.png" alt="Cubica Manager" className="w-14 h-14 rounded-xl object-contain mx-auto mb-3 block" />
          <h1 className="text-[22px] font-extrabold text-[var(--text)] tracking-[-0.5px]">Recuperar contraseña</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">Te enviaremos un link a tu correo</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4"></div>
            <p className="text-[14px] font-semibold text-[var(--text)] mb-2">Revisa tu correo</p>
            <p className="text-[13px] text-[var(--muted)] mb-6">
              Si el email está registrado, recibirás un link para crear una nueva contraseña. Puede demorar unos minutos.
            </p>
            <Link href="/auth/login" className="text-[13px] text-brand font-semibold hover:underline">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="label-base">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@empresa.cl"
                required
                className="input-base"
              />
            </div>

            {error && (
              <div className="bg-danger-bg text-danger text-[13px] px-[14px] py-[10px] rounded-lg mb-3.5">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-[11px] text-white border-none rounded-lg text-[14px] font-bold transition-all
                ${loading ? 'bg-[var(--subtle)] cursor-default' : 'bg-[var(--primary)] cursor-pointer'}`}>
              {loading ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>

            <div className="text-center mt-4">
              <Link href="/auth/login" className="text-[13px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                Volver al inicio de sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  )
}

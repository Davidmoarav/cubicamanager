'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    let listo = false

    // El token puede llegar en el hash (#access_token=...). El cliente de Supabase
    // lo procesa de forma asíncrona y emite PASSWORD_RECOVERY / SIGNED_IN.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        listo = true
        setChecking(false)
      }
    })

    // Si ya hay sesión (formato ?code, procesado en el callback), seguir de inmediato
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { listo = true; setChecking(false) }
    })

    // Margen para que el cliente procese el token del hash antes de rendirse
    const t = setTimeout(() => {
      if (!listo) router.replace('/auth/forgot?error=link-invalido')
    }, 3000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres'); return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden'); return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }
    router.push('/dashboard')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <p className="text-[var(--muted)] text-[14px]">Verificando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-card px-9 py-10 w-full max-w-[420px] shadow-[var(--shadow-lg)]">

        <div className="text-center mb-8">
          <img src="/logo.png" alt="Cubica Manager" className="w-14 h-14 rounded-xl object-contain mx-auto mb-3 block" />
          <h1 className="text-[22px] font-extrabold text-[var(--text)] tracking-[-0.5px]">Nueva contraseña</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">Elige una contraseña segura</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="label-base">Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              className="input-base"
            />
          </div>
          <div className="mb-5">
            <label className="label-base">Confirmar contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
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
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
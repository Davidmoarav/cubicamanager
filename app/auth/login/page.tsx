'use client'
// app/auth/login/page.tsx

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [msg, setMsg]           = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setMsg(''); setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { nombre } }
      })
      if (error) { setError(error.message); setLoading(false); return }

      // Si la confirmación por correo está desactivada, Supabase ya devuelve la
      // sesión activa: se entra directo. Si está activada, sí hay que confirmar.
      if (data.session) {
        router.push('/dashboard')
        router.refresh()
        return
      }
      setMsg('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
      setMode('login')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-card px-9 py-10 w-full max-w-[420px] shadow-[var(--shadow-lg)]">

        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Cubica Manager" className="w-14 h-14 rounded-xl object-contain mx-auto mb-3 block" />
          <h1 className="text-[22px] font-extrabold text-[var(--text)] tracking-[-0.5px]">Cubica Manager</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">Sistema de gestión para contratistas</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-[var(--bg)] rounded-lg p-1 mb-6">
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setMsg('') }}
              className={`flex-1 py-2 rounded-[6px] border-none cursor-pointer text-[13px] font-semibold transition-all
                ${mode === m
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow)]'
                  : 'bg-transparent text-[var(--muted)]'
                }`}>
              {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="mb-3.5">
              <label className="label-base">Nombre completo</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" required className="input-base" />
            </div>
          )}
          <div className="mb-3.5">
            <label className="label-base">Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@empresa.cl" required className="input-base" />
          </div>
          <div className="mb-5">
            <div className="flex justify-between items-center mb-1.5">
              <label className="label-base !mb-0">Contraseña</label>
              {mode === 'login' && (
                <Link href="/auth/forgot" className="text-[12px] text-brand hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              )}
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
              required minLength={mode === 'register' ? 8 : undefined} className="input-base" />
          </div>

          {error && <div className="bg-danger-bg text-danger text-[13px] px-[14px] py-[10px] rounded-lg mb-3.5">{error}</div>}
          {msg   && <div className="bg-success-bg text-success text-[13px] px-[14px] py-[10px] rounded-lg mb-3.5">{msg}</div>}

          <button type="submit" disabled={loading}
            className={`w-full py-[11px] text-white border-none rounded-lg text-[14px] font-bold transition-all
              ${loading ? 'bg-[var(--subtle)] cursor-default' : 'bg-[var(--primary)] cursor-pointer'}`}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}
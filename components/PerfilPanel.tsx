'use client'
// components/PerfilPanel.tsx
// Panel de perfil del usuario: su cuenta, su rol y cambio de contraseña.
// Cada persona cambia SU PROPIA contraseña (usa su sesión activa).

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { createClient } from '@/lib/supabase'
import { Btn, FormInput } from '@/components/ui'

const LABEL_ROL: Record<string, string> = {
  admin: 'Administrador', contador: 'Contador', jefe_obra: 'Jefe de obra',
}

export default function PerfilPanel() {
  const supabase = createClient()
  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)

  const [actual, setActual]   = useState('')
  const [nueva, setNueva]     = useState('')
  const [repetir, setRepetir] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const cambiar = async () => {
    setMsg(null)

    if (nueva.length < 8) {
      setMsg({ kind: 'error', text: 'La nueva contraseña debe tener al menos 8 caracteres.' }); return
    }
    if (nueva !== repetir) {
      setMsg({ kind: 'error', text: 'Las contraseñas nuevas no coinciden.' }); return
    }
    if (!miRol?.email) {
      setMsg({ kind: 'error', text: 'No se pudo verificar tu sesión. Vuelve a entrar.' }); return
    }

    setSaving(true)

    // Verifica la contraseña actual reautenticando (evita que alguien con la
    // sesión abierta en un equipo ajeno cambie la clave sin saberla)
    const { error: errAuth } = await supabase.auth.signInWithPassword({
      email: miRol.email, password: actual,
    })
    if (errAuth) {
      setSaving(false)
      setMsg({ kind: 'error', text: 'La contraseña actual no es correcta.' }); return
    }

    const { error } = await supabase.auth.updateUser({ password: nueva })
    setSaving(false)

    if (error) {
      setMsg({ kind: 'error', text: error.message || 'No se pudo cambiar la contraseña.' }); return
    }
    setActual(''); setNueva(''); setRepetir('')
    setMsg({ kind: 'ok', text: 'Contraseña actualizada. Úsala la próxima vez que entres.' })
  }

  const enviarRecuperacion = async () => {
    if (!miRol?.email) return
    setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(miRol.email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setMsg(error
      ? { kind: 'error', text: 'No se pudo enviar el correo de recuperación.' }
      : { kind: 'ok', text: `Te enviamos un correo a ${miRol.email} para restablecer la contraseña.` })
  }

  return (
    <div className="bg-white border border-line rounded-card p-5 shadow-card">
      <div className="text-[15px] font-bold text-ink mb-1">Mi cuenta</div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-5 pb-4 border-b border-line2">
        <div>
          <div className="text-[11px] text-muted">Email</div>
          <div className="text-[13px] font-semibold text-ink">{miRol?.email || '—'}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted">Rol</div>
          <div className="text-[13px] font-semibold text-brand">{LABEL_ROL[miRol?.rol] || '—'}</div>
        </div>
      </div>

      <div className="text-[14px] font-bold text-ink mb-1">Cambiar mi contraseña</div>
      <p className="text-[12px] text-muted mb-3">
        Solo tú puedes cambiar tu contraseña. Debe tener al menos 8 caracteres.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormInput label="Contraseña actual" type="password" value={actual}  onChange={setActual} />
        <FormInput label="Nueva contraseña"  type="password" value={nueva}   onChange={setNueva} />
        <FormInput label="Repetir la nueva"  type="password" value={repetir} onChange={setRepetir} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2">
        <Btn variant="primary" onClick={cambiar} disabled={saving || !actual || !nueva || !repetir}>
          {saving ? 'Guardando…' : 'Cambiar contraseña'}
        </Btn>
        <button onClick={enviarRecuperacion} className="text-[12px] text-brand font-semibold underline">
          Olvidé mi contraseña actual (enviar correo)
        </button>
      </div>

      {msg && (
        <p className={`text-[12px] mt-3 font-semibold ${msg.kind === 'ok' ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
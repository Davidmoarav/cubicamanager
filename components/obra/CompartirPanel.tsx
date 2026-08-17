'use client'
// components/obra/CompartirPanel.tsx — Enviar al cliente / Copiar link (Fase 5).
// Crea el link público, lo copia, lo manda por WhatsApp y lo desactiva.

import { useState } from 'react'
import useSWR from 'swr'
import type { Proyecto } from '@/types'

interface ShareInfo {
  token: string
  activo: boolean
  actualizado_en?: string
  url: string
}

const fechaHora = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function CompartirPanel({ proyecto }: { proyecto: Proyecto }) {
  const { data: share, mutate } = useSWR<ShareInfo | null>(`/api/share?proyecto_id=${proyecto.id}`)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  const activo = share?.activo && share?.url

  const avisar = (msg: string) => {
    setAviso(msg)
    setTimeout(() => setAviso(''), 3500)
  }

  const generar = async (esActualizacion = false) => {
    setTrabajando(true)
    setError('')
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo crear el link')
      await mutate()
      if (!esActualizacion && data.url) {
        await copiar(data.url)
      } else {
        avisar('Datos del link actualizados')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Error al compartir')
    } finally {
      setTrabajando(false)
    }
  }

  const copiar = async (url?: string) => {
    const u = url ?? share?.url
    if (!u) return
    try {
      await navigator.clipboard.writeText(u)
      avisar('Link copiado al portapapeles')
    } catch {
      avisar(u) // fallback: mostrarlo para copiar a mano
    }
  }

  const whatsapp = () => {
    if (!share?.url) return
    const msg = `Hola! Te comparto el presupuesto "${proyecto.nombre}": ${share.url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const desactivar = async () => {
    if (!confirm('¿Desactivar el link? El cliente dejará de ver el proyecto (puedes reactivarlo después).')) return
    setTrabajando(true)
    try {
      await fetch('/api/share', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id }),
      })
      await mutate()
      avisar('Link desactivado')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="space-y-2.5">
      {!activo ? (
        <>
          <button
            onClick={() => generar(false)}
            disabled={trabajando}
            className={[
              'w-full py-2.5 rounded-xl text-white font-bold text-[13px] transition',
              trabajando ? 'bg-om/40 cursor-wait' : 'bg-om hover:bg-om-dark',
            ].join(' ')}
          >
            {trabajando ? 'Creando link…' : 'Enviar al cliente'}
          </button>
          <p className="text-[11px] text-muted leading-snug">
            Crea un link de solo lectura con presupuesto, avance y cobros. Sin login para el cliente.
          </p>
        </>
      ) : (
        <>
          <div className="px-3 py-2 rounded-xl bg-success-bg text-success text-[11.5px] font-bold">
            Link activo · datos al {fechaHora(share?.actualizado_en)}
          </div>
          <button
            onClick={() => copiar()}
            className="w-full py-2.5 rounded-xl border border-line text-ink hover:border-om hover:text-om font-bold text-[13px] text-left px-4 transition"
          >
            Copiar link
          </button>
          <button
            onClick={whatsapp}
            className="w-full py-2.5 rounded-xl border border-line text-ink hover:border-om hover:text-om font-bold text-[13px] text-left px-4 transition"
          >
            Enviar por WhatsApp
          </button>
          <button
            onClick={() => generar(true)}
            disabled={trabajando}
            className="w-full py-2.5 rounded-xl border border-line text-ink hover:border-om hover:text-om font-bold text-[13px] text-left px-4 transition disabled:opacity-50"
          >
            {trabajando ? '⏳ Actualizando…' : '⟳ Actualizar datos del link'}
          </button>
          <button
            onClick={desactivar}
            disabled={trabajando}
            className="w-full py-2 rounded-xl text-danger hover:bg-danger-bg font-bold text-[12px] text-left px-4 transition"
          >
            ✕ Desactivar link
          </button>
        </>
      )}

      {aviso && <p className="text-[11.5px] text-success font-bold break-all">{aviso}</p>}
      {error && <p className="text-[11.5px] text-danger font-bold">{error}</p>}
    </div>
  )
}

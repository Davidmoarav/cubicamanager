'use client'
// components/obra/ComentariosTab.tsx — Bitácora / comentarios del proyecto (Fase 4).

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase'

interface Comentario {
  id: string
  proyecto_id: string
  texto: string
  autor?: string | null
  created_at?: string
}

function tiempoRelativo(iso?: string): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTab({ proyectoId }: { proyectoId: string }) {
  const { data, error: errSWR, mutate } = useSWR<Comentario[]>(`/api/comentarios-proyecto?proyecto_id=${proyectoId}`)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [miEmail, setMiEmail] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMiEmail(data.user?.email ?? ''))
  }, [])

  const lista = Array.isArray(data) ? data : []
  const faltaMigracion = (errSWR as any)?.message?.includes?.('37_gantt') ||
    (typeof (data as any)?.error === 'string' && (data as any).error.includes('37_gantt'))

  const enviar = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/comentarios-proyecto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, texto: t }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'No se pudo comentar')
      setTexto('')
      mutate()
    } catch (e: any) {
      setError(e?.message ?? 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este comentario?')) return
    const res = await fetch('/api/comentarios-proyecto', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) mutate()
  }

  return (
    <div className="space-y-4 max-w-[720px]">
      {/* Composer */}
      <div className="bg-white rounded-card border border-line shadow-card p-3 flex items-start gap-2">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
          rows={2}
          placeholder="Deja un registro en la bitácora: avances, acuerdos, pendientes… (Ctrl/Cmd+Enter envía)"
          className="flex-1 resize-none outline-none bg-transparent text-[13.5px] text-ink placeholder:text-subtle p-2"
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className={[
            'shrink-0 px-4 py-2.5 m-1 rounded-xl text-white text-[13px] font-bold transition',
            texto.trim() && !enviando ? 'bg-om hover:bg-om-dark' : 'bg-om/25 cursor-not-allowed',
          ].join(' ')}
        >
          {enviando ? '…' : 'Comentar'}
        </button>
      </div>

      {error && <p className="text-[12.5px] text-danger font-semibold">{error}</p>}
      {faltaMigracion && (
        <p className="text-[12.5px] text-warning font-semibold bg-warning-bg rounded-xl px-4 py-3">
          Falta ejecutar <span className="font-mono">sql/37_gantt_comentarios.sql</span> en Supabase para activar la bitácora.
        </p>
      )}

      {/* Lista */}
      {lista.length === 0 && !faltaMigracion && (
        <div className="bg-white rounded-card border border-dashed border-line2 p-8 text-center">
          <div className="text-[14px] font-bold text-ink">Bitácora vacía</div>
          <p className="text-[12.5px] text-muted mt-1">El primer registro queda para la historia del proyecto.</p>
        </div>
      )}

      <ul className="space-y-3">
        {lista.map(c => {
          const iniciales = (c.autor ?? '?').split('@')[0].slice(0, 2).toUpperCase()
          return (
            <li key={c.id} className="bg-white rounded-card border border-line shadow-card p-4 flex gap-3 group">
              <span className="w-9 h-9 shrink-0 rounded-full bg-om-ink text-white text-[11px] font-extrabold flex items-center justify-center">
                {iniciales}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-[13px] truncate">{c.autor ?? 'Usuario'}</span>
                  <span className="text-[11.5px] text-subtle shrink-0">{tiempoRelativo(c.created_at)}</span>
                  {(c.autor === miEmail || !c.autor) && (
                    <button
                      onClick={() => eliminar(c.id)}
                      className="ml-auto text-subtle hover:text-danger text-[13px] opacity-0 group-hover:opacity-100 transition"
                      title="Eliminar"
                    >
                     
                    </button>
                  )}
                </div>
                <p className="text-[13.5px] text-ink mt-1 whitespace-pre-wrap break-words">{c.texto}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

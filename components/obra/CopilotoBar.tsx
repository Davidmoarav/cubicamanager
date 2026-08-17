'use client'
// components/obra/CopilotoBar.tsx — Barra de chat flotante del Copiloto.
// Fase 1: envía instrucciones (onSubmit) y dicta por voz (Web Speech es-CL).

import { useEffect, useState } from 'react'
import { useDictado } from './useDictado'
import { IconMic, IconSend, IconStop } from '@/components/Icon'

export default function CopilotoBar({
  placeholder = 'Agrega o edita materiales y precios, o habla',
  onSubmit,
  busy = false,
  respuesta = '',
}: {
  placeholder?: string
  onSubmit?: (texto: string) => void
  busy?: boolean
  respuesta?: string
}) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const { grabando, soportado, toggle } = useDictado(t =>
    setTexto(prev => (prev ? prev + ' ' : '') + t)
  )

  // La respuesta del copiloto (viene del padre) se muestra como burbuja
  useEffect(() => {
    if (respuesta) setAviso(respuesta)
  }, [respuesta])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  const avisar = (msg: string) => setAviso(msg)

  const enviar = () => {
    const t = texto.trim()
    if (!t || busy) return
    if (grabando) toggle()
    if (onSubmit) { onSubmit(t); setTexto(''); return }
    avisar('Esta barra aún no está conectada en esta pantalla.')
    setTexto('')
  }

  const clickMic = () => {
    if (busy) return
    if (texto.trim() && !grabando) { enviar(); return }
    if (!soportado) { avisar('Tu navegador no soporta dictado por voz. Prueba con Chrome o Edge.'); return }
    toggle()
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {aviso && (
        <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pb-2">
          <div className="inline-block max-w-[680px] bg-om-ink text-white text-[12.5px] font-medium px-4 py-2 rounded-xl shadow-pop">
            {aviso}
          </div>
        </div>
      )}

      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pb-3">
        <div className={[
          'bg-white rounded-full shadow-bar border flex items-center gap-2 pl-2 pr-2 py-1.5 transition',
          grabando ? 'border-om ring-2 ring-om/30' : 'border-line',
        ].join(' ')}>
          <button
            type="button"
            title="Adjuntar (Fase 2: Archivos)"
            onClick={() => avisar('Subida de archivos: llega con la pestaña Archivos (Fase 2).')}
            className="w-9 h-9 shrink-0 rounded-full text-muted hover:text-ink hover:bg-canvas transition text-[20px] leading-none"
          >
            +
          </button>

          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar() }}
            placeholder={grabando ? 'Escuchando… toca el micrófono para terminar' : busy ? 'El copiloto está trabajando…' : placeholder}
            disabled={busy}
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-om placeholder:font-medium disabled:opacity-60"
          />

          <button
            type="button"
            title={busy ? 'Trabajando…' : texto.trim() ? 'Enviar' : grabando ? 'Terminar dictado' : 'Hablar'}
            onClick={clickMic}
            disabled={busy}
            className={[
              'w-10 h-10 shrink-0 rounded-full text-white transition flex items-center justify-center',
              busy ? 'bg-om/40 cursor-wait' : grabando ? 'bg-danger animate-pulse' : 'bg-om hover:bg-om-dark',
            ].join(' ')}
          >
            {busy ? <span className="text-[16px] font-bold">…</span>
              : texto.trim() ? <IconSend className="w-[18px] h-[18px]" />
              : grabando ? <IconStop className="w-[18px] h-[18px]" />
              : <IconMic className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

      <div className="h-1.5 bg-om" />
    </div>
  )
}

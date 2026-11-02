'use client'
// components/Avisos.tsx
// Muestra los avisos y las confirmaciones pedidas con lib/avisos.ts.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Btn } from '@/components/ui'
import { avisosIniciales, leerAvisos, quitarAviso, suscribirAvisos, type TipoAviso } from '@/lib/avisos'

const COLOR: Record<TipoAviso, string> = {
  error: 'bg-danger-bg text-danger border-[#f5c6c2]',
  ok: 'bg-success-bg text-success border-[#b9e0c9]',
  info: 'bg-warning-bg text-warning border-[#f0d9a8]',
}

export default function Avisos() {
  const { avisos, pregunta } = useSyncExternalStore(suscribirAvisos, leerAvisos, avisosIniciales)
  const aceptarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pregunta) return
    aceptarRef.current?.focus()
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') pregunta.responder(false) }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [pregunta])

  return (
    <>
      <div aria-live="polite" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-32px)] max-w-[460px] flex flex-col gap-2 pointer-events-none">
        {avisos.map(a => (
          <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 border rounded-xl px-4 py-3 text-[13px] font-semibold shadow-pop whitespace-pre-line ${COLOR[a.tipo]}`}>
            <span className="flex-1">{a.texto}</span>
            <button onClick={() => quitarAviso(a.id)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100 bg-transparent border-none cursor-pointer">✕</button>
          </div>
        ))}
      </div>

      {pregunta && (
        <div className="fixed inset-0 bg-black/35 z-[210] flex items-center justify-center p-5">
          <div role="alertdialog" aria-modal="true" aria-label="Confirmación" className="bg-white rounded-card p-6 w-full max-w-[420px] shadow-pop">
            <p className="text-[14px] text-ink font-semibold whitespace-pre-line mb-5">{pregunta.texto}</p>
            <div className="flex gap-2 justify-end">
              <Btn onClick={() => pregunta.responder(false)}>Cancelar</Btn>
              <button ref={aceptarRef} onClick={() => pregunta.responder(true)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer ${pregunta.peligro ? 'bg-danger' : 'bg-brand'}`}>
                {pregunta.aceptar}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

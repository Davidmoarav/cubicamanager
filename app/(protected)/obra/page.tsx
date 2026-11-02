'use client'
// app/(protected)/obra/page.tsx — Copiloto: crea una obra describiendo el trabajo.
// Fase 1: el hero genera un presupuesto real (IA o demo) y navega al workspace.

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDictado } from '@/components/obra/useDictado'
import { mutate } from 'swr'

export default function ObraHome() {
  const router = useRouter()
    const [idea, setIdea] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  const { grabando, soportado, toggle } = useDictado(t =>
    setIdea(prev => (prev ? prev + ' ' : '') + t)
  )


  const generar = async (texto?: string) => {
    const descripcion = (texto ?? idea).trim()
    if (descripcion.length < 8 || generando) {
      if (descripcion.length < 8) setError('Describe el trabajo con al menos una frase.')
      return
    }
    setError('')
    setGenerando(true)
    try {
      const res = await fetch('/api/copiloto/presupuesto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ descripcion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo generar el presupuesto')
      await mutate('/api/proyectos')
      router.push(`/obra/${data.proyecto_id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Error generando el presupuesto')
      setGenerando(false)
    }
  }

  return (
    <div>
      {/* ─── Overlay generando ─── */}
      {generando && (
        <div className="fixed inset-0 z-50 bg-om-ink/60 flex items-center justify-center px-4">
          <div className="bg-white rounded-card shadow-pop p-8 max-w-[420px] text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-om text-white flex items-center justify-center text-[22px] animate-pulse"></div>
            <div className="text-[17px] font-extrabold text-ink mt-4">Armando tu presupuesto…</div>
            <p className="text-[13px] text-muted mt-1.5">
              El copiloto está agrupando partidas y buscando precios en tu catálogo.
            </p>
          </div>
        </div>
      )}

      {/* ─── Hero conversacional ─── */}
      <section className="mt-2 mb-10">
        <h1 className="text-[26px] lg:text-[30px] font-extrabold text-ink tracking-tight">
          ¿Qué trabajo necesitas presupuestar?
        </h1>
        <p className="text-muted text-[14px] mt-1.5 max-w-[640px]">
          Describe el trabajo con el mayor detalle posible: medidas, materiales y condiciones.
          Puedes hablar o escribir.
        </p>

        {/* Toggle Voz / Texto */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => { if (!soportado) { setError('Tu navegador no soporta dictado. Prueba Chrome o Edge.'); return }; setError(''); toggle() }}
            className={[
              'px-4 py-2 rounded-full text-[13px] font-bold border transition',
              grabando
                ? 'bg-danger text-white border-danger animate-pulse'
                : 'bg-white text-muted border-line hover:border-line2',
            ].join(' ')}
          >
            {grabando ? '■ Escuchando… toca para terminar' : 'Voz'}
          </button>
          <span className="px-4 py-2 rounded-full text-[13px] font-bold bg-om-ink text-white border border-om-ink">
            Aa Texto
          </span>
        </div>

        {/* Input grande */}
        <div className={[
          'mt-4 bg-white rounded-card border shadow-card p-2 flex items-start gap-2 transition',
          grabando ? 'border-om ring-2 ring-om/25' : 'border-line',
        ].join(' ')}>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generar() }}
            rows={3}
            placeholder="Ej: Necesito remodelar un baño de 5m², cambiar la cerámica del piso y muro, impermeabilizar la ducha e instalar vanitorio nuevo…"
            className="flex-1 resize-none outline-none bg-transparent text-[14px] text-ink placeholder:text-subtle p-3"
          />
          <button
            onClick={() => generar()}
            disabled={generando || idea.trim().length < 8}
            title="Generar presupuesto"
            className={[
              'shrink-0 w-11 h-11 m-1 rounded-xl text-white flex items-center justify-center text-[17px] transition',
              idea.trim().length >= 8 && !generando
                ? 'bg-om hover:bg-om-dark cursor-pointer'
                : 'bg-om/25 cursor-not-allowed',
            ].join(' ')}
          >
            →
          </button>
        </div>

        {error && <p className="text-[12.5px] text-danger font-semibold mt-2">{error}</p>}
        <p className="text-[12px] text-subtle mt-2">
          El copiloto arma el presupuesto con partidas, materiales y precios de tu catálogo.
          Ctrl/Cmd + Enter para generar.
        </p>
      </section>

      <Link href="/proyectos" className="text-[13px] font-bold text-om hover:text-om-dark transition">
        Ver mis obras →
      </Link>
    </div>
  )
}

'use client'
// app/(protected)/obra/page.tsx — Landing del módulo Obra.
// Fase 1: el hero genera un presupuesto real (IA o demo) y navega al workspace.

import useSWR from 'swr'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Proyecto } from '@/types'
import { fmt } from '@/lib/format'
import { EstadoBadge, fechaCorta } from '@/components/obra/ui-obra'
import CopilotoBar from '@/components/obra/CopilotoBar'
import { useDictado } from '@/components/obra/useDictado'

export default function ObraHome() {
  const router = useRouter()
  const { data: proyectos, isLoading, mutate } = useSWR<Proyecto[]>('/api/proyectos')
  const [idea, setIdea] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  const { grabando, soportado, toggle } = useDictado(t =>
    setIdea(prev => (prev ? prev + ' ' : '') + t)
  )

  const lista = Array.isArray(proyectos) ? proyectos : []

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
      mutate()
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
          Describe el proyecto con el mayor detalle posible: medidas, materiales y condiciones.
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
           
          </button>
        </div>

        {error && <p className="text-[12.5px] text-danger font-semibold mt-2">{error}</p>}
        <p className="text-[12px] text-subtle mt-2">
          El copiloto arma el presupuesto con partidas, materiales y precios de tu catálogo.
          Ctrl/Cmd + Enter para generar.
        </p>
      </section>

      {/* ─── Proyectos ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-extrabold text-ink">Tus proyectos</h2>
          <Link
            href="/proyectos"
            className="text-[13px] font-bold text-om hover:text-om-dark transition"
          >
            Gestión clásica →
          </Link>
        </div>

        {isLoading && <div className="text-muted text-[13.5px] py-8 text-center">Cargando proyectos…</div>}

        {!isLoading && lista.length === 0 && (
          <div className="bg-white rounded-card border border-dashed border-line2 p-10 text-center">
            <div className="text-[15px] font-bold text-ink">Aún no tienes proyectos</div>
            <p className="text-muted text-[13px] mt-1">
              Describe un trabajo arriba y el copiloto creará el primero por ti.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map(p => (
            <Link
              key={p.id}
              href={`/obra/${p.id}`}
              className="bg-white rounded-card border border-line shadow-card p-5 hover:shadow-pop hover:-translate-y-0.5 transition group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-extrabold text-ink text-[15px] leading-snug group-hover:text-om transition">
                  {p.nombre}
                </div>
                <EstadoBadge estado={p.estado} />
              </div>
              <div className="text-[12.5px] text-muted mt-1">{p.cliente || 'Sin cliente'}</div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Monto</div>
                  <div className="text-[17px] font-extrabold text-ink">{fmt(p.valor || 0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Avance</div>
                  <div className="text-[15px] font-extrabold text-om">{Math.round(p.avance || 0)}%</div>
                </div>
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full rounded-full bg-om transition-all"
                  style={{ width: `${Math.min(100, Math.round(p.avance || 0))}%` }}
                />
              </div>

              {p.created_at && (
                <div className="text-[11.5px] text-subtle mt-3">Creada {fechaCorta(p.created_at)}</div>
              )}
            </Link>
          ))}
        </div>
      </section>

      <CopilotoBar
        placeholder="Describe un trabajo y te armo el presupuesto"
        onSubmit={t => generar(t)}
        busy={generando}
      />
    </div>
  )
}

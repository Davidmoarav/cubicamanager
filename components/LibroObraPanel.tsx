'use client'
// components/LibroObraPanel.tsx
//
// Libro de obra digital: un folio por anotación, con clima y fotos. Es un registro:
// los folios no se editan ni se borran, se anulan con un motivo.

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import { subirDocumento } from '@/lib/subir-documento'
import { usePermisos } from '@/lib/usePermisos'

interface Props {
  proyectoId: string
}

const TIPOS = [
  { value: 'avance', label: 'Avance de obra' },
  { value: 'observacion', label: 'Observación' },
  { value: 'instruccion_ito', label: 'Instrucción del ITO' },
  { value: 'visita', label: 'Visita' },
  { value: 'otro', label: 'Otro' },
]
const CLIMAS = ['', 'Despejado', 'Nublado', 'Lluvia', 'Viento', 'Calor extremo', 'Helada']
const ETIQUETA_TIPO = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function LibroObraPanel({ proyectoId }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, isLoading, mutate } = useSWR<any[]>(`/api/libro-obra?proyecto_id=${proyectoId}`, fetcher)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const [fecha, setFecha] = useState(hoyLocal)
  const [tipo, setTipo]   = useState('avance')
  const [clima, setClima] = useState('')
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]     = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState('')

  const folios: any[] = Array.isArray(data) ? data : []
  const visibles = filtro ? folios.filter(f => f.tipo === filtro) : folios

  // Se copia ahora: al limpiar el input, la FileList queda vacía
  const agregarFotos = (lista: FileList | null) => {
    const nuevas = Array.from(lista ?? [])
    setFotos(prev => [...prev, ...nuevas])
  }

  const guardar = async () => {
    if (!texto.trim()) { setMsg({ tipo: 'error', texto: 'Escribe lo ocurrido en la obra' }); return }
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/libro-obra', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, fecha, tipo, clima: clima || null, texto }),
    })
    const folio = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaving(false)
      setMsg({ tipo: 'error', texto: folio.error || 'No se pudo guardar el folio' })
      return
    }

    // El folio ya quedó: si una foto falla, se avisa cuál sin perder lo escrito en el libro
    const fallidas: string[] = []
    const supabase = createClient()
    for (const f of fotos) {
      try {
        await subirDocumento(supabase, proyectoId, f, { categoria: 'foto', libro_id: folio.id })
      } catch {
        fallidas.push(f.name)
      }
    }
    setSaving(false)
    setTexto('')
    setFotos([])
    await mutate()
    setMsg(fallidas.length > 0
      ? { tipo: 'error', texto: `Folio ${folio.folio} guardado, pero no se subieron: ${fallidas.join(', ')}` }
      : { tipo: 'ok', texto: `Folio ${folio.folio} guardado` })
  }

  const anular = async (f: any) => {
    const motivo = prompt(`Motivo para anular el folio ${f.folio}:`)
    if (!motivo?.trim()) return
    const res = await fetch('/api/libro-obra', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, motivo }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMsg({ tipo: 'error', texto: j.error || 'No se pudo anular el folio' })
      return
    }
    await mutate()
  }

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando libro de obra…</div>
  if (error || (data as any)?.error) {
    return (
      <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
        No se pudo cargar el libro de obra. Si menciona "libro_obra", ejecuta el SQL 43_fase3_gestion_obra.sql en Supabase.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-[14px] font-bold text-ink">Libro de obra</h4>
        <p className="text-[12px] text-muted mt-0.5">Cada anotación queda con su folio, autor y fecha. Los folios se anulan, no se borran.</p>
      </div>

      {msg && (
        <div className={`mb-3 text-[12px] font-semibold rounded-lg px-3 py-2 ${msg.tipo === 'ok' ? 'text-success bg-success-bg' : 'text-danger bg-danger-bg'}`}>
          {msg.texto}
        </div>
      )}

      {puedeEditar && (
        <div className="border border-line rounded-xl p-4 mb-5 bg-canvas">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
            <FormInput label="Fecha" type="date" value={fecha} onChange={setFecha} />
            <FormSelect label="Tipo" value={tipo} onChange={setTipo} options={TIPOS} />
            <div className="col-span-2 sm:col-span-1">
              <FormSelect label="Clima" value={clima} onChange={setClima}
                options={CLIMAS.map(c => ({ value: c, label: c || '— Sin indicar —' }))} />
            </div>
          </div>
          <div className="mb-3">
            <label className="label-base" htmlFor="libro-texto">Anotación</label>
            <textarea id="libro-texto" value={texto} onChange={e => setTexto(e.target.value)} rows={3}
              placeholder="Qué se hizo, qué se observó o qué se instruyó…" className="input-base !mb-0" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Btn onClick={() => camara.current?.click()}>Tomar foto</Btn>
            <Btn onClick={() => galeria.current?.click()}>Elegir fotos</Btn>
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Tomar foto"
              onChange={e => { agregarFotos(e.target.files); e.target.value = '' }} />
            <input ref={galeria} type="file" accept="image/*" multiple className="hidden" aria-label="Elegir fotos"
              onChange={e => { agregarFotos(e.target.files); e.target.value = '' }} />
            {fotos.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-line rounded-lg text-[11px] text-ink max-w-[180px]">
                <span className="truncate">{f.name}</span>
                <button onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="text-danger">✕</button>
              </span>
            ))}
          </div>

          <div className="flex justify-end">
            <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar folio'}</Btn>
          </div>
        </div>
      )}

      {folios.length === 0 ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin anotaciones todavía.
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2 mb-2 flex-wrap">
            <span className="text-[12px] font-bold text-ink">{folios.length} {folios.length === 1 ? 'folio' : 'folios'}</span>
            <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por tipo"
              className="text-[12px] px-2 py-1 border border-line2 rounded-lg bg-white cursor-pointer">
              <option value="">Todos los tipos</option>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            {visibles.map(f => (
              <article key={f.id} className={`border border-line rounded-xl p-3 ${f.anulado ? 'bg-canvas' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="text-[12px]">
                    <span className="font-extrabold text-ink">Folio {f.folio}</span>
                    <span className="text-muted"> · {f.fecha} · {ETIQUETA_TIPO[f.tipo] ?? f.tipo}{f.clima ? ` · ${f.clima}` : ''}</span>
                    {f.anulado && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-danger-bg text-danger text-[10px] font-bold">ANULADO</span>}
                  </div>
                  {puedeEditar && !f.anulado && (
                    <button onClick={() => anular(f)} className="text-[11px] font-semibold text-danger hover:underline">Anular</button>
                  )}
                </div>
                <p className={`text-[13px] mt-1.5 whitespace-pre-wrap ${f.anulado ? 'text-muted line-through' : 'text-ink'}`}>{f.texto}</p>
                {f.anulado && f.motivo_anulacion && <p className="text-[11px] text-danger mt-1">Motivo: {f.motivo_anulacion}</p>}
                {f.fotos?.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {f.fotos.map((foto: any) => foto.url
                      ? (
                        <a key={foto.id} href={foto.url} target="_blank" rel="noreferrer" title={foto.nombre}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={foto.url} alt={foto.nombre} loading="lazy" className="w-20 h-20 object-cover rounded-lg border border-line" />
                        </a>
                      )
                      : <span key={foto.id} className="text-[11px] text-muted">{foto.nombre}</span>)}
                  </div>
                )}
                {f.autor && <div className="text-[10.5px] text-subtle mt-1.5">{f.autor}</div>}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

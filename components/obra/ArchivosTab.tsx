'use client'
// components/obra/ArchivosTab.tsx — Pestaña Archivos del workspace (Fase 2).
// Reusa la infraestructura existente: bucket 'proyecto-docs' + /api/documentos.

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase'
import { CATEGORIAS_DOC, type Documento, type CategoriaDocumento } from '@/types/documento'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB (mismo límite que DocumentosPanel)

const fmtFecha = (iso?: string) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) }
  catch { return '' }
}

const catMap = Object.fromEntries(CATEGORIAS_DOC.map(c => [c.value, c]))

function categoriaAuto(file: File): CategoriaDocumento {
  if (file.type.startsWith('image/')) return 'foto'
  if (/\.(dwg|dxf)$/i.test(file.name)) return 'plano'
  return 'general'
}

export default function ArchivosTab({ proyectoId }: { proyectoId: string }) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const { data: docs, mutate } = useSWR<Documento[]>(`/api/documentos?proyecto_id=${proyectoId}`)
  const lista = Array.isArray(docs) ? docs : []

  const subir = async (file: File) => {
    setError('')
    if (file.size > MAX_SIZE) { setError('El archivo supera los 20 MB.'); return }
    setSubiendo(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesión expirada')

      // Carpeta del dueño de la organización (igual que DocumentosPanel)
      let ownerId = user.id
      try {
        const rol = await (await fetch('/api/mi-rol')).json()
        if (rol?.owner_id) ownerId = rol.owner_id
      } catch { /* usa user.id */ }

      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${ownerId}/${proyectoId}/${Date.now()}_${safe}`

      // ArrayBuffer + contentType: evita "No content provided" con File directo
      const buffer = await file.arrayBuffer()
      if (buffer.byteLength === 0) throw new Error('El archivo está vacío o no se pudo leer.')

      const { error: upErr } = await supabase.storage
        .from('proyecto-docs')
        .upload(path, buffer, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
        })
      if (upErr) throw new Error(upErr.message)

      const res = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proyecto_id: proyectoId,
          nombre: file.name,
          descripcion: null,
          categoria: categoriaAuto(file),
          archivo_path: path,
          archivo_tipo: file.type || 'application/octet-stream',
          archivo_size: file.size,
        }),
      })
      if (!res.ok) {
        await supabase.storage.from('proyecto-docs').remove([path])
        throw new Error((await res.json())?.error ?? 'No se pudo registrar el documento')
      }
      mutate()
    } catch (e: any) {
      setError(e?.message ?? 'Error al subir el archivo')
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const abrir = async (doc: Documento) => {
    const { data, error: e } = await supabase.storage
      .from('proyecto-docs')
      .createSignedUrl(doc.archivo_path, 60)
    if (e || !data?.signedUrl) { setError('No se pudo abrir el archivo.'); return }
    window.open(data.signedUrl, '_blank')
  }

  const eliminar = async (doc: Documento) => {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return
    const res = await fetch('/api/documentos', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: doc.id }),
    })
    if (res.ok) mutate()
    else setError('No se pudo eliminar.')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-muted">
          Todo lo del proyecto en un lugar: archivos subidos, fotos de bitácora, OCs y facturas.
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className={[
            'px-4 py-2 rounded-xl text-white text-[13px] font-bold transition',
            subiendo ? 'bg-om/40 cursor-wait' : 'bg-om hover:bg-om-dark',
          ].join(' ')}
        >
          {subiendo ? 'Subiendo…' : 'Subir archivo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }}
        />
      </div>

      {error && <p className="text-[12.5px] text-danger font-semibold mb-3">{error}</p>}

      {lista.length === 0 && !subiendo && (
        <div className="bg-white rounded-card border border-dashed border-line2 p-10 text-center">
          <div className="text-[15px] font-bold text-ink">Sin archivos aún</div>
          <p className="text-muted text-[13px] mt-1">
            Sube planos, fotos de avance, permisos o facturas del proyecto.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map(doc => {
          const cat = catMap[doc.categoria] ?? catMap.general
          return (
            <div key={doc.id} className="bg-white rounded-card border border-line shadow-card p-4 group">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  {cat.icon} {cat.label}
                </span>
                <button
                  onClick={() => eliminar(doc)}
                  title="Eliminar"
                  className="text-subtle hover:text-danger transition text-[14px] opacity-0 group-hover:opacity-100"
                >
                 
                </button>
              </div>
              <div className="font-bold text-ink text-[13.5px] mt-2.5 break-words leading-snug">
                {doc.nombre}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11.5px] text-subtle">{fmtFecha(doc.created_at)}</span>
                <button
                  onClick={() => abrir(doc)}
                  className="text-[12.5px] font-bold text-om hover:text-om-dark transition"
                >
                  Abrir ↗
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

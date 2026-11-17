'use client'
// components/DocumentosPanel.tsx
//
// Panel reutilizable para subir y ver documentos de un proyecto.
// Se embebe en la página de detalle de proyecto.
// Soporta: drag-and-drop, categorización, preview de imágenes, descarga directa.

import { useState, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase'
import { Btn, FormInput, FormSelect, Modal, SectionTitle } from '@/components/ui'
import { CATEGORIAS_DOC, type Documento, type CategoriaDocumento } from '@/types/documento'
import { avisar, confirmar } from '@/lib/avisos'
import { usePermisos } from '@/lib/usePermisos'
import { esNativo, guardarArchivo } from '@/lib/nativo'
import { subirVarios } from '@/lib/subir-documento'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const fmtFecha = (iso?: string) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

const catMap = Object.fromEntries(CATEGORIAS_DOC.map(c => [c.value, c]))

// Iconos por tipo de archivo
const fileIcon = (tipo?: string) => {
  if (!tipo) return ''
  if (tipo.startsWith('image/')) return ''
  if (tipo === 'application/pdf') return ''
  if (tipo.includes('dwg') || tipo.includes('autocad') || tipo.includes('acad')) return ''
  if (tipo.includes('spreadsheet') || tipo.includes('excel') || tipo.includes('xlsx')) return ''
  if (tipo.includes('word') || tipo.includes('docx')) return ''
  return ''
}

interface Props {
  proyectoId: string
  proyectoNombre?: string
}

export default function DocumentosPanel({ proyectoId, proyectoNombre }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [docs, setDocs]           = useState<Documento[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState<string | null>(null)
  const [filtro, setFiltro]       = useState<string>('todos')
  const [dragging, setDragging]   = useState(false)

  // Form para categoría/descripción al subir
  // Varios a la vez: comparten categoría y descripción
  const [pendientes, setPendientes] = useState<File[]>([])
  const pendingFile = pendientes[0] ?? null
  const [uploadForm, setUploadForm]  = useState<{ categoria: CategoriaDocumento; descripcion: string }>({ categoria: 'general', descripcion: '' })

  // ─── Cargar documentos ────────────────────────────────────
  // En caché: volver a la pestaña no vuelve a esperar la lista
  const swrDocs = useSWR<Documento[]>(`/api/documentos?proyecto_id=${proyectoId}`)
  useEffect(() => {
    if (swrDocs.data !== undefined || swrDocs.error) setDocs(Array.isArray(swrDocs.data) ? swrDocs.data : [])
    setLoading(swrDocs.data === undefined && !swrDocs.error)
  }, [swrDocs.data, swrDocs.error])
  const { mutate: mutDocs } = swrDocs
  const load = useCallback(async () => { await mutDocs() }, [mutDocs])

  // ─── Subir archivo ────────────────────────────────────────
  const handleFileSelect = (lista: FileList | File[] | null | undefined) => {
    const files = Array.from(lista ?? [])
    if (files.length === 0) return
    // Las imágenes se achican antes de subir: solo se rechaza de entrada lo que no es imagen y pasa el máximo
    const grandes = files.filter(f => f.size > MAX_SIZE && !f.type.startsWith('image/'))
    if (grandes.length) avisar(`${grandes.map(f => f.name).join(', ')}: supera los 20 MB y no se subirá.`)
    const validos = files.filter(f => !grandes.includes(f))
    if (validos.length === 0) return
    // Abrir mini-modal para categoría
    setPendientes(validos)
    const cats = new Set(validos.map(guessCategoria))
    setUploadForm({ categoria: cats.size === 1 ? [...cats][0] : 'general', descripcion: '' })
  }

  const guessCategoria = (file: File): CategoriaDocumento => {
    const name = file.name.toLowerCase()
    const type = file.type
    if (name.endsWith('.dwg') || name.endsWith('.dxf')) return 'plano'
    if (type.startsWith('image/')) return 'foto'
    if (name.includes('contrato')) return 'contrato'
    if (name.includes('permiso') || name.includes('dom')) return 'permiso'
    if (name.includes('presupuesto') || name.includes('cotizacion')) return 'presupuesto'
    if (name.includes('eett') || name.includes('especificacion')) return 'especificacion'
    return 'general'
  }

  const doUpload = async () => {
    if (pendientes.length === 0) return
    setUploading(true)
    setProgress(`Subiendo 0 de ${pendientes.length}…`)
    const fallidos = await subirVarios(supabase, proyectoId, pendientes,
      { categoria: uploadForm.categoria, descripcion: uploadForm.descripcion || null },
      (listos, total) => setProgress(`Subiendo ${listos} de ${total}…`))
    if (fallidos.length) avisar(`No se subieron ${fallidos.length}: ${fallidos.map(f => `${f.archivo} (${f.error})`).join('; ')}`)
    setPendientes([])
    setUploading(false)
    setProgress(null)
    await load()
  }

  // ─── Descargar archivo ────────────────────────────────────
  const descargar = async (doc: Documento) => {
    const { data, error } = await supabase.storage
      .from('proyecto-docs')
      .createSignedUrl(doc.archivo_path, 60) // URL válida 60 segundos

    if (error || !data?.signedUrl) {
      avisar('Error al generar enlace de descarga')
      return
    }

    if (esNativo()) {
      try {
        const res = await fetch(data.signedUrl)
        if (!res.ok) throw new Error()
        await guardarArchivo(await res.blob(), doc.nombre)
      } catch {
        avisar('No se pudo descargar el documento')
      }
      return
    }

    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = doc.nombre
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ─── Eliminar documento ───────────────────────────────────
  const eliminar = async (id: string) => {
    if (!(await confirmar('¿Eliminar este documento permanentemente?'))) return
    await fetch('/api/documentos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  // ─── Drag & Drop handlers ────────────────────────────────
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // ─── Filtrado ─────────────────────────────────────────────
  const filtered = filtro === 'todos' ? docs : docs.filter(d => d.categoria === filtro)

  return (
    <div>
      {/* ─── ZONA DE SUBIDA ─── */}
      {puedeEditar && (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`rounded-[10px] px-5 py-6 text-center cursor-pointer mb-4 transition-all duration-150 border-2 border-dashed ${
          dragging
            ? 'border-brand bg-[#FCEAE3]'
            : 'border-[#d1d9e6] bg-[#f8fafc]'
        }`}
      >
        <input ref={fileRef} type="file" className="hidden" multiple
          accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.rar"
          onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
        />
        <div className="text-[28px] mb-1.5"></div>
        <div className="text-[13px] font-semibold text-[#1a2535]">
          {dragging ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz clic para subir'}
        </div>
        <div className="text-[11px] text-muted mt-1">
          PDF, DWG, imágenes, Word, Excel, ZIP — Máximo 20 MB
        </div>
      </div>
      )}

      {/* ─── FILTRO POR CATEGORÍA ─── */}
      {docs.length > 0 && (
        <div className="flex gap-1.5 mb-3.5 flex-wrap">
          <button
            onClick={() => setFiltro('todos')}
            className={`px-3 py-1 rounded-card border text-[11px] font-semibold cursor-pointer ${
              filtro === 'todos'
                ? 'border-brand bg-brand text-white'
                : 'border-[#d1d9e6] bg-white text-muted'
            }`}
          >
            Todos ({docs.length})
          </button>
          {CATEGORIAS_DOC.map(c => {
            const count = docs.filter(d => d.categoria === c.value).length
            if (count === 0) return null
            return (
              <button
                key={c.value}
                onClick={() => setFiltro(c.value)}
                className={`px-3 py-1 rounded-card border text-[11px] font-semibold cursor-pointer ${
                  filtro === c.value
                    ? 'border-brand bg-brand text-white'
                    : 'border-[#d1d9e6] bg-white text-muted'
                }`}
              >
                {c.icon} {c.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* ─── LISTA DE DOCUMENTOS ─── */}
      {loading
        ? <p className="text-muted text-center p-5">Cargando documentos...</p>
        : filtered.length === 0
        ? <p className="text-muted text-center p-5 text-[13px]">
            {docs.length === 0 ? 'Aún no hay documentos en esta obra.' : 'Sin documentos en esta categoría.'}
          </p>
        : (
          <div className="flex flex-col gap-2">
            {filtered.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 bg-white border border-[#e4e9f0] rounded-lg px-3.5 py-2.5"
              >
                {/* Icono */}
                <div className="text-2xl shrink-0">
                  {fileIcon(doc.archivo_tipo)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#1a2535] overflow-hidden text-ellipsis whitespace-nowrap">
                    {doc.nombre}
                  </div>
                  <div className="flex gap-2 text-[11px] text-muted mt-0.5">
                    <span className="bg-canvas px-1.5 py-px rounded font-semibold">
                      {catMap[doc.categoria]?.icon} {catMap[doc.categoria]?.label || doc.categoria}
                    </span>
                    <span>{fmtSize(doc.archivo_size)}</span>
                    <span>{fmtFecha(doc.created_at)}</span>
                  </div>
                  {doc.descripcion && (
                    <div className="text-[11px] text-muted mt-0.5">{doc.descripcion}</div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => descargar(doc)}
                    title="Descargar"
                    className="w-7 h-7 rounded-[6px] border-none bg-[#FCEAE3] text-brand text-[14px] font-bold cursor-pointer flex items-center justify-center"
                  >
                    ↓
                  </button>
                  {puedeEditar && (<button
                    onClick={() => eliminar(doc.id)}
                    title="Eliminar"
                    className="w-7 h-7 rounded-[6px] border-none bg-danger-bg text-danger text-[14px] font-bold cursor-pointer flex items-center justify-center"
                  >
                    ✕
                  </button>)}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* ─── MODAL DE UPLOAD (categoría + descripción) ─── */}
      {pendingFile && (
        <Modal title={pendientes.length === 1 ? 'Subir documento' : `Subir ${pendientes.length} documentos`} onClose={() => { if (!uploading) setPendientes([]) }}>
          <div className="bg-canvas rounded-lg px-4 py-3 mb-3.5 flex items-center gap-2.5">
            <span className="text-[22px]">{fileIcon(pendingFile.type)}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#1a2535] truncate">
                {pendientes.length === 1 ? pendingFile.name : `${pendingFile.name} y ${pendientes.length - 1} más`}
              </div>
              <div className="text-[11px] text-muted">{fmtSize(pendientes.reduce((t, f) => t + f.size, 0))}{pendientes.some(f => f.type.startsWith('image/')) ? ' · las fotos se achican antes de subir' : ''}</div>
            </div>
          </div>

          <FormSelect
            label="Categoría"
            value={uploadForm.categoria}
            onChange={v => setUploadForm(f => ({ ...f, categoria: v as CategoriaDocumento }))}
            options={CATEGORIAS_DOC.map(c => ({ value: c.value, label: `${c.icon} ${c.label}` }))}
          />

          <FormInput
            label="Descripción (opcional)"
            value={uploadForm.descripcion}
            onChange={v => setUploadForm(f => ({ ...f, descripcion: v }))}
            placeholder="Ej: Planta primer piso - Rev. 3"
          />

          {progress && (
            <div className="text-[12px] text-brand mt-2">{progress}</div>
          )}

          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setPendientes([])} disabled={uploading}>Cancelar</Btn>
            <Btn variant="primary" onClick={doUpload} disabled={uploading}>
              {uploading ? 'Subiendo...' : pendientes.length === 1 ? 'Subir documento' : `Subir ${pendientes.length}`}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

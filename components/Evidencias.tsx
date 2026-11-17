'use client'
// components/Evidencias.tsx
// Fotos y respaldos de CUALQUIER registro de la obra: una partida o vivienda, un estado de
// pago, un parte diario, una recepción, un subcontrato… Se usa igual en todas partes:
//   <Evidencias proyectoId={id} entidadTipo="estado_pago" entidadId={ep.id} />
// Requiere sql/53. Las fotos se achican antes de subir y van varias a la vez.

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase'
import { fetcher } from '@/lib/fetcher'
import { subirVarios, ubicacionActual } from '@/lib/subir-documento'
import { esFaltaDeSenal, guardarFoto } from '@/lib/fotos-pendientes'
import { confirmar } from '@/lib/avisos'
import { usePermisos } from '@/lib/usePermisos'
import type { EntidadEvidencia } from '@/lib/validar'

type Etapa = 'antes' | 'durante' | 'despues'
const ETAPAS: { id: Etapa; label: string }[] = [
  { id: 'antes', label: 'Antes' },
  { id: 'durante', label: 'Durante' },
  { id: 'despues', label: 'Después' },
]

interface Props {
  /** Sin obra solo para contratos, facturas y órdenes de compra. */
  proyectoId: string | null
  entidadTipo: EntidadEvidencia
  entidadId: string
  /** Partida o vivienda a la que pertenece el registro, para armar su carpeta. */
  partidaId?: string | null
  /** Muestra antes / durante / después (viviendas y partidas). */
  conEtapas?: boolean
  titulo?: string
  /** Solo el botón y el contador; las fotos se abren al tocar. */
  compacto?: boolean
  /** Quién puede subir: por defecto, quien edita la obra. */
  editable?: boolean
}

export default function Evidencias({ proyectoId, entidadTipo, entidadId, partidaId, conEtapas, titulo = 'Evidencia', compacto, editable }: Props) {
  const permisos = usePermisos('obra')
  const puedeEditar = editable ?? permisos.puedeEditar
  const clave = `/api/documentos?${proyectoId ? `proyecto_id=${proyectoId}&` : ''}entidad_tipo=${entidadTipo}&entidad_id=${entidadId}&urls=1`
  const [abierto, setAbierto] = useState(!compacto)
  // En compacto no consulta hasta que se abre: una lista larga no dispara una consulta por fila
  const { data, error, mutate } = useSWR<any[]>(abierto ? clave : null, fetcher)
  const camara = useRef<HTMLInputElement>(null)
  const archivos = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>('durante')
  const [progreso, setProgreso] = useState('')
  const [msg, setMsg] = useState('')

  const docs = Array.isArray(data) ? data : []

  // desdeCamara: la foto se acaba de tomar, así que la ubicación actual es la de la foto
  const subir = async (lista: FileList | null, desdeCamara = false) => {
    const files = Array.from(lista ?? [])
    if (files.length === 0) return
    const donde = desdeCamara ? await ubicacionActual() : null
    setMsg('')
    setProgreso(`Subiendo 0 de ${files.length}…`)
    const fallidos = await subirVarios(createClient(), proyectoId, files, {
      entidad_tipo: entidadTipo, entidad_id: entidadId, partida_id: partidaId ?? undefined,
      etapa: conEtapas ? etapa : undefined,
      ...(donde ?? {}),
    }, (listos, total) => setProgreso(`Subiendo ${listos} de ${total}…`))
    setProgreso('')
    // Sin señal: quedan en el teléfono y se suben solas cuando vuelva
    const sinSenal = fallidos.filter(f => esFaltaDeSenal(f.causa))
    let guardadas = 0
    if (sinSenal.length > 0) {
      const { data: { session } } = await createClient().auth.getSession()
      const extra = {
        entidad_tipo: entidadTipo, entidad_id: entidadId, partida_id: partidaId ?? undefined,
        etapa: conEtapas ? etapa : undefined, ...(donde ?? {}),
      }
      for (const f of sinSenal) {
        try { await guardarFoto(session?.user?.email ?? '', proyectoId, f.file, extra); guardadas++ } catch { /* sin IndexedDB */ }
      }
    }
    const perdidas = fallidos.length - guardadas
    if (guardadas > 0) setMsg(`Sin señal: ${guardadas === 1 ? 'la foto quedó' : `${guardadas} fotos quedaron`} en este teléfono y se ${guardadas === 1 ? 'subirá' : 'subirán'} sola${guardadas === 1 ? '' : 's'} cuando vuelva la conexión.${perdidas > 0 ? ` ${perdidas} no se pudieron guardar.` : ''}`)
    else if (perdidas > 0) setMsg(`No se subieron ${perdidas}: ${fallidos[0].error}`)
    setAbierto(true)
    await mutate()
  }

  const quitar = async (doc: any) => {
    if (!(await confirmar(`¿Eliminar "${doc.nombre}"?`))) return
    const res = await fetch('/api/documentos', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: doc.id }),
    })
    if (!res.ok) setMsg((await res.json().catch(() => ({})))?.error ?? 'No se pudo eliminar')
    await mutate()
  }

  const grupos = conEtapas
    ? [...ETAPAS.map(e => ({ label: e.label, items: docs.filter(d => d.etapa === e.id) })),
       { label: 'Sin etapa', items: docs.filter(d => !d.etapa) }].filter(g => g.items.length > 0)
    : [{ label: '', items: docs }]

  return (
    <div className="text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAbierto(a => !a)} className="font-bold text-ink bg-transparent border-none p-0 cursor-pointer">
          {titulo}{data ? ` (${docs.length})` : ''}
        </button>
        {puedeEditar && (
          <>
            {conEtapas && (
              <select value={etapa} onChange={e => setEtapa(e.target.value as Etapa)} aria-label="Etapa de la evidencia"
                className="px-2 py-1 border border-line2 rounded-md text-[12px] bg-white">
                {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            )}
            <button type="button" disabled={!!progreso} onClick={() => camara.current?.click()}
              className="px-2.5 py-1 rounded-md border border-line2 font-semibold text-ink bg-white disabled:opacity-50">Tomar foto</button>
            <button type="button" disabled={!!progreso} onClick={() => archivos.current?.click()}
              className="px-2.5 py-1 rounded-md border border-line2 font-semibold text-ink bg-white disabled:opacity-50">Adjuntar</button>
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Tomar foto"
              onChange={e => { subir(e.target.files, true); e.target.value = '' }} />
            <input ref={archivos} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" aria-label="Adjuntar archivos"
              onChange={e => { subir(e.target.files); e.target.value = '' }} />
          </>
        )}
        {progreso && <span className="text-muted">{progreso}</span>}
      </div>
      {msg && <div className={`mt-1.5 font-semibold ${msg.startsWith('Sin señal') ? 'text-warning' : 'text-danger'}`}>{msg}</div>}
      {error && !data && <div className="mt-1.5 text-muted">No se pudo cargar la evidencia.</div>}

      {abierto && grupos.map(g => (
        <div key={g.label} className="mt-2">
          {g.label && <div className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">{g.label}</div>}
          <div className="flex flex-wrap gap-2">
            {g.items.map(d => (
              <div key={d.id} className="relative group">
                <a href={d.url ?? '#'} target="_blank" rel="noreferrer" title={d.nombre}
                  className="block w-[72px] h-[72px] rounded-lg border border-line overflow-hidden bg-canvas">
                  {d.archivo_tipo?.startsWith('image/') && d.url
                    ? <img src={d.url} alt={d.nombre} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="flex items-center justify-center w-full h-full px-1 text-center text-[10px] font-semibold text-muted break-all">{d.nombre}</span>}
                </a>
                {puedeEditar && (
                  <button type="button" onClick={() => quitar(d)} aria-label={`Eliminar ${d.nombre}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-line2 text-[11px] leading-none text-muted hover:text-danger">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

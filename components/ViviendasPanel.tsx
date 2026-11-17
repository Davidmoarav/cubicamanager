'use client'
// components/ViviendasPanel.tsx
// Viviendas de un programa (SERVIU y similares): ficha del beneficiario, avance, estado,
// recepción y fotos por vivienda. El costo y el avance salen de las partidas de cada una.
// Requiere sql/54. Una obra única no usa esta pestaña.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, MetricCard, Modal, fmt } from '@/components/ui'
import Evidencias from '@/components/Evidencias'
import { avisar, confirmar } from '@/lib/avisos'
import { usePermisos } from '@/lib/usePermisos'
import type { EstadoVivienda, Proyecto, Vivienda } from '@/types'

const ESTADOS: { value: EstadoVivienda; label: string; bg: string; color: string }[] = [
  { value: 'pendiente',    label: 'Pendiente',    bg: '#F1ECE6', color: '#6b7a8d' },
  { value: 'en_ejecucion', label: 'En ejecución', bg: '#fef3d7', color: '#b07d1a' },
  { value: 'terminada',    label: 'Terminada',    bg: '#e6f0fa', color: '#1a5a9a' },
  { value: 'recepcionada', label: 'Recepcionada', bg: '#e6f4ed', color: '#1a7a4a' },
]
const PROGRAMAS = ['', 'DS27', 'DS49', 'DS10', 'DS255', 'DS19', 'Otro']

interface Respuesta {
  viviendas: Vivienda[]
  sin_ficha: { id: string; descripcion: string }[]
  tipos_partida?: string[]
  falta_migracion?: string
}

interface Props {
  proyecto: Proyecto
  /** Algo cambió en las partidas o en la obra: quien nos muestra debe recargar. */
  onCambio?: () => void
}

const enviar = async (metodo: string, cuerpo: any) => {
  const res = await fetch('/api/viviendas', { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error ?? 'No se pudo guardar')
  return j
}

export default function ViviendasPanel({ proyecto, onCambio }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, mutate } = useSWR<Respuesta>(`/api/viviendas?proyecto_id=${proyecto.id}`, fetcher)
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<string>('todas')
  const [form, setForm] = useState<any | null>(null)
  const [programa, setPrograma] = useState<any | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [masivo, setMasivo] = useState<{ partida: string; avance: string } | null>(null)
  const [carpeta, setCarpeta] = useState<{ id: string; texto: string } | null>(null)

  const viviendas = data?.viviendas ?? []
  const sinFicha = data?.sin_ficha ?? []

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return viviendas.filter(v =>
      (filtro === 'todas' || v.estado === filtro) &&
      (!q || [v.beneficiario, v.rut, v.direccion].some(t => (t ?? '').toLowerCase().includes(q))))
  }, [viviendas, buscar, filtro])

  const resumen = useMemo(() => {
    const total = viviendas.reduce((s, v) => s + (v.valor || 0), 0)
    const pond = viviendas.reduce((s, v) => s + (v.valor || 0) * (v.avance || 0), 0)
    return {
      total,
      avance: total > 0 ? Math.round(pond / total) : 0,
      porEstado: Object.fromEntries(ESTADOS.map(e => [e.value, viviendas.filter(v => v.estado === e.value).length])),
    }
  }, [viviendas])

  const hacer = async (fn: () => Promise<any>) => {
    setOcupado(true)
    try { await fn(); await mutate(); onCambio?.() }
    catch (e: any) { avisar(e?.message ?? 'No se pudo guardar') }
    finally { setOcupado(false) }
  }

  const guardar = () => hacer(async () => {
    const cuerpo = {
      ...form, proyecto_id: proyecto.id,
      subsidio_uf: form.subsidio_uf === '' || form.subsidio_uf == null ? null : Number(form.subsidio_uf),
      ahorro_uf: form.ahorro_uf === '' || form.ahorro_uf == null ? null : Number(form.ahorro_uf),
    }
    await enviar(form.id ? 'PUT' : 'POST', cuerpo)
    setForm(null)
  })

  const cambiarEstado = (ids: string[], estado: EstadoVivienda) => hacer(async () => {
    await enviar('PUT', ids.length === 1 ? { id: ids[0], estado } : { ids, estado })
    setMarcadas(new Set())
  })

  const convertir = async () => {
    if (!(await confirmar(`Los ${sinFicha.length} grupos principales de esta obra pasarán a ser viviendas, cada una con su ficha de beneficiario. Las partidas, el avance y los cobros no cambian. ¿Continuar?`))) return
    hacer(() => enviar('POST', { proyecto_id: proyecto.id, desde_grupos: true }))
  }

  const quitar = async (v: Vivienda) => {
    if (!(await confirmar(`¿Quitar la ficha de ${v.beneficiario}? Sus partidas y su avance se conservan como un grupo normal.`))) return
    hacer(async () => { await enviar('DELETE', { id: v.id }); setForm(null) })
  }

  const guardarPrograma = () => hacer(async () => {
    const res = await fetch('/api/proyectos', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: proyecto.id, ...programa }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'No se pudo guardar')
    setPrograma(null)
  })

  const avanceMasivo = () => hacer(async () => {
    const res = await fetch('/api/viviendas', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyecto.id, ids: [...marcadas], partida: masivo?.partida || '', avance: Number(masivo?.avance) }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.error ?? 'No se pudo registrar el avance')
    avisar(`Avance registrado en ${j.partidas} ${j.partidas === 1 ? 'partida' : 'partidas'}${j.terminadas ? `; ${j.terminadas} ${j.terminadas === 1 ? 'vivienda quedó terminada' : 'viviendas quedaron terminadas'}` : ''}.`, 'ok')
    setMasivo(null)
    setMarcadas(new Set())
  })

  const bajarCarpeta = async (v: Vivienda) => {
    setCarpeta({ id: v.id, texto: 'Preparando…' })
    try {
      const { descargarCarpetaVivienda } = await import('@/lib/carpeta-vivienda')
      await descargarCarpetaVivienda(proyecto, v, texto => setCarpeta({ id: v.id, texto }))
    } catch (e: any) {
      avisar('No se pudo generar la carpeta: ' + (e?.message ?? 'error'))
    } finally {
      setCarpeta(null)
    }
  }

  const marcar = (id: string) => setMarcadas(m => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (error && !data) return <p className="text-muted text-center py-10 text-[13px]">No se pudieron cargar las viviendas.</p>
  if (!data) return <p className="text-muted text-center py-10 text-[13px]">Cargando viviendas…</p>

  if (data.falta_migracion) {
    return (
      <div className="bg-warning-bg border border-[#f0dca8] rounded-xl px-4 py-3 text-[13px] text-ink">
        <strong>{data.falta_migracion}</strong> Hasta entonces la obra sigue funcionando como siempre, sin fichas de beneficiario.
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-[15px] font-extrabold text-ink">Viviendas del programa</h4>
          <div className="text-[12px] text-muted mt-0.5">
            {[proyecto.programa, proyecto.codigo_grupo && `Grupo ${proyecto.codigo_grupo}`, proyecto.comuna, proyecto.entidad_patrocinante, proyecto.resolucion]
              .filter(Boolean).join(' · ') || 'Sin datos del programa'}
            {puedeEditar && (
              <button onClick={() => setPrograma({
                programa: proyecto.programa ?? '', codigo_grupo: proyecto.codigo_grupo ?? '', comuna: proyecto.comuna ?? '',
                entidad_patrocinante: proyecto.entidad_patrocinante ?? '', resolucion: proyecto.resolucion ?? '',
              })} className="ml-2 font-semibold text-brand bg-transparent border-none p-0 cursor-pointer">Editar</button>
            )}
          </div>
        </div>
        {puedeEditar && <Btn variant="primary" onClick={() => setForm({ beneficiario: '', estado: 'pendiente' })}>+ Vivienda</Btn>}
      </div>

      {sinFicha.length > 0 && puedeEditar && (
        <div className="bg-brand-bg border border-line rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className="text-ink">
            Esta obra tiene <strong>{sinFicha.length} {sinFicha.length === 1 ? 'grupo principal' : 'grupos principales'}</strong> sin ficha de vivienda
            {viviendas.length === 0 ? '. Si cada uno es la casa de un beneficiario, conviértelos en viviendas.' : '.'}
          </span>
          <Btn onClick={convertir} disabled={ocupado}>Convertir en viviendas</Btn>
        </div>
      )}

      {viviendas.length === 0 ? (
        <p className="text-muted text-center py-10 text-[13px]">
          Sin viviendas. Agrégalas una a una, importa un programa desde Partidas y avance, o trae un grupo desde el Filtro DS27.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Viviendas" value={viviendas.length} sub={`${resumen.porEstado.pendiente} pendientes`} />
            <MetricCard label="En ejecución" value={resumen.porEstado.en_ejecucion} sub={`Avance del programa ${resumen.avance}%`} />
            <MetricCard label="Terminadas" value={resumen.porEstado.terminada} sub="Por recepcionar" />
            <MetricCard label="Recepcionadas" value={resumen.porEstado.recepcionada} sub={`Obra ${fmt(resumen.total)} neto`} />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, RUT o dirección"
              aria-label="Buscar vivienda" className="input-base !mb-0 max-w-[280px]" />
            <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por estado"
              className="input-base !mb-0 max-w-[170px] cursor-pointer">
              <option value="todas">Todos los estados</option>
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            {puedeEditar && marcadas.size > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                {marcadas.size} marcadas:
                <button disabled={ocupado} onClick={() => setMasivo({ partida: '', avance: '100' })}
                  className="px-2 py-1 rounded-md border border-brand bg-brand-bg font-semibold text-brand disabled:opacity-50">Registrar avance</button>
                {ESTADOS.map(e => (
                  <button key={e.value} disabled={ocupado} onClick={() => cambiarEstado([...marcadas], e.value)}
                    className="px-2 py-1 rounded-md border border-line2 bg-white font-semibold text-ink disabled:opacity-50">{e.label}</button>
                ))}
              </span>
            )}
          </div>

          <div className="flex flex-col">
            {visibles.map(v => {
              const est = ESTADOS.find(e => e.value === v.estado) ?? ESTADOS[0]
              return (
                <div key={v.id} className="border-b border-canvas py-2.5">
                  <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                    {puedeEditar
                      ? <input type="checkbox" checked={marcadas.has(v.id)} onChange={() => marcar(v.id)} aria-label={`Marcar ${v.beneficiario}`} />
                      : <span />}
                    <button onClick={() => setAbierta(a => a === v.id ? null : v.id)} aria-expanded={abierta === v.id}
                      className="min-w-0 text-left bg-transparent border-none p-0 cursor-pointer">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-ink truncate">{v.beneficiario}</span>
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ background: est.bg, color: est.color }}>{est.label}</span>
                      </div>
                      <div className="text-[11.5px] text-muted truncate">
                        {[v.rut, v.direccion, v.subsidio_uf != null && `Subsidio ${Number(v.subsidio_uf).toLocaleString('es-CL')} UF`].filter(Boolean).join(' · ') || 'Sin datos del beneficiario'}
                      </div>
                      <div className="h-1.5 bg-[#EDE7E0] rounded-full overflow-hidden mt-1.5 max-w-[420px]">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, v.avance || 0)}%` }} />
                      </div>
                    </button>
                    <div className="text-right">
                      <div className="text-[13px] font-extrabold text-ink tabular-nums">{v.avance || 0}%</div>
                      <div className="text-[11px] text-muted tabular-nums">{fmt(v.valor || 0)}</div>
                    </div>
                  </div>

                  {abierta === v.id && (
                    <div className="mt-2.5 ml-7 pl-3 border-l-2 border-line">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted mb-2">
                        <span>{v.partidas ?? 0} partidas</span>
                        {v.rol_avaluo && <span>Rol {v.rol_avaluo}</span>}
                        {v.telefono && <span>Tel. {v.telefono}</span>}
                        {v.fecha_inicio && <span>Inicio {v.fecha_inicio}</span>}
                        {v.fecha_termino && <span>Término {v.fecha_termino}</span>}
                        {v.fecha_recepcion && <span>Recepción {v.fecha_recepcion}</span>}
                        {v.notas && <span className="text-ink">{v.notas}</span>}
                      </div>
                      <Evidencias proyectoId={proyecto.id} entidadTipo="partida" entidadId={v.partida_id} partidaId={v.partida_id}
                        conEtapas titulo="Fotos y respaldos de la vivienda" />
                      {puedeEditar && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <Btn onClick={() => setForm({ ...v })} className="!text-[11px] !px-[10px] !py-1">Editar ficha</Btn>
                          <Btn disabled={!!carpeta} onClick={() => bajarCarpeta(v)} className="!text-[11px] !px-[10px] !py-1">
                            {carpeta?.id === v.id ? carpeta.texto : 'Carpeta PDF'}
                          </Btn>
                          {ESTADOS.filter(e => e.value !== v.estado).map(e => (
                            <Btn key={e.value} disabled={ocupado} onClick={() => cambiarEstado([v.id], e.value)}
                              className="!text-[11px] !px-[10px] !py-1">Marcar {e.label.toLowerCase()}</Btn>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {visibles.length === 0 && <p className="text-muted text-center py-6 text-[13px]">Ninguna vivienda coincide con el filtro.</p>}
          </div>
        </>
      )}

      {form && (
        <Modal title={form.id ? `Ficha de ${form.beneficiario || 'vivienda'}` : 'Nueva vivienda'} onClose={() => setForm(null)}>
          <FormInput label="Beneficiario *" value={form.beneficiario ?? ''} onChange={v => setForm((f: any) => ({ ...f, beneficiario: v }))} placeholder="Nombre completo" />
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="RUT" value={form.rut ?? ''} onChange={v => setForm((f: any) => ({ ...f, rut: v }))} placeholder="12.345.678-9" />
            <FormInput label="Teléfono" value={form.telefono ?? ''} onChange={v => setForm((f: any) => ({ ...f, telefono: v }))} />
          </div>
          <FormInput label="Dirección" value={form.direccion ?? ''} onChange={v => setForm((f: any) => ({ ...f, direccion: v }))} />
          <div className="grid grid-cols-3 gap-3">
            <FormInput label="Rol de avalúo" value={form.rol_avaluo ?? ''} onChange={v => setForm((f: any) => ({ ...f, rol_avaluo: v }))} />
            <FormInput label="Subsidio (UF)" type="number" value={form.subsidio_uf ?? ''} onChange={v => setForm((f: any) => ({ ...f, subsidio_uf: v }))} />
            <FormInput label="Ahorro (UF)" type="number" value={form.ahorro_uf ?? ''} onChange={v => setForm((f: any) => ({ ...f, ahorro_uf: v }))} />
          </div>
          <FormSelect label="Estado" value={form.estado ?? 'pendiente'} onChange={v => setForm((f: any) => ({ ...f, estado: v }))}
            options={ESTADOS.map(e => ({ value: e.value, label: e.label }))} />
          <div className="grid grid-cols-3 gap-3">
            <FormInput label="Inicio" type="date" value={form.fecha_inicio ?? ''} onChange={v => setForm((f: any) => ({ ...f, fecha_inicio: v }))} />
            <FormInput label="Término" type="date" value={form.fecha_termino ?? ''} onChange={v => setForm((f: any) => ({ ...f, fecha_termino: v }))} />
            <FormInput label="Recepción" type="date" value={form.fecha_recepcion ?? ''} onChange={v => setForm((f: any) => ({ ...f, fecha_recepcion: v }))} />
          </div>
          <FormInput label="Notas" value={form.notas ?? ''} onChange={v => setForm((f: any) => ({ ...f, notas: v }))} />
          <div className="flex gap-2 justify-end mt-3.5">
            {form.id && <button onClick={() => quitar(form)} className="text-[12px] text-danger font-semibold mr-auto">Quitar ficha</button>}
            <Btn onClick={() => setForm(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardar} disabled={ocupado || !String(form.beneficiario ?? '').trim()}>{ocupado ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}

      {masivo && (
        <Modal title={`Avance en ${marcadas.size} ${marcadas.size === 1 ? 'vivienda' : 'viviendas'}`} onClose={() => setMasivo(null)}>
          <FormSelect label="Partida" value={masivo.partida} onChange={v => setMasivo(m => m && ({ ...m, partida: v }))}
            options={[{ value: '', label: 'Todas las partidas de la vivienda' }, ...(data.tipos_partida ?? []).map(t => ({ value: t, label: t }))]} />
          <FormInput label="Avance (%)" type="number" value={masivo.avance} onChange={v => setMasivo(m => m && ({ ...m, avance: v }))} />
          <p className="text-[12px] text-muted -mt-1">
            Se deja la partida en ese % en cada vivienda marcada que la tenga. Una vivienda que llega a 100% queda terminada.
          </p>
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setMasivo(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={avanceMasivo} disabled={ocupado || !(Number(masivo.avance) >= 0 && Number(masivo.avance) <= 100) || masivo.avance === ''}>
              {ocupado ? 'Guardando…' : 'Registrar'}
            </Btn>
          </div>
        </Modal>
      )}

      {programa && (
        <Modal title="Datos del programa" onClose={() => setPrograma(null)}>
          <FormSelect label="Programa" value={programa.programa} onChange={v => setPrograma((p: any) => ({ ...p, programa: v }))}
            options={PROGRAMAS.map(p => ({ value: p, label: p || 'Sin indicar' }))} />
          <div className="grid grid-cols-2 gap-3">
            <FormInput label="Código del grupo" value={programa.codigo_grupo} onChange={v => setPrograma((p: any) => ({ ...p, codigo_grupo: v }))} />
            <FormInput label="Comuna" value={programa.comuna} onChange={v => setPrograma((p: any) => ({ ...p, comuna: v }))} />
          </div>
          <FormInput label="Entidad patrocinante" value={programa.entidad_patrocinante} onChange={v => setPrograma((p: any) => ({ ...p, entidad_patrocinante: v }))} />
          <FormInput label="Resolución" value={programa.resolucion} onChange={v => setPrograma((p: any) => ({ ...p, resolucion: v }))} />
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setPrograma(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardarPrograma} disabled={ocupado}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

'use client'
// components/TratosPanel.tsx
// Tratos de mano de obra de una obra: lo pactado con un trabajador, una cuadrilla o un tercero,
// sus avances, la aprobación y el pago. Requiere sql/55.
//   Trabajadores → lo aprobado entra a la liquidación del mes.
//   Terceros     → lo aprobado es gasto directo de la obra.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, MetricCard, Modal, fmt } from '@/components/ui'
import Evidencias from '@/components/Evidencias'
import { confirmar } from '@/lib/avisos'
import { usePermisos } from '@/lib/usePermisos'
import { opcionesPartida } from '@/lib/costos'
import { TIPOS_TRATO, calcularAvanceTrato, montoPactado, tratoEnPorcentaje, type TipoTrato } from '@/lib/tratos'

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const EJECUTORES = [
  { value: 'cuadrilla', label: 'Cuadrilla (trabajadores de la empresa)' },
  { value: 'trabajador', label: 'Un trabajador de la empresa' },
  { value: 'tercero', label: 'Tercero (boleta o factura)' },
]
const REPARTOS = [
  { value: 'iguales', label: 'Partes iguales' },
  { value: 'porcentaje', label: 'Porcentajes pactados' },
  { value: 'dias', label: 'Días trabajados en la obra (parte diario)' },
]
const ESTADO_AVANCE: Record<string, { label: string; cls: string }> = {
  borrador: { label: 'Por aprobar', cls: 'bg-warning-bg text-warning' },
  aprobado: { label: 'Aprobado', cls: 'bg-[#e6f0fa] text-[#1a5a9a]' },
  pagado: { label: 'Pagado', cls: 'bg-[#e6f4ed] text-[#1a7a4a]' },
}
const unidadDe = (t: any) => tratoEnPorcentaje(t.tipo) ? '%' : t.tipo === 'por_hora' ? 'h' : t.tipo === 'por_dia' ? 'días' : (t.unidad || 'un')
const VACIO = {
  descripcion: '', tipo: 'unidad', ejecutor: 'cuadrilla', partida_id: '', unidad: 'm2', precio_unitario: '', cantidad_pactada: '',
  monto_fijo: '', retencion_pct: '', reparto: 'iguales', tercero_nombre: '', documento: 'boleta_honorarios', notas: '', participantes: [] as any[],
}

export default function TratosPanel({ proyectoId }: { proyectoId: string }) {
  const { puedeEditar } = usePermisos('obra')
  const { data, error, mutate } = useSWR<any>(`/api/tratos?proyecto_id=${proyectoId}`, fetcher)
  const { data: partidas = [] } = useSWR<any[]>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`, fetcher)

  const [form, setForm] = useState<any>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [avance, setAvance] = useState<{ cantidad: string; fecha: string; notas: string }>({ cantidad: '', fecha: hoyLocal(), notas: '' })
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const tratos: any[] = data?.tratos ?? []
  const empleados: any[] = data?.empleados ?? []
  const nombre = useMemo(() => new Map(empleados.map(e => [e.id, e.nombre])), [empleados])
  const opciones = useMemo(() => [{ value: '', label: '— Sin partida —' }, ...opcionesPartida(partidas)], [partidas])
  const nombrePartida = useMemo(() => new Map((Array.isArray(partidas) ? partidas : []).map(p => [p.id, p.descripcion])), [partidas])

  const totales = useMemo(() => tratos.filter(t => t.estado !== 'anulado').reduce((a, t) => ({
    pactado: a.pactado + t.resumen.pactado, ejecutado: a.ejecutado + t.resumen.ejecutado,
    por_aprobar: a.por_aprobar + t.resumen.por_aprobar, por_pagar: a.por_pagar + t.resumen.por_pagar,
  }), { pactado: 0, ejecutado: 0, por_aprobar: 0, por_pagar: 0 }), [tratos])

  const pedir = async (url: string, method: string, body: any) => {
    setMsg('')
    setOcupado(true)
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(j.error || 'No se pudo guardar'); return false }
      if (j.aviso) setMsg(j.aviso)
      await mutate()
      return true
    } finally { setOcupado(false) }
  }

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const enPct = form ? tratoEnPorcentaje(form.tipo as TipoTrato) : false

  const alternar = (id: string) => setForm((f: any) => {
    const esta = f.participantes.some((p: any) => p.empleado_id === id)
    if (f.ejecutor === 'trabajador') return { ...f, participantes: esta ? [] : [{ empleado_id: id, porcentaje: 100 }] }
    return { ...f, participantes: esta ? f.participantes.filter((p: any) => p.empleado_id !== id) : [...f.participantes, { empleado_id: id, porcentaje: 0 }] }
  })

  const guardar = async () => {
    const cuerpo = {
      ...form, proyecto_id: proyectoId,
      partida_id: form.partida_id || null,
      precio_unitario: enPct ? 0 : Math.round(Number(form.precio_unitario) || 0),
      cantidad_pactada: enPct ? 0 : Number(form.cantidad_pactada) || 0,
      monto_fijo: enPct ? Math.round(Number(form.monto_fijo) || 0) : 0,
      retencion_pct: Number(form.retencion_pct) || 0,
      documento: form.ejecutor === 'tercero' ? form.documento : null,
      tercero_nombre: form.ejecutor === 'tercero' ? form.tercero_nombre : null,
      participantes: form.ejecutor === 'tercero' ? [] : form.participantes.map((p: any) => ({ ...p, porcentaje: Number(p.porcentaje) || 0 })),
    }
    if (await pedir('/api/tratos', form.id ? 'PUT' : 'POST', cuerpo)) setForm(null)
  }

  const registrarAvance = async (t: any) => {
    if (await pedir('/api/tratos/avances', 'POST', { trato_id: t.id, cantidad: Number(avance.cantidad), fecha: avance.fecha, notas: avance.notas })) {
      setAvance({ cantidad: '', fecha: hoyLocal(), notas: '' })
    }
  }

  const eliminar = async (t: any) => {
    if (await confirmar(`¿Eliminar el trato "${t.descripcion}"?`)) pedir('/api/tratos', 'DELETE', { id: t.id })
  }

  if (error && !data) return <p className="text-muted text-center py-10 text-[13px]">No se pudieron cargar los tratos.</p>
  if (!data) return <p className="text-muted text-center py-10 text-[13px]">Cargando tratos…</p>
  if (data.falta_migracion) {
    return <div className="bg-warning-bg border border-[#f0dca8] rounded-xl px-4 py-3 text-[13px] text-ink"><strong>{data.falta_migracion}</strong></div>
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-[15px] font-extrabold text-ink">Tratos de mano de obra</h4>
          <p className="text-[12px] text-muted mt-0.5 max-w-[620px]">
            Lo aprobado a trabajadores entra a su liquidación del mes (es imponible). Lo aprobado a terceros es gasto directo de la obra.
          </p>
        </div>
        {puedeEditar && <Btn variant="primary" onClick={() => { setMsg(''); setForm({ ...VACIO, participantes: [] }) }}>+ Trato</Btn>}
      </div>

      {msg && <div className="mb-3 bg-brand-bg border border-line rounded-lg px-3 py-2 text-[12.5px] text-ink">{msg}</div>}

      {tratos.length === 0 ? (
        <p className="text-muted text-center py-10 text-[13px]">
          Sin tratos. Crea uno por unidad (m², ml), a suma alzada, por vivienda, por hora o por día.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Pactado" value={fmt(totales.pactado)} sub={`${tratos.filter(t => t.estado === 'vigente').length} vigentes`} />
            <MetricCard label="Ejecutado" value={fmt(totales.ejecutado)} sub="Aprobado o pagado" />
            <MetricCard label="Por aprobar" value={fmt(totales.por_aprobar)} sub="Avances registrados" />
            <MetricCard label="Por pagar" value={fmt(totales.por_pagar)} sub="Aprobado sin pagar" />
          </div>

          <div className="flex flex-col gap-3">
            {tratos.map(t => {
              const tipo = TIPOS_TRATO.find(x => x.value === t.tipo)
              const quien = t.ejecutor === 'tercero'
                ? `${t.tercero_nombre || 'Tercero'} · ${t.documento === 'factura' ? 'factura' : 'boleta de honorarios'}`
                : (t.participantes ?? []).map((p: any) => nombre.get(p.empleado_id) ?? 'Trabajador').join(', ')
              const u = unidadDe(t)
              const vista = Number(avance.cantidad) > 0 ? calcularAvanceTrato(t, Number(avance.cantidad)) : null
              return (
                <div key={t.id} className="border border-line rounded-xl overflow-hidden">
                  <button onClick={() => { setAbierto(a => a === t.id ? null : t.id); setAvance({ cantidad: '', fecha: hoyLocal(), notas: '' }) }}
                    aria-expanded={abierto === t.id} className="w-full text-left px-4 py-3 hover:bg-canvas transition">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ink">{t.descripcion}{t.estado !== 'vigente' ? ` · ${t.estado}` : ''}</div>
                        <div className="text-[11px] text-muted truncate">
                          {tipo?.label}
                          {!tratoEnPorcentaje(t.tipo) && ` · ${fmt(t.precio_unitario)} / ${u === 'días' ? 'día' : u}`}
                          {t.partida_id && nombrePartida.get(t.partida_id) ? ` · ${nombrePartida.get(t.partida_id)}` : ''}
                          {quien ? ` · ${quien}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-extrabold text-ink tabular-nums">
                          {fmt(t.resumen.ejecutado)}{t.resumen.pactado > 0 ? ` / ${fmt(t.resumen.pactado)}` : ''}
                        </div>
                        <div className="text-[11px] text-muted">
                          {t.resumen.pactado > 0 ? `Avance ${t.resumen.avance}%` : `${t.resumen.cantidad} ${u}`}
                          {t.resumen.por_aprobar > 0 ? ` · ${fmt(t.resumen.por_aprobar)} por aprobar` : ''}
                        </div>
                      </div>
                    </div>
                    {t.resumen.pactado > 0 && (
                      <div className="h-1.5 bg-[#EDE7E0] rounded-full overflow-hidden mt-2">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, t.resumen.avance)}%` }} />
                      </div>
                    )}
                  </button>

                  {abierto === t.id && (
                    <div className="px-4 pb-4 border-t border-line">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted py-3">
                        <span>Por pagar: <strong className="text-ink">{fmt(t.resumen.por_pagar)}</strong></span>
                        <span>Pagado: <strong className="text-ink">{fmt(t.resumen.pagado)}</strong></span>
                        {t.resumen.retenido > 0 && <span>Retenido ({Number(t.retencion_pct)}%): <strong className="text-ink">{fmt(t.resumen.retenido)}</strong></span>}
                        {t.resumen.pactado > 0 && <span>Saldo del trato: <strong className="text-ink">{fmt(t.resumen.saldo)}</strong></span>}
                        {t.ejecutor !== 'tercero' && <span>Reparto: <strong className="text-ink">{REPARTOS.find(r => r.value === t.reparto)?.label.toLowerCase()}</strong></span>}
                        {t.notas && <span className="text-ink">{t.notas}</span>}
                      </div>

                      <Evidencias proyectoId={proyectoId} entidadTipo="trato" entidadId={t.id} partidaId={t.partida_id} titulo="Acuerdo firmado y respaldos" compacto />

                      {t.avances.length > 0 && (
                        <div className="flex flex-col gap-2 my-3">
                          {t.avances.map((a: any) => {
                            const est = ESTADO_AVANCE[a.estado] ?? ESTADO_AVANCE.borrador
                            return (
                              <div key={a.id} className="bg-canvas rounded-lg px-3 py-2 text-[12px]">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div>
                                    <span className="font-bold text-ink">{a.fecha} · {Number(a.cantidad)} {u}</span>
                                    <span className={`ml-2 text-[10.5px] font-bold px-2 py-0.5 rounded ${est.cls}`}>{est.label}</span>
                                    {a.notas && <span className="ml-2 text-muted">{a.notas}</span>}
                                  </div>
                                  <div className="text-right tabular-nums">
                                    <span className="font-extrabold text-ink">{fmt(a.bruto)}</span>
                                    {Number(a.retencion) > 0 && <span className="text-muted"> · a pagar {fmt(a.neto)}</span>}
                                  </div>
                                </div>
                                {(a.reparto ?? []).length > 0 && (
                                  <div className="text-[11px] text-muted mt-1">
                                    {a.reparto.map((r: any) => `${nombre.get(r.empleado_id) ?? 'Trabajador'} ${fmt(r.monto)}`).join(' · ')}
                                  </div>
                                )}
                                <div className="mt-1.5">
                                  <Evidencias proyectoId={proyectoId} entidadTipo="trato_avance" entidadId={a.id} partidaId={t.partida_id} titulo="Fotos del avance" compacto />
                                </div>
                                {puedeEditar && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {a.estado === 'borrador' && <>
                                      <Btn disabled={ocupado} onClick={() => pedir('/api/tratos/avances', 'PUT', { id: a.id, estado: 'aprobado' })} className="!text-[11px] !px-[10px] !py-1">Aprobar</Btn>
                                      <Btn disabled={ocupado} onClick={() => pedir('/api/tratos/avances', 'DELETE', { id: a.id })} className="!text-[11px] !px-[10px] !py-1">Eliminar</Btn>
                                    </>}
                                    {a.estado === 'aprobado' && <>
                                      <Btn disabled={ocupado} onClick={() => pedir('/api/tratos/avances', 'PUT', { id: a.id, estado: 'pagado' })} className="!text-[11px] !px-[10px] !py-1">Marcar pagado</Btn>
                                      <Btn disabled={ocupado} onClick={() => pedir('/api/tratos/avances', 'PUT', { id: a.id, estado: 'borrador' })} className="!text-[11px] !px-[10px] !py-1">Deshacer aprobación</Btn>
                                    </>}
                                    {a.estado === 'pagado' && (
                                      <Btn disabled={ocupado} onClick={() => pedir('/api/tratos/avances', 'PUT', { id: a.id, estado: 'aprobado' })} className="!text-[11px] !px-[10px] !py-1">Deshacer pago</Btn>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {puedeEditar && t.estado === 'vigente' && (
                        <div className="mt-3 pt-3 border-t border-line">
                          <div className="text-[12px] font-bold text-ink mb-2">Registrar avance</div>
                          <div className="grid grid-cols-2 sm:grid-cols-[140px_150px_1fr_auto] gap-2 items-end">
                            <FormInput label={`Cantidad (${u})`} type="number" value={avance.cantidad} onChange={v => setAvance(a => ({ ...a, cantidad: v }))} />
                            <FormInput label="Fecha" type="date" value={avance.fecha} onChange={v => setAvance(a => ({ ...a, fecha: v }))} />
                            <FormInput label="Nota (opcional)" value={avance.notas} onChange={v => setAvance(a => ({ ...a, notas: v }))} />
                            <div className="mb-3"><Btn variant="primary" disabled={ocupado || !(Number(avance.cantidad) > 0)} onClick={() => registrarAvance(t)}>Registrar</Btn></div>
                          </div>
                          {vista && <div className="text-[11.5px] text-muted -mt-1">Vale {fmt(vista.bruto)}{vista.retencion > 0 ? ` · retención ${fmt(vista.retencion)} · a pagar ${fmt(vista.neto)}` : ''}. Queda por aprobar.</div>}
                        </div>
                      )}

                      {puedeEditar && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          <Btn onClick={() => { setMsg(''); setForm({ ...VACIO, ...t, partida_id: t.partida_id ?? '', participantes: (t.participantes ?? []).map((p: any) => ({ ...p })) }) }} className="!text-[11px] !px-[10px] !py-1">Editar trato</Btn>
                          {t.estado === 'vigente' && <Btn disabled={ocupado} onClick={() => pedir('/api/tratos', 'PUT', { id: t.id, estado: 'terminado' })} className="!text-[11px] !px-[10px] !py-1">Dar por terminado</Btn>}
                          {t.estado !== 'vigente' && <Btn disabled={ocupado} onClick={() => pedir('/api/tratos', 'PUT', { id: t.id, estado: 'vigente' })} className="!text-[11px] !px-[10px] !py-1">Reabrir</Btn>}
                          {t.estado === 'vigente' && <Btn disabled={ocupado} onClick={() => pedir('/api/tratos', 'PUT', { id: t.id, estado: 'anulado' })} className="!text-[11px] !px-[10px] !py-1">Anular</Btn>}
                          {t.resumen.ejecutado === 0 && <Btn disabled={ocupado} onClick={() => eliminar(t)} className="!text-[11px] !px-[10px] !py-1">Eliminar</Btn>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {form && (
        <Modal title={form.id ? 'Editar trato' : 'Nuevo trato'} onClose={() => setForm(null)} wide>
          <FormInput label="Qué se pacta *" value={form.descripcion} onChange={v => upd('descripcion', v)} placeholder="Ej: Instalación EIFS muros, casa Rosa Soto" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormSelect label="Tipo de trato" value={form.tipo} onChange={v => upd('tipo', v)} options={TIPOS_TRATO.map(t => ({ value: t.value, label: t.label }))} />
            <FormSelect label="Partida o vivienda" value={form.partida_id ?? ''} onChange={v => upd('partida_id', v)} options={opciones} />
          </div>
          <p className="text-[11.5px] text-muted -mt-2 mb-3">{TIPOS_TRATO.find(t => t.value === form.tipo)?.ayuda}.</p>

          {enPct ? (
            <div className="grid grid-cols-2 gap-3">
              <FormInput label="Monto del trato ($)" type="number" value={form.monto_fijo ?? ''} onChange={v => upd('monto_fijo', v)} />
              <FormInput label="Retención (%)" type="number" value={form.retencion_pct ?? ''} onChange={v => upd('retencion_pct', v)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {form.tipo === 'unidad' && <FormInput label="Unidad" value={form.unidad ?? ''} onChange={v => upd('unidad', v)} placeholder="m2" />}
              <FormInput label={form.tipo === 'por_hora' ? 'Valor hora ($)' : form.tipo === 'por_dia' ? 'Valor día ($)' : 'Precio unitario ($)'} type="number" value={form.precio_unitario ?? ''} onChange={v => upd('precio_unitario', v)} />
              <FormInput label="Cantidad pactada" type="number" value={form.cantidad_pactada ?? ''} onChange={v => upd('cantidad_pactada', v)} placeholder="0 = abierto" />
              <FormInput label="Retención (%)" type="number" value={form.retencion_pct ?? ''} onChange={v => upd('retencion_pct', v)} />
            </div>
          )}
          <div className="text-[12px] text-muted -mt-1 mb-3">
            Total pactado: <strong className="text-brand">{fmt(montoPactado({ ...form, tipo: form.tipo }))}</strong>
          </div>

          <FormSelect label="Quién lo ejecuta" value={form.ejecutor} onChange={v => setForm((f: any) => ({ ...f, ejecutor: v, participantes: v === 'trabajador' ? f.participantes.slice(0, 1) : f.participantes }))} options={EJECUTORES} />

          {form.ejecutor === 'tercero' ? (
            <div className="grid grid-cols-2 gap-3">
              <FormInput label="Nombre del tercero *" value={form.tercero_nombre ?? ''} onChange={v => upd('tercero_nombre', v)} />
              <FormSelect label="Documento" value={form.documento ?? 'boleta_honorarios'} onChange={v => upd('documento', v)}
                options={[{ value: 'boleta_honorarios', label: 'Boleta de honorarios' }, { value: 'factura', label: 'Factura' }]} />
            </div>
          ) : (
            <>
              {form.ejecutor === 'cuadrilla' && <FormSelect label="Cómo se reparte" value={form.reparto} onChange={v => upd('reparto', v)} options={REPARTOS} />}
              <div className="label-base">{form.ejecutor === 'trabajador' ? 'Trabajador' : 'Cuadrilla'}</div>
              <div className="max-h-[200px] overflow-y-auto border border-line rounded-lg mb-3">
                {empleados.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">No hay trabajadores activos.</div>}
                {empleados.map(e => {
                  const p = form.participantes.find((x: any) => x.empleado_id === e.id)
                  return (
                    <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-canvas text-[12.5px] cursor-pointer">
                      <input type={form.ejecutor === 'trabajador' ? 'radio' : 'checkbox'} checked={!!p} onChange={() => alternar(e.id)} />
                      <span className="flex-1 text-ink">{e.nombre}{e.cargo ? <span className="text-muted"> · {e.cargo}</span> : null}</span>
                      {p && form.ejecutor === 'cuadrilla' && form.reparto === 'porcentaje' && (
                        <input type="number" min="0" max="100" value={p.porcentaje ?? ''} aria-label={`Porcentaje de ${e.nombre}`}
                          onChange={ev => setForm((f: any) => ({ ...f, participantes: f.participantes.map((x: any) => x.empleado_id === e.id ? { ...x, porcentaje: ev.target.value } : x) }))}
                          className="w-16 px-1.5 py-1 border border-line2 rounded-md text-right text-[12px]" />
                      )}
                    </label>
                  )
                })}
              </div>
            </>
          )}

          <FormInput label="Notas" value={form.notas ?? ''} onChange={v => upd('notas', v)} />
          {msg && <p className="text-[12px] text-danger bg-danger-bg rounded-lg p-2.5">{msg}</p>}
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setForm(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardar} disabled={ocupado || !String(form.descripcion).trim()}>{ocupado ? 'Guardando…' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

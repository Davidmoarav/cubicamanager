'use client'
// app/(protected)/auditoria/page.tsx
// Bitácora: quién cambió qué, cuándo, y qué valores cambiaron.

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { SectionTitle } from '@/components/ui'

const LABEL_ROL: Record<string, string> = {
  admin: 'Administrador', contador: 'Contador', jefe_obra: 'Jefe de obra',
}

// Campos con nombre legible
const CAMPO: Record<string, string> = {
  numero: 'número', monto: 'monto', neto: 'neto', iva: 'IVA', total: 'total',
  estado: 'estado', nombre: 'nombre', descripcion: 'descripción', cliente: 'cliente',
  proyecto: 'proyecto', avance: 'avance', cantidad: 'cantidad', precio_unitario: 'precio unitario',
  costo_unitario: 'costo unitario', markup_pct: 'markup %', sueldo: 'sueldo', valor: 'valor',
  fecha: 'fecha', emision: 'emisión', vencimiento: 'vencimiento', rol: 'rol',
  retencion_pct: 'retención %', proveedor: 'proveedor', razon_social: 'razón social',
  rut: 'RUT', precio: 'precio', liquido_pagar: 'líquido a pagar', proyecto_id: 'obra asignada',
  factura_id: 'factura asociada', estado_pago_id: 'estado de pago',
}

const esMonto = (c: string) => ['monto','neto','iva','total','valor','sueldo','precio','precio_unitario','costo_unitario','liquido_pagar','bruto','avance_obra'].includes(c)

function valorLegible(campo: string, v: any) {
  if (v === null || v === undefined || v === '') return '—'
  if (esMonto(campo)) {
    const n = Number(v)
    if (!isNaN(n)) return '$' + n.toLocaleString('es-CL')
  }
  const s = String(v)
  // No mostrar UUIDs crudos
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return '(vinculado)'
  return s.length > 40 ? s.slice(0, 40) + '…' : s
}

function fechaHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AuditoriaPage() {
  const [tabla, setTabla]   = useState('')
  const [actor, setActor]   = useState('')
  const [accion, setAccion] = useState('')
  const [desde, setDesde]   = useState('')
  const [hasta, setHasta]   = useState('')
  const [buscar, setBuscar] = useState('')
  const [limite, setLimite] = useState(50)
  const [abierto, setAbierto] = useState<number | null>(null)

  const qs = new URLSearchParams()
  if (tabla)  qs.set('tabla', tabla)
  if (actor)  qs.set('actor', actor)
  if (accion) qs.set('accion', accion)
  if (desde)  qs.set('desde', desde)
  if (hasta)  qs.set('hasta', hasta)
  if (buscar.trim()) qs.set('buscar', buscar.trim())
  qs.set('limit', String(limite))

  const { data: eventos = [], isLoading } = useSWR<any[]>(`/api/auditoria?${qs}`, fetcher)
  const { data: filtros } = useSWR<any>('/api/auditoria?filtros=1', fetcher)
  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)

  // Usuarios: los que tienen eventos + yo (aunque aún no haya registrado ninguno)
  const usuarios: string[] = [...new Set([
    ...(filtros?.usuarios ?? []),
    ...(miRol?.email ? [miRol.email] : []),
  ])].sort()
  const sinEventos = filtros && (filtros.total_eventos ?? 0) === 0

  const limpiar = () => { setTabla(''); setActor(''); setAccion(''); setDesde(''); setHasta(''); setBuscar('') }
  const hayFiltro = tabla || actor || accion || desde || hasta || buscar

  const colorAccion = (a: string) =>
    a === 'creó' ? 'bg-success-bg text-success'
    : a === 'eliminó' ? 'bg-danger-bg text-danger'
    : 'bg-brand-bg text-brand'

  return (
    <div className="p-6">
      <SectionTitle>Bitácora de cambios</SectionTitle>
      <p className="text-[13px] text-muted mb-5">
        Registro de todo cambio hecho en el sistema: quién lo hizo, cuándo, y qué valores cambiaron.
        El historial no se puede editar ni borrar.
      </p>

      {/* Filtros */}
      <div className="bg-white border border-line rounded-card p-4 shadow-card mb-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="text-[11px] text-muted block mb-1">Usuario</label>
            <select value={actor} onChange={e => setActor(e.target.value)} className="input-base !mb-0 !py-1.5 text-[12px]">
              <option value="">Todos</option>
              {usuarios.map((u: string) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Módulo</label>
            <select value={tabla} onChange={e => setTabla(e.target.value)} className="input-base !mb-0 !py-1.5 text-[12px]">
              <option value="">Todos</option>
              {(filtros?.tablas ?? []).map((t: any) => <option key={t.valor} value={t.valor}>{t.label}{t.tiene ? '' : ' (sin cambios aún)'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Acción</label>
            <select value={accion} onChange={e => setAccion(e.target.value)} className="input-base !mb-0 !py-1.5 text-[12px]">
              <option value="">Todas</option>
              <option value="creó">Creó</option>
              <option value="modificó">Modificó</option>
              <option value="eliminó">Eliminó</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="input-base !mb-0 !py-1.5 text-[12px]" />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="input-base !mb-0 !py-1.5 text-[12px]" />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Buscar</label>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="N° o nombre…" className="input-base !mb-0 !py-1.5 text-[12px]" />
          </div>
        </div>
        {hayFiltro && (
          <button onClick={limpiar} className="text-[12px] text-brand font-semibold mt-3 underline">Limpiar filtros</button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white border border-line rounded-card p-5 shadow-card">
        {isLoading
          ? <p className="text-muted text-center p-10">Cargando...</p>
          : eventos.length === 0
          ? <div className="text-center p-10">
              <p className="text-muted">{hayFiltro ? 'No hay cambios que coincidan con los filtros.' : 'Aún no hay cambios registrados.'}</p>
              {!hayFiltro && sinEventos && (
                <p className="text-[12px] text-subtle mt-2">
                  La bitácora empieza a registrar desde que se activa. Haz un cambio (por ejemplo, edita una factura) y aparecerá aquí.
                </p>
              )}
            </div>
          : (
            <div className="flex flex-col gap-1">
              {eventos.map(ev => {
                const expandido = abierto === ev.id
                const tieneDetalle = (ev.cambios?.length ?? 0) > 0 || ev.accion === 'eliminó'
                return (
                  <div key={ev.id} className="border-b border-line2 last:border-0">
                    <button onClick={() => setAbierto(expandido ? null : ev.id)}
                      className="w-full text-left py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 hover:bg-canvas/60 px-2 rounded transition">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colorAccion(ev.accion)}`}>
                        {ev.accion}
                      </span>
                      <span className="text-[13px] font-semibold text-ink">{ev.tabla_label}</span>
                      {ev.descripcion && <span className="text-[13px] text-muted">· {ev.descripcion}</span>}
                      <span className="text-[12px] text-muted ml-auto whitespace-nowrap">
                        {ev.actor_email || '—'}
                        <span className="text-subtle"> ({LABEL_ROL[ev.actor_rol] || ev.actor_rol})</span>
                      </span>
                      <span className="text-[11px] text-subtle whitespace-nowrap w-[125px] text-right">{fechaHora(ev.creado_en)}</span>
                      {tieneDetalle && <span className="text-[10px] text-subtle w-3">{expandido ? '▲' : '▼'}</span>}
                    </button>

                    {expandido && tieneDetalle && (
                      <div className="px-2 pb-3 pt-1">
                        {ev.accion === 'eliminó' ? (
                          <div className="bg-danger-bg/40 rounded-lg p-3 text-[12px]">
                            <div className="font-bold text-danger mb-1">Registro eliminado</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                              {Object.entries(ev.antes || {})
                                .filter(([k, v]) => !['id','user_id','created_at'].includes(k) && v !== null && v !== '')
                                .slice(0, 9)
                                .map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-muted">{CAMPO[k] || k}: </span>
                                    <span className="text-ink font-semibold">{valorLegible(k, v)}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-canvas rounded-lg p-3">
                            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
                              {ev.accion === 'creó' ? 'Valores iniciales' : 'Cambios'}
                            </div>
                            <div className="flex flex-col gap-1">
                              {(ev.cambios ?? []).map((c: string) => (
                                <div key={c} className="text-[12px] flex flex-wrap items-center gap-1.5">
                                  <span className="text-muted min-w-[110px]">{CAMPO[c] || c}</span>
                                  {ev.accion === 'modificó' && (
                                    <>
                                      <span className="text-danger line-through">{valorLegible(c, ev.antes?.[c])}</span>
                                      <span className="text-subtle">→</span>
                                    </>
                                  )}
                                  <span className="text-success font-semibold">{valorLegible(c, ev.despues?.[c])}</span>
                                </div>
                              ))}
                              {ev.accion === 'creó' && (ev.cambios?.length ?? 0) === 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                                  {Object.entries(ev.despues || {})
                                    .filter(([k, v]) => !['id','user_id','created_at'].includes(k) && v !== null && v !== '' && v !== 0)
                                    .slice(0, 9)
                                    .map(([k, v]) => (
                                      <div key={k} className="text-[12px]">
                                        <span className="text-muted">{CAMPO[k] || k}: </span>
                                        <span className="text-ink font-semibold">{valorLegible(k, v)}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        {!isLoading && eventos.length >= limite && (
          <div className="text-center mt-4">
            <button onClick={() => setLimite(l => l + 50)}
              className="px-4 py-2 rounded-lg border border-line text-brand text-[13px] font-semibold hover:bg-canvas">
              Cargar más
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
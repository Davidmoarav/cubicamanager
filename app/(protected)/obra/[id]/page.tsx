'use client'
// app/(protected)/obra/[id]/page.tsx — Workspace de proyecto estilo ObraMaestra (Fase 0)

import useSWR from 'swr'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Proyecto } from '@/types'
import type { Cliente } from '@/types/cliente'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import type { EstadoPago } from '@/types/estado-pago'
import { ESTADO_EP } from '@/types/estado-pago'
import { fmt } from '@/lib/format'
import { EstadoBadge, Metrica, fechaCorta } from '@/components/obra/ui-obra'
import CopilotoBar from '@/components/obra/CopilotoBar'
import ArchivosTab from '@/components/obra/ArchivosTab'
import ClienteTab from '@/components/obra/ClienteTab'
import ComprasTab from '@/components/obra/ComprasTab'
import GanttTab from '@/components/obra/GanttTab'
import ComentariosTab from '@/components/obra/ComentariosTab'
import { DescargarPresupuestoPDFBtn, ExportarExcelBtn } from '@/components/obra/ExportarBtns'
import CompartirPanel from '@/components/obra/CompartirPanel'

const IVA = 0.19

const TABS = [
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'compras',     label: 'Compras' },
  { id: 'gantt',       label: 'Carta Gantt' },
  { id: 'archivos',    label: 'Archivos' },
  { id: 'cobros',      label: 'Cobros' },
  { id: 'comentarios', label: 'Comentarios' },
  { id: 'cliente',     label: 'Cliente' },
]

const PROXIMAMENTE: Record<string, { titulo: string; detalle: string; fase: string }> = {}

export default function ObraProyecto() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [tab, setTab] = useState('presupuesto')
  const [editando, setEditando] = useState(false)
  const [respuesta, setRespuesta] = useState('')

  const { data: proyectos, mutate: mutProyectos } = useSWR<Proyecto[]>('/api/proyectos')
  const { data: partidas, mutate: mutPartidas } = useSWR<PartidaProyecto[]>(id ? `/api/partidas-proyecto?proyecto_id=${id}` : null)
  const { data: eps } = useSWR<EstadoPago[]>(id ? `/api/estados-pago?proyecto_id=${id}` : null)
  const { data: clientes } = useSWR<Cliente[]>('/api/clientes')

  // ─── Edición conversacional (Fase 1) ───
  const editar = async (instruccion: string) => {
    if (!id || editando) return
    setEditando(true)
    setRespuesta('')
    try {
      const res = await fetch('/api/copiloto/editar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proyecto_id: id, instruccion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'No pude aplicar el cambio')
      await Promise.all([mutPartidas(), mutProyectos()])
      setRespuesta(`${data.resumen}${data.aplicadas ? ` (${data.aplicadas} cambio${data.aplicadas === 1 ? '' : 's'})` : ''}`)
    } catch (e: any) {
      setRespuesta(`${e?.message ?? 'Error aplicando el cambio'}`)
    } finally {
      setEditando(false)
    }
  }

  const proyecto = useMemo(
    () => (Array.isArray(proyectos) ? proyectos.find(p => p.id === id) : undefined),
    [proyectos, id]
  )
  const clienteProyecto = useMemo(
    () => (Array.isArray(clientes) && proyecto?.cliente_id
      ? clientes.find(c => c.id === proyecto.cliente_id) ?? null
      : null),
    [clientes, proyecto]
  )

  // ─── Métricas del header ───
  const listaEps = Array.isArray(eps) ? eps : []
  const pagado = listaEps.filter(e => e.estado === 'pagado').reduce((s, e) => s + (Number(e.total) || 0), 0)
  const monto = Number(proyecto?.valor) || 0
  const pendiente = Math.max(0, monto - pagado)
  const proximo = listaEps.find(e => e.estado === 'presentado' || e.estado === 'aprobado')

  // ─── Árbol de partidas (grupos nivel 1 + hojas) ───
  const arbol = useMemo(() => {
    const todas = Array.isArray(partidas) ? partidas : []
    const hijosDe = (pid: string) => todas.filter(p => p.parent_id === pid).sort((a, b) => a.orden - b.orden)
    const valor = (n: PartidaProyecto): number => {
      const h = hijosDe(n.id)
      if (h.length === 0) return (Number(n.cantidad) || 0) * (Number(n.precio_unitario) || 0)
      return h.reduce((s, c) => s + valor(c), 0)
    }
    const raices = todas.filter(p => !p.parent_id).sort((a, b) => a.orden - b.orden)
    return { raices, hijosDe, valor }
  }, [partidas])

  const neto = arbol.raices.reduce((s, r) => s + arbol.valor(r), 0)
  const iva = Math.round(neto * IVA)
  const total = neto + iva

  if (proyectos && !proyecto) {
    return (
      <div className="py-16 text-center">
        <div className="text-[15px] font-bold text-ink">Proyecto no encontrado</div>
        <Link href="/obra" className="text-om font-semibold text-[13px] mt-2 inline-block">← Volver a proyectos</Link>
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-[12.5px] text-muted mb-3">
        <Link href="/obra" className="hover:text-om transition">Proyectos</Link>
        <span className="mx-1.5">›</span>
        <span className="text-ink font-semibold">{proyecto?.nombre ?? '…'}</span>
      </div>

      {/* ─── Header del proyecto ─── */}
      <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[19px] font-extrabold text-ink tracking-tight">{proyecto?.nombre ?? 'Cargando…'}</h1>
          {proyecto && <EstadoBadge estado={proyecto.estado} />}
          {proyecto?.created_at && (
            <span className="text-[12px] text-subtle">Creada {fechaCorta(proyecto.created_at)}</span>
          )}
        </div>
        <div className="border-t border-line bg-canvas/60 flex flex-wrap divide-x divide-line">
          <Metrica label="Monto" valor={fmt(monto)} />
          <Metrica label="Pagado" valor={fmt(pagado)} />
          <Metrica label="Pendiente de cobro" valor={fmt(pendiente)} coral />
          <Metrica label="Próximo cobro" valor={proximo ? fmt(Number(proximo.total) || 0) : '—'} coral />
        </div>
      </div>

      {/* ─── Pestañas ─── */}
      <div className="mt-5 border-b border-line flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap border-b-2 -mb-px transition',
              tab === t.id
                ? 'text-om border-om'
                : 'text-muted border-transparent hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Contenido ─── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_290px]">
        <div className="min-w-0">
          {tab === 'presupuesto' && (
            <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
              <div className="p-5 lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[18px] font-extrabold text-ink">Presupuesto {proyecto?.nombre ?? ''}</h2>
                    <div className="text-[11.5px] text-subtle mt-0.5">Generado desde tus partidas del proyecto</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Total presupuestado</div>
                    <div className="text-[21px] font-extrabold text-ink">{fmt(total)}</div>
                    <div className="text-[11.5px] text-muted">Neto: {fmt(neto)} · IVA: {fmt(iva)}</div>
                  </div>
                </div>
              </div>

              {/* Tabla de partidas */}
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-om-ink text-white text-left">
                    <th className="px-5 py-2.5 font-bold">Descripción</th>
                    <th className="px-2 py-2.5 font-bold text-right w-16">Cant.</th>
                    <th className="px-2 py-2.5 font-bold w-14">Un.</th>
                    <th className="px-2 py-2.5 font-bold text-right w-24">P. Unit.</th>
                    <th className="px-5 py-2.5 font-bold text-right w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {arbol.raices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-muted">
                        Sin partidas aún. Díselo al copiloto aquí abajo{' '}
                        (ej: <span className="text-om font-semibold">"agrega 20 m² de porcelanato a 25.990"</span>)
                      </td>
                    </tr>
                  )}
                  {arbol.raices.map(raiz => {
                    const hijos = arbol.hijosDe(raiz.id)
                    const esGrupo = hijos.length > 0 || raiz.es_grupo
                    return esGrupo ? (
                      <GrupoFila key={raiz.id} nodo={raiz} arbol={arbol} nivel={0} />
                    ) : (
                      <HojaFila key={raiz.id} p={raiz} nivel={0} />
                    )
                  })}
                </tbody>
                {arbol.raices.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-om-ink">
                      <td colSpan={4} className="px-5 py-3 text-right font-extrabold text-ink">Total (IVA incl.)</td>
                      <td className="px-5 py-3 text-right font-extrabold text-om text-[15px]">{fmt(total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {tab === 'cobros' && (
            <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
              <div className="p-5 border-b border-line">
                <h2 className="text-[16px] font-extrabold text-ink">Cobros · Estados de pago</h2>
                <p className="text-[12.5px] text-muted mt-0.5">Datos reales de tu módulo de estados de pago.</p>
              </div>
              {listaEps.length === 0 ? (
                <div className="p-8 text-center text-muted text-[13px]">
                  Sin estados de pago aún. Créalos desde{' '}
                  <Link href="/proyectos" className="text-om font-semibold">Proyectos</Link>.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {listaEps.map(ep => {
                    const s = ESTADO_EP[ep.estado] ?? { label: ep.estado, bg: '#F1ECE6', color: '#6b7a8d' }
                    return (
                      <li key={ep.id} className="px-5 py-3.5 flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-om-bg text-om font-extrabold flex items-center justify-center text-[13px]">
                          {ep.numero}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-ink text-[13.5px]">EP N°{ep.numero}{ep.periodo ? ` · ${ep.periodo}` : ''}</div>
                          <div className="text-[12px] text-muted">{ep.fecha ? fechaCorta(ep.fecha) : ''} · Avance {Math.round(ep.avance_obra || 0)}%</div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                        <span className="font-extrabold text-ink text-[14px] w-28 text-right">{fmt(Number(ep.total) || 0)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === 'compras' && proyecto && (
            <ComprasTab proyecto={proyecto} partidas={Array.isArray(partidas) ? partidas : []} />
          )}

          {tab === 'gantt' && proyecto && (
            <GanttTab
              proyecto={proyecto}
              partidas={Array.isArray(partidas) ? partidas : []}
              onCambio={() => { mutPartidas(); mutProyectos() }}
            />
          )}

          {tab === 'comentarios' && id && <ComentariosTab proyectoId={id} />}

          {tab === 'archivos' && id && <ArchivosTab proyectoId={id} />}

          {tab === 'cliente' && proyecto && (
            <ClienteTab proyecto={proyecto} onCambio={() => mutProyectos()} />
          )}

          {PROXIMAMENTE[tab] && (
            <div className="bg-white rounded-card border border-dashed border-line2 p-10 text-center">
              <div className="inline-block px-3 py-1 rounded-full bg-om-bg text-om text-[11px] font-extrabold uppercase tracking-wide mb-3">
                {PROXIMAMENTE[tab].fase}
              </div>
              <div className="text-[16px] font-extrabold text-ink">{PROXIMAMENTE[tab].titulo}</div>
              <p className="text-[13px] text-muted mt-1.5 max-w-[420px] mx-auto">{PROXIMAMENTE[tab].detalle}</p>
            </div>
          )}
        </div>

        {/* ─── Rail derecho de acciones ─── */}
        <aside className="space-y-3">
          <div className="bg-white rounded-card border border-line shadow-card p-4 space-y-2.5">
            {proyecto && <CompartirPanel proyecto={proyecto} />}
            {proyecto && (
              <>
                <DescargarPresupuestoPDFBtn
                  proyecto={proyecto}
                  cliente={clienteProyecto}
                  partidas={Array.isArray(partidas) ? partidas : []}
                />
                <ExportarExcelBtn
                  proyecto={proyecto}
                  partidas={Array.isArray(partidas) ? partidas : []}
                />
              </>
            )}
          </div>

          <div className="bg-white rounded-card border border-line shadow-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-extrabold uppercase tracking-wide text-ink">Plan de compra</span>
              <span className="px-1.5 py-0.5 rounded bg-om-bg text-om text-[9.5px] font-extrabold">BETA</span>
            </div>
            <p className="text-[12px] text-muted mt-1.5 leading-snug">
              Busca precios reales en catálogos de proveedores y genera una ruta de compra optimizada.
            </p>
            <button
              onClick={() => setTab('compras')}
              className="mt-3 w-full py-2.5 rounded-xl bg-om hover:bg-om-dark text-white font-bold text-[12.5px] transition"
            >
              Generar plan de compra →
            </button>
          </div>
        </aside>
      </div>

      <CopilotoBar
        onSubmit={editar}
        busy={editando}
        respuesta={respuesta}
      />
    </div>
  )
}

// ─── Filas de la tabla de presupuesto ───
function GrupoFila({ nodo, arbol, nivel }: {
  nodo: PartidaProyecto
  arbol: { hijosDe: (id: string) => PartidaProyecto[]; valor: (n: PartidaProyecto) => number }
  nivel: number
}) {
  const hijos = arbol.hijosDe(nodo.id)
  return (
    <>
      <tr className="bg-om-bg/60 border-l-[3px] border-om">
        <td className="px-5 py-2 font-extrabold text-om-dark uppercase text-[12px] tracking-wide" style={{ paddingLeft: 20 + nivel * 16 }}>
          ⌄ {nodo.descripcion}
        </td>
        <td className="px-2 py-2 text-right text-[11.5px] text-om-dark font-bold">{hijos.length}</td>
        <td colSpan={2} />
        <td className="px-5 py-2 text-right font-extrabold text-om-dark">{fmt(arbol.valor(nodo))}</td>
      </tr>
      {hijos.map(h =>
        arbol.hijosDe(h.id).length > 0
          ? <GrupoFila key={h.id} nodo={h} arbol={arbol} nivel={nivel + 1} />
          : <HojaFila key={h.id} p={h} nivel={nivel + 1} />
      )}
    </>
  )
}

function HojaFila({ p, nivel }: { p: PartidaProyecto; nivel: number }) {
  const sub = (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0)
  return (
    <tr className="border-t border-line hover:bg-canvas/50 transition">
      <td className="px-5 py-2.5 text-ink" style={{ paddingLeft: 20 + nivel * 16 }}>{p.descripcion}</td>
      <td className="px-2 py-2.5 text-right text-muted">{Number(p.cantidad) || 0}</td>
      <td className="px-2 py-2.5 text-muted">{p.unidad}</td>
      <td className="px-2 py-2.5 text-right text-muted">{fmt(Number(p.precio_unitario) || 0)}</td>
      <td className="px-5 py-2.5 text-right font-bold text-ink">{fmt(sub)}</td>
    </tr>
  )
}

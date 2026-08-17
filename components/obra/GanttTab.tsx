'use client'
// components/obra/GanttTab.tsx — Carta Gantt (Fase 4), estilo ObraMaestra:
// stats, línea de tiempo con marcador HOY, vista lista con edición de fechas,
// plan automático y export PDF. Las etapas son los grupos nivel 1 del presupuesto.

import { useMemo, useState } from 'react'
import type { Proyecto } from '@/types'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import {
  calcularGantt, planAutomatico, fechaCortaCL,
  type EtapaGantt, type EstadoEtapa,
} from '@/lib/gantt'

const COLOR_BARRA: Record<EstadoEtapa, string> = {
  completa: 'bg-success',
  encurso: 'bg-om',
  atrasada: 'bg-danger',
  pendiente: 'bg-line2',
}

const BADGE_ESTADO: Record<EstadoEtapa, { label: string; cls: string }> = {
  completa: { label: 'Completa', cls: 'bg-success-bg text-success' },
  encurso: { label: 'En curso', cls: 'bg-om-bg text-om' },
  atrasada: { label: 'Atrasada', cls: 'bg-danger-bg text-danger' },
  pendiente: { label: 'Pendiente', cls: 'bg-canvas text-muted' },
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[150px] bg-white rounded-card border border-line shadow-card px-4 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export default function GanttTab({ proyecto, partidas, onCambio }: {
  proyecto: Proyecto
  partidas: PartidaProyecto[]
  onCambio: () => void
}) {
  const [vista, setVista] = useState<'timeline' | 'lista'>('timeline')
  const [guardando, setGuardando] = useState('')
  const [error, setError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const hoyISO = new Date().toISOString().slice(0, 10)

  // Etapas = grupos nivel 1; su valor = suma de hojas descendientes
  const etapas: EtapaGantt[] = useMemo(() => {
    const hijosDe = (id: string) => partidas.filter(p => p.parent_id === id)
    const valorNodo = (n: PartidaProyecto): number => {
      const h = hijosDe(n.id)
      if (h.length === 0) return (Number(n.cantidad) || 0) * (Number(n.precio_unitario) || 0)
      return h.reduce((s, c) => s + valorNodo(c), 0)
    }
    return partidas
      .filter(p => !p.parent_id && (p.es_grupo || hijosDe(p.id).length > 0))
      .sort((a, b) => a.orden - b.orden)
      .map(g => ({
        id: g.id,
        nombre: g.descripcion,
        avance: Number(g.avance) || 0,
        valor: valorNodo(g),
        fecha_inicio: g.fecha_inicio ?? null,
        fecha_fin: g.fecha_fin ?? null,
        responsable: g.responsable ?? null,
      }))
  }, [partidas])

  const g = useMemo(() => calcularGantt(etapas, hoyISO), [etapas, hoyISO])

  const guardarEtapa = async (etapaId: string, cambios: { fecha_inicio?: string; fecha_fin?: string; responsable?: string }) => {
    setGuardando(etapaId)
    setError('')
    try {
      const res = await fetch('/api/gantt', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ etapa_id: etapaId, ...cambios }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'No se pudo guardar')
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar')
    } finally {
      setGuardando('')
    }
  }

  const planificarAuto = async () => {
    if (!confirm('¿Planificar automáticamente? Asigna fechas secuenciales desde hoy, proporcionales al valor de cada etapa.')) return
    setGuardando('auto')
    setError('')
    try {
      for (const p of planAutomatico(etapas, hoyISO, 30)) {
        const res = await fetch('/api/gantt', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ etapa_id: p.id, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin }),
        })
        if (!res.ok) throw new Error((await res.json())?.error ?? 'No se pudo planificar')
      }
      onCambio()
    } catch (e: any) {
      setError(e?.message ?? 'Error al planificar')
    } finally {
      setGuardando('')
    }
  }

  const descargarPDF = async () => {
    setPdfLoading(true)
    try {
      const [{ pdf }, { GanttPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./GanttPDF'),
      ])
      const blob = await pdf(<GanttPDF proyecto={proyecto} calc={g} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CartaGantt_${proyecto.nombre.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError('Error al generar PDF: ' + (e?.message ?? e))
    } finally {
      setPdfLoading(false)
    }
  }

  if (etapas.length === 0) {
    return (
      <div className="bg-white rounded-card border border-dashed border-line2 p-10 text-center">
        <div className="text-[16px] font-extrabold text-ink">El presupuesto no tiene etapas</div>
        <p className="text-[13px] text-muted mt-1.5 max-w-[420px] mx-auto">
          La Carta Gantt se arma con los grupos del presupuesto (Demolición, Instalaciones, etc.).
          Genera un presupuesto con el copiloto y vuelve aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-extrabold text-ink mr-1">Carta Gantt</h2>
        <span className="text-[12px] text-muted hidden sm:inline">· la línea coral marca hoy</span>
        <div className="flex-1" />
        <div className="flex rounded-xl border border-line overflow-hidden">
          {(['timeline', 'lista'] as const).map(v => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={[
                'px-3.5 py-2 text-[12.5px] font-bold transition',
                vista === v ? 'bg-om-ink text-white' : 'bg-white text-muted hover:text-ink',
              ].join(' ')}
            >
              {v === 'timeline' ? 'Línea de tiempo' : 'Lista'}
            </button>
          ))}
        </div>
        {g.sinFechas > 0 && (
          <button
            onClick={planificarAuto}
            disabled={guardando !== ''}
            className="px-3.5 py-2 rounded-xl bg-om hover:bg-om-dark text-white text-[12.5px] font-bold transition disabled:opacity-50"
          >
            {guardando === 'auto' ? 'Planificando…' : `Planificar auto (${g.sinFechas})`}
          </button>
        )}
        <button
          onClick={descargarPDF}
          disabled={pdfLoading}
          className="px-3.5 py-2 rounded-xl border border-line text-ink hover:border-om hover:text-om text-[12.5px] font-bold transition"
        >
          {pdfLoading ? '⏳' : 'PDF'}
        </button>
      </div>

      {error && (
        error.includes('sql/3')
          ? <p className="text-[12.5px] text-warning font-semibold bg-warning-bg rounded-xl px-4 py-3">{error}</p>
          : <p className="text-[12.5px] text-danger font-semibold">{error}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Avance global">
          <div className="text-[18px] font-extrabold text-ink">{g.avanceGlobal}%</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-canvas overflow-hidden">
            <div className="h-full rounded-full bg-om" style={{ width: `${Math.min(100, g.avanceGlobal)}%` }} />
          </div>
        </StatCard>
        <StatCard label="Fase actual">
          <div className="text-[15px] font-extrabold text-ink leading-tight">{g.faseActual?.nombre ?? '—'}</div>
          {g.faseActual && <div className="text-[12px] text-muted">{g.faseActual.avance}%</div>}
        </StatCard>
        <StatCard label="Días restantes">
          <div className="text-[18px] font-extrabold text-ink">
            {g.diasRestantes !== null ? `${g.diasRestantes} días` : '—'}
          </div>
          {g.fechaEntrega && <div className="text-[12px] text-muted">entrega {fechaCortaCL(g.fechaEntrega)}</div>}
        </StatCard>
        <StatCard label={`Período · ${g.totalDias || '—'} días`}>
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
            <span className="px-2 py-1 rounded-lg border border-om/40 text-om">{fechaCortaCL(g.desde)}</span>
            <span className="text-subtle">→</span>
            <span className="px-2 py-1 rounded-lg border border-om/40 text-om">{fechaCortaCL(g.hasta)}</span>
          </div>
        </StatCard>
      </div>

      {/* ─── Vista línea de tiempo ─── */}
      {vista === 'timeline' && (
        <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
          {g.desde ? (
            <div className="grid" style={{ gridTemplateColumns: 'minmax(170px, 220px) 1fr' }}>
              {/* Cabecera */}
              <div className="px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted border-b border-line">
                Etapa · Responsable
              </div>
              <div className="relative border-b border-line h-8">
                {g.meses.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center px-2 text-[10.5px] font-bold uppercase text-muted border-l border-line"
                    style={{ left: `${m.iniPct}%`, width: `${m.anchoPct}%` }}
                  >
                    {m.etiqueta}
                  </div>
                ))}
              </div>

              {/* Filas */}
              {g.etapas.map(e => (
                <FilaTimeline key={e.id} etapa={e} hoyPct={g.hoyPct} />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted text-[13px]">
              Sin fechas aún. Usa <span className="text-om font-bold">Planificar auto</span> o
              cambia a la vista Lista para poner fechas a mano.
            </div>
          )}
        </div>
      )}

      {/* ─── Vista lista (edición) ─── */}
      {vista === 'lista' && (
        <div className="bg-white rounded-card border border-line shadow-card overflow-x-auto">
          <table className="w-full text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="px-4 py-2.5 font-bold">Etapa</th>
                <th className="px-2 py-2.5 font-bold w-28">Inicio</th>
                <th className="px-2 py-2.5 font-bold w-28">Término</th>
                <th className="px-2 py-2.5 font-bold w-36">Responsable</th>
                <th className="px-2 py-2.5 font-bold w-24 text-center">Avance</th>
                <th className="px-4 py-2.5 font-bold w-24 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {g.etapas.map(e => (
                <FilaLista key={e.id} etapa={e} guardando={guardando === e.id} onGuardar={guardarEtapa} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-subtle">
        El avance de cada etapa viene del presupuesto (partidas y estados de pago) — se actualiza solo.
      </p>
    </div>
  )
}

// ─── Fila de la línea de tiempo ───
function FilaTimeline({ etapa, hoyPct }: {
  etapa: ReturnType<typeof calcularGantt>['etapas'][number]
  hoyPct: number | null
}) {
  const b = BADGE_ESTADO[etapa.estado]
  return (
    <>
      <div className="px-4 py-3 border-b border-line/70 min-w-0">
        <div className="font-bold text-ink text-[13px] truncate">{etapa.nombre}</div>
        <div className="text-[11.5px] text-muted truncate">
          {etapa.fecha_inicio ? `${fechaCortaCL(etapa.fecha_inicio)} – ${fechaCortaCL(etapa.fecha_fin)}` : 'Sin fechas'}
          {etapa.responsable ? ` · ${etapa.responsable}` : ''}
        </div>
      </div>
      <div className="relative border-b border-line/70 py-3 pr-3">
        {/* Línea HOY */}
        {hoyPct !== null && (
          <div className="absolute top-0 bottom-0 w-[2px] bg-om z-10" style={{ left: `${hoyPct}%` }} />
        )}
        {/* Barra */}
        {etapa.anchoPct > 0 && (
          <div
            className={['relative h-6 rounded-md flex items-center px-2', COLOR_BARRA[etapa.estado]].join(' ')}
            style={{ marginLeft: `${etapa.iniPct}%`, width: `${etapa.anchoPct}%`, minWidth: 34 }}
            title={`${etapa.nombre}: ${Math.round(etapa.avance)}%`}
          >
            <span className={[
              'text-[10.5px] font-extrabold',
              etapa.estado === 'pendiente' ? 'text-muted' : 'text-white',
            ].join(' ')}>
              {Math.round(etapa.avance)}%
            </span>
          </div>
        )}
        {etapa.anchoPct === 0 && (
          <span className={['inline-block px-2 py-1 rounded text-[10.5px] font-bold', b.cls].join(' ')}>
            Sin planificar
          </span>
        )}
      </div>
    </>
  )
}

// ─── Fila editable de la vista lista ───
function FilaLista({ etapa, guardando, onGuardar }: {
  etapa: ReturnType<typeof calcularGantt>['etapas'][number]
  guardando: boolean
  onGuardar: (id: string, c: { fecha_inicio?: string; fecha_fin?: string; responsable?: string }) => void
}) {
  const [ini, setIni] = useState(etapa.fecha_inicio ?? '')
  const [fin, setFin] = useState(etapa.fecha_fin ?? '')
  const [resp, setResp] = useState(etapa.responsable ?? '')
  const cambiado = ini !== (etapa.fecha_inicio ?? '') || fin !== (etapa.fecha_fin ?? '') || resp !== (etapa.responsable ?? '')
  const b = BADGE_ESTADO[etapa.estado]

  return (
    <tr className="border-b border-line/60">
      <td className="px-4 py-2.5 font-bold text-ink">{etapa.nombre}</td>
      <td className="px-2 py-2">
        <input type="date" value={ini} onChange={e => setIni(e.target.value)}
          className="w-full border border-line rounded-lg px-2 py-1.5 text-[12.5px] outline-none focus:border-om" />
      </td>
      <td className="px-2 py-2">
        <input type="date" value={fin} onChange={e => setFin(e.target.value)}
          className="w-full border border-line rounded-lg px-2 py-1.5 text-[12.5px] outline-none focus:border-om" />
      </td>
      <td className="px-2 py-2">
        <input value={resp} onChange={e => setResp(e.target.value)} placeholder="Maestro a cargo"
          className="w-full border border-line rounded-lg px-2 py-1.5 text-[12.5px] outline-none focus:border-om placeholder:text-subtle" />
      </td>
      <td className="px-2 py-2 text-center font-extrabold text-om">{Math.round(etapa.avance)}%</td>
      <td className="px-4 py-2 text-center">
        {cambiado ? (
          <button
            onClick={() => onGuardar(etapa.id, { fecha_inicio: ini, fecha_fin: fin, responsable: resp })}
            disabled={guardando}
            className="px-2.5 py-1.5 rounded-lg bg-om hover:bg-om-dark text-white text-[11.5px] font-bold transition"
          >
            {guardando ? '…' : 'Guardar'}
          </button>
        ) : (
          <span className={['inline-block px-2 py-1 rounded-full text-[10.5px] font-bold', b.cls].join(' ')}>
            {b.label}
          </span>
        )}
      </td>
    </tr>
  )
}

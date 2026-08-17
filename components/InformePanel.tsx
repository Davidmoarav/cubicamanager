'use client'
// components/InformePanel.tsx
//
// Informe ejecutivo del proyecto: KPIs financieros, de retenciones y de
// mano de obra, agregados automáticamente de los módulos 1-3. Botón para
// exportar a PDF con diseño Cubica.

import { useState, useEffect, useCallback } from 'react'
import { MetricCard, Btn } from '@/components/ui'
import { fmt } from '@/lib/format'
import DescargarInformeBtn from '@/components/DescargarInformeBtn'

interface Props {
  proyectoId: string
  proyectoNombre?: string
}

export default function InformePanel({ proyectoId, proyectoNombre = '' }: Props) {
  const [data, setData]       = useState<any>(null)
  const [proximo, setProximo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [inf, sug] = await Promise.all([
      fetch(`/api/informe?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/estados-pago?proyecto_id=${proyectoId}&sugerir=1`).then(r => r.json()).catch(() => null),
    ])
    setData(inf)
    setProximo(sug && sug.total ? sug : null)
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Cargando informe…</div>
  if (!data?.kpis) return <div className="text-[13px] text-muted py-8 text-center">No hay datos para generar el informe.</div>

  const k = data.kpis

  return (
    <div>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-ink">Informe ejecutivo</h4>
          <p className="text-[12px] text-muted mt-0.5">Resumen financiero, retenciones y mano de obra al día.</p>
        </div>
        <DescargarInformeBtn data={data} proximo={proximo} />
      </div>

      {/* ─── Financiero ─── */}
      <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Avance financiero</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard label="Cobrado" value={`${k.cobrado_pct}%`} sub={fmt(k.total_cobrado)} subColor="#1a7a4a" />
        <MetricCard label="Facturado acumulado" value={`${k.avance_financiero_pct}%`} sub={fmt(k.total_facturado)} subColor="#E5502A" />
        <MetricCard label="Saldo por facturar" value={fmt(k.saldo_por_facturar)} sub="del contrato" subColor="#b0401a" />
        <MetricCard label="Valor contrato (neto)" value={fmt(k.valor_contrato)} sub={`${k.n_estados} estados de pago`} />
      </div>

      {proximo && (
        <div className="mb-5 flex items-center justify-between bg-brand-bg border border-line rounded-card px-4 py-3">
          <div>
            <div className="text-[12px] font-bold text-brand">Próximo estado de pago (sugerido)</div>
            <div className="text-[11px] text-muted mt-0.5">EP N°{proximo.numero} · según avance actual de obra</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-ink">{fmt(proximo.total)}</div>
            <div className="text-[11px] text-muted">líquido a pagar</div>
          </div>
        </div>
      )}

      {/* ─── Retenciones ─── */}
      <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Retenciones y anticipos</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard label="Retención acumulada" value={fmt(k.retencion_acumulada)} sub="retenida a la fecha" />
        <MetricCard label="Retención por liberar" value={fmt(k.retencion_saldo)} sub={`devuelto ${fmt(k.retencion_devuelta)}`} subColor="#b0401a" />
        <MetricCard label="Anticipo amortizado" value={fmt(k.anticipo_amortizado)} sub="descontado en EPs" />
        <MetricCard label="Saldo anticipo" value={fmt(k.anticipo_saldo)} sub={`devuelto ${fmt(k.anticipo_devuelto)}`} subColor="#E5502A" />
      </div>

      {/* ─── Mano de obra ─── */}
      <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Mano de obra</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Dotación actual" value={k.dotacion_actual} sub="trabajadores" />
        <MetricCard label="Costo M.O mensual" value={fmt(k.costo_mo_mensual)} sub="incluye imposiciones" subColor="#b07d1a" />
        <MetricCard label="Gasto M.O pendiente" value={fmt(k.gasto_mo_pendiente)} sub="hasta cierre" subColor="#b0401a" />
        <MetricCard label="Costo M.O total" value={fmt(k.costo_mo_total)} sub="proyectado" />
      </div>
    </div>
  )
}
'use client'
// app/(protected)/finanzas/page.tsx — v2 con IVA y PRESUPUESTO

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, MetricCard, SectionTitle } from '@/components/ui'
import { fmt, fmtM } from '@/lib/format'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function labelPeriodo(p: string) {
  if (!p || !p.includes('-')) return p
  const [y, m] = p.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

export default function FinanzasPage() {
  const [tab, setTab] = useState<'resumen' | 'iva' | 'presupuesto'>('resumen')
  const [periodoSel, setPeriodoSel] = useState<string>(new Date().toISOString().slice(0, 7))

  const { data: facturas = [], isLoading, mutate: mutFacturas } = useSWR<any[]>('/api/facturas', fetcher)
  const { data: empleados = [], mutate: mutEmpleados } = useSWR<any[]>('/api/empleados', fetcher)
  const { data: iva = [], mutate: mutIva } = useSWR<any[]>('/api/iva', fetcher)
  const { data: presupuesto = [], mutate: mutPresupuesto } = useSWR<any[]>('/api/presupuesto', fetcher)
  const refresh = () => { mutFacturas(); mutEmpleados(); mutIva(); mutPresupuesto() }

  // ─── PPM (form local del período seleccionado) ──────────
  const [ppmTasa, setPpmTasa]       = useState<string>('0')
  const [ppmRegimen, setPpmRegimen] = useState<string>('pro_pyme_general')
  const [ppmSaving, setPpmSaving]   = useState(false)
  const [ppmSavedAt, setPpmSavedAt] = useState<number | null>(null)


  // ─── Resumen ─────────────────────────────────────────────
  const resumen = useMemo(() => {
    const f = facturas.filter(x => x.tipo !== 'compra')
    const cobrado   = f.filter(x => x.estado === 'pagada').reduce((s, x) => s + (x.monto || 0), 0)
    const pendiente = f.filter(x => x.estado === 'pendiente').reduce((s, x) => s + (x.monto || 0), 0)
    const vencido   = f.filter(x => x.estado === 'vencida').reduce((s, x) => s + (x.monto || 0), 0)
    const nomina    = empleados.reduce((s, x) => s + (x.sueldo || 0) + (x.horas_extra || 0) * 14000, 0)
    return { cobrado, pendiente, vencido, nomina }
  }, [facturas, empleados])

  // ─── IVA del período seleccionado ───────────────────────
  const periodosDisponibles = useMemo(() => {
    const set = new Set<string>(iva.map((p: any) => p.periodo).filter(Boolean))
    set.add(new Date().toISOString().slice(0, 7))  // siempre incluir el mes actual
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [iva])

  const ivaPeriodo = useMemo(() => {
    return iva.find((p: any) => p.periodo === periodoSel) || null
  }, [iva, periodoSel])

  // Cuando cambia el período (o llegan datos nuevos), refleja la tasa/régimen guardados
  useEffect(() => {
    setPpmTasa(String(ivaPeriodo?.ppm_tasa ?? 0))
    setPpmRegimen(ivaPeriodo?.ppm_regimen ?? 'pro_pyme_general')
  }, [ivaPeriodo?.periodo, ivaPeriodo?.ppm_tasa, ivaPeriodo?.ppm_regimen])

  const guardarPpm = useCallback(async () => {
    setPpmSaving(true)
    try {
      await fetch('/api/ppm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: periodoSel, regimen: ppmRegimen, tasa: Number(ppmTasa) || 0 }),
      })
      await refresh()
      setPpmSavedAt(Date.now())
    } finally {
      setPpmSaving(false)
    }
  }, [periodoSel, ppmRegimen, ppmTasa])

  const ivaTotales = useMemo(() => {
    if (!ivaPeriodo) return { debito: 0, credito: 0, pagar: 0, ppm: 0, total: 0 }
    return {
      debito: ivaPeriodo.iva_debito,
      credito: ivaPeriodo.iva_credito,
      pagar: ivaPeriodo.iva_a_pagar,
      ppm: ivaPeriodo.ppm ?? 0,
      total: ivaPeriodo.total_a_pagar ?? ivaPeriodo.iva_a_pagar,
    }
  }, [ivaPeriodo])

  if (isLoading) return <p className="text-muted p-5">Cargando...</p>

  return (
    <div>
      <div className="mb-5">
        <SectionTitle>Finanzas</SectionTitle>
        <p className="text-sm text-muted mt-1">Resumen financiero, IVA y avance presupuestario</p>
      </div>

      {/* TABS */}
      <div className="inline-flex gap-1 p-1 bg-canvas rounded-xl mb-6">
        {[
          { key: 'resumen' as const,     label: '📊 Resumen' },
          { key: 'iva' as const,         label: '🧾 Control IVA' },
          { key: 'presupuesto' as const, label: '🏗 Avance presupuestario' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition
              ${tab === t.key ? 'bg-white text-brand shadow-card' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ RESUMEN ══════ */}
      {tab === 'resumen' && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Ingresos cobrados" value={fmtM(resumen.cobrado)}   sub="Facturas pagadas"     subColor="#1a7a4a" />
            <MetricCard label="CxC pendiente"     value={fmtM(resumen.pendiente)} sub="Por cobrar"           subColor="#b07d1a" />
            <MetricCard label="CxC vencida"       value={fmtM(resumen.vencido)}   sub="Gestión urgente"      subColor="#b0401a" />
            <MetricCard label="Nómina mensual"    value={fmtM(resumen.nomina)}    sub="Mano de obra directa" />
          </div>
          <div className="bg-brand-bg border border-[#b5d4f4] rounded-xl px-5 py-4 text-[13px] text-[#0c447c]">
            💡 Para el detalle de IVA a pagar al SII, revisa la pestaña <strong>Control IVA</strong>. Para ver cuánto presupuesto llevas ejecutado por obra, ve a <strong>Avance presupuestario</strong>.
          </div>
        </div>
      )}

      {/* ══════ CONTROL IVA ══════ */}
      {tab === 'iva' && (
        <div>
          {/* Selector de período */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 bg-white border border-line rounded-xl p-3 shadow-card">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-ink">Período:</span>
              <select value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}
                className="input-base cursor-pointer min-w-[160px] w-auto">
                {periodosDisponibles.map(per => (
                  <option key={per} value={per}>{labelPeriodo(per)}</option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-muted">El conteo se reinicia cada mes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <MetricCard label="IVA Débito (ventas)"  value={fmt(ivaTotales.debito)}  sub="IVA que cobraste"   subColor="#1e6bb8" />
            <MetricCard label="IVA Crédito (compras)" value={fmt(ivaTotales.credito)} sub="IVA que pagaste"    subColor="#1a7a4a" />
            <MetricCard label="IVA a pagar al SII"   value={fmt(ivaTotales.pagar)}   sub={ivaTotales.pagar >= 0 ? 'Por pagar' : 'A favor'} subColor={ivaTotales.pagar >= 0 ? '#b0401a' : '#1a7a4a'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <MetricCard label="PPM del período" value={fmt(ivaTotales.ppm)} sub={`Tasa ${ppmTasa || 0}% sobre ventas netas`} subColor="#7a4ab0" />
            <MetricCard label="Total a pagar al SII" value={fmt(ivaTotales.total)} sub="IVA a pagar + PPM" subColor={ivaTotales.total >= 0 ? '#b0401a' : '#1a7a4a'} />
          </div>

          {/* Editor de tasa/régimen de PPM */}
          <div className="bg-white border border-line rounded-xl p-4 mb-6 shadow-card">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3">
              Configuración de PPM — {labelPeriodo(periodoSel)}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label-base">Régimen tributario</label>
                <select value={ppmRegimen} onChange={e => setPpmRegimen(e.target.value)}
                  className="input-base cursor-pointer w-full sm:w-auto sm:min-w-[220px]">
                  <option value="pro_pyme_general">Pro-Pyme General (14 D N°3)</option>
                  <option value="pro_pyme_transparente">Pro-Pyme Transparente (14 D N°8)</option>
                  <option value="regimen_general">Régimen General (14 A)</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="label-base">Tasa PPM (%)</label>
                <input type="number" step="0.01" min="0" value={ppmTasa}
                  onChange={e => setPpmTasa(e.target.value)}
                  className="input-base w-[120px]" placeholder="Ej: 0.25" />
              </div>
              <Btn onClick={guardarPpm} disabled={ppmSaving}>
                {ppmSaving ? 'Guardando...' : 'Guardar tasa'}
              </Btn>
              {ppmSavedAt && Date.now() - ppmSavedAt < 4000 && (
                <span className="text-[12px] text-success font-semibold">Guardado ✓</span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-3">
              La tasa de PPM es propia de cada contribuyente y la informa el SII (varía según historial de ventas/utilidades).
              Ingrésala manualmente según lo que indique tu última Propuesta F29 o el portal del SII. El monto se calcula como
              tasa% × ventas netas del período.
            </p>
          </div>

          {/* Desglose de notas del período */}
          {ivaPeriodo && (ivaPeriodo.iva_nc_venta > 0 || ivaPeriodo.iva_nd_venta > 0 || ivaPeriodo.iva_nc_compra > 0 || ivaPeriodo.iva_nd_compra > 0) && (
            <div className="bg-canvas border border-line rounded-xl p-4 mb-6">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3">Ajustes por notas en {labelPeriodo(periodoSel)}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                <div><div className="text-[11px] text-muted">NC venta (resta débito)</div><div className="font-bold text-danger">− {fmt(ivaPeriodo.iva_nc_venta)}</div></div>
                <div><div className="text-[11px] text-muted">ND venta (suma débito)</div><div className="font-bold text-success">+ {fmt(ivaPeriodo.iva_nd_venta)}</div></div>
                <div><div className="text-[11px] text-muted">NC compra (resta crédito)</div><div className="font-bold text-danger">− {fmt(ivaPeriodo.iva_nc_compra)}</div></div>
                <div><div className="text-[11px] text-muted">ND compra (suma crédito)</div><div className="font-bold text-success">+ {fmt(ivaPeriodo.iva_nd_compra)}</div></div>
              </div>
            </div>
          )}

          <div className="bg-white border border-line rounded-2xl p-6 shadow-card">
            <div className="text-sm font-bold text-ink mb-4">Historial por período (F29)</div>
            {iva.length === 0
              ? <p className="text-muted text-center p-5 text-[13px]">
                  No hay facturas registradas. Agrega facturas de venta y compra para calcular el IVA.
                </p>
              : (
                <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px] min-w-[680px]">
                  <thead>
                    <tr className="border-b-2 border-[#e4e9f0]">
                      <th className={thS}>Período</th>
                      <th className={thNum}>Ventas (neto)</th>
                      <th className={thNum}>IVA Débito</th>
                      <th className={thNum}>Compras (neto)</th>
                      <th className={thNum}>IVA Crédito</th>
                      <th className={thNum}>IVA a pagar</th>
                      <th className={thNum}>PPM</th>
                      <th className={thNum}>Total a pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iva.map(p => (
                      <tr key={p.periodo} onClick={() => setPeriodoSel(p.periodo)}
                        className={`border-b border-canvas cursor-pointer ${p.periodo === periodoSel ? 'bg-[#e8f1fb]' : 'bg-transparent'}`}>
                        <td className={`${tdS} font-bold`}>{labelPeriodo(p.periodo)}</td>
                        <td className={tdNum}>{fmt(p.neto_ventas)}</td>
                        <td className={`${tdNum} text-brand`}>{fmt(p.iva_debito)}</td>
                        <td className={tdNum}>{fmt(p.neto_compras)}</td>
                        <td className={`${tdNum} text-success`}>{fmt(p.iva_credito)}</td>
                        <td className={`${tdNum} font-extrabold ${p.iva_a_pagar >= 0 ? 'text-danger' : 'text-success'}`}>
                          {fmt(p.iva_a_pagar)}
                        </td>
                        <td className={tdNum}>{fmt(p.ppm ?? 0)}</td>
                        <td className={`${tdNum} font-extrabold ${(p.total_a_pagar ?? p.iva_a_pagar) >= 0 ? 'text-danger' : 'text-success'}`}>
                          {fmt(p.total_a_pagar ?? p.iva_a_pagar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            <p className="text-[11px] text-muted mt-3">
              IVA a pagar = IVA Débito (ventas) − IVA Crédito (compras). Total a pagar = IVA a pagar + PPM del período.
              Valor positivo = pagas al SII; negativo = remanente a favor.
            </p>
          </div>
        </div>
      )}

      {/* ══════ AVANCE PRESUPUESTARIO ══════ */}
      {tab === 'presupuesto' && (
        <div>
          <p className="text-[13px] text-muted mb-[18px]">
            Compara el avance físico de cada obra con el presupuesto ejecutado a la fecha (suma del % de avance × valor de cada partida).
          </p>

          {presupuesto.length === 0
            ? <div className="bg-[#f8fafc] border border-dashed border-[#d1d9e6] rounded-[10px] p-[30px] text-center text-[13px] text-muted">
                No hay proyectos con partidas cargadas. Agrega partidas de obra en cada proyecto para ver el avance presupuestario.
              </div>
            : (
              <div className="flex flex-col gap-3.5">
                {presupuesto.map(p => {
                  const desviacion = p.pct_presupuesto - p.avance_fisico
                  const alerta = desviacion > 10  // gasto va más rápido que avance físico
                  return (
                    <div key={p.proyecto_id}
                      className={`bg-white border border-[#e4e9f0] rounded-xl p-[18px] border-l-4 ${alerta ? 'border-l-danger' : 'border-l-success'}`}>
                      <div className="flex justify-between items-start mb-3.5">
                        <div>
                          <div className="text-[15px] font-bold text-[#1a2535]">{p.nombre}</div>
                          <div className="text-[12px] text-muted">{p.cliente} · {p.n_partidas} partidas</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-muted">Valor contrato</div>
                          <div className="text-[15px] font-bold text-[#1a2535]">{fmtM(p.valor_contrato)}</div>
                        </div>
                      </div>

                      {/* Doble barra: físico vs presupuesto */}
                      <div className="mb-2.5">
                        <div className="flex justify-between text-[11px] mb-[3px]">
                          <span className="text-muted">Avance físico de obra</span>
                          <span className="font-bold text-brand">{p.avance_fisico}%</span>
                        </div>
                        <div className="h-2 bg-[#e8edf2] rounded overflow-hidden">
                          <div className="h-full bg-brand rounded" style={{ width: `${p.avance_fisico}%` }} />
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-[11px] mb-[3px]">
                          <span className="text-muted">Presupuesto ejecutado</span>
                          <span className={`font-bold ${alerta ? 'text-danger' : 'text-success'}`}>{p.pct_presupuesto}%</span>
                        </div>
                        <div className="h-2 bg-[#e8edf2] rounded overflow-hidden">
                          <div className={`h-full rounded ${alerta ? 'bg-danger' : 'bg-success'}`} style={{ width: `${p.pct_presupuesto}%` }} />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-canvas">
                        <div className="text-[12px] text-muted">
                          Ejecutado: <strong className="text-[#1a2535]">{fmt(p.ejecutado)}</strong> de {fmt(p.presupuesto_partidas)}
                        </div>
                        {alerta && (
                          <span className="text-[11px] font-bold text-danger bg-danger-bg px-2.5 py-[3px] rounded-xl">
                            ⚠ Gasto {desviacion}% sobre avance físico
                          </span>
                        )}
                        {!alerta && desviacion < -10 && (
                          <span className="text-[11px] font-bold text-success bg-success-bg px-2.5 py-[3px] rounded-xl">
                            ✓ Bajo presupuesto
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

const thS = 'text-left px-2.5 py-2 text-[10px] font-bold text-muted uppercase tracking-[0.3px]'
const thNum = `${thS} text-right`
const tdS = 'px-2.5 py-2 text-[#1a2535]'
const tdNum = 'px-2.5 py-2 text-right text-[#1a2535] tabular-nums'
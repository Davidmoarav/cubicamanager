'use client'
// app/(protected)/finanzas/page.tsx — v2 con IVA y PRESUPUESTO

import { useState, useEffect, useCallback, useMemo } from 'react'
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

  const [facturas, setFacturas]     = useState<any[]>([])
  const [empleados, setEmpleados]   = useState<any[]>([])
  const [iva, setIva]               = useState<any[]>([])
  const [presupuesto, setPresupuesto] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [f, e, i, p] = await Promise.all([
      fetch('/api/facturas').then(r => r.json()).catch(() => []),
      fetch('/api/empleados').then(r => r.json()).catch(() => []),
      fetch('/api/iva').then(r => r.json()).catch(() => []),
      fetch('/api/presupuesto').then(r => r.json()).catch(() => []),
    ])
    setFacturas(Array.isArray(f) ? f : [])
    setEmpleados(Array.isArray(e) ? e : [])
    setIva(Array.isArray(i) ? i : [])
    setPresupuesto(Array.isArray(p) ? p : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  const ivaTotales = useMemo(() => {
    if (!ivaPeriodo) return { debito: 0, credito: 0, pagar: 0 }
    return {
      debito: ivaPeriodo.iva_debito,
      credito: ivaPeriodo.iva_credito,
      pagar: ivaPeriodo.iva_a_pagar,
    }
  }, [ivaPeriodo])

  if (loading) return <p style={{ color: '#6b7a8d', padding: 20 }}>Cargando...</p>

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
          <div className="flex items-center justify-between mb-4 bg-white border border-line rounded-xl p-3 shadow-card">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-ink">Período:</span>
              <select value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}
                className="input-base cursor-pointer" style={{ width: 'auto', minWidth: 160 }}>
                {periodosDisponibles.map(per => (
                  <option key={per} value={per}>{labelPeriodo(per)}</option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-muted">El conteo se reinicia cada mes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <MetricCard label="IVA Débito (ventas)"  value={fmt(ivaTotales.debito)}  sub="IVA que cobraste"   subColor="#1e6bb8" />
            <MetricCard label="IVA Crédito (compras)" value={fmt(ivaTotales.credito)} sub="IVA que pagaste"    subColor="#1a7a4a" />
            <MetricCard label="IVA a pagar al SII"   value={fmt(ivaTotales.pagar)}   sub={ivaTotales.pagar >= 0 ? 'Por pagar' : 'A favor'} subColor={ivaTotales.pagar >= 0 ? '#b0401a' : '#1a7a4a'} />
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
              ? <p style={{ color: '#6b7a8d', textAlign: 'center', padding: 20, fontSize: 13 }}>
                  No hay facturas registradas. Agrega facturas de venta y compra para calcular el IVA.
                </p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e4e9f0' }}>
                      <th style={thS}>Período</th>
                      <th style={thNum}>Ventas (neto)</th>
                      <th style={thNum}>IVA Débito</th>
                      <th style={thNum}>Compras (neto)</th>
                      <th style={thNum}>IVA Crédito</th>
                      <th style={thNum}>IVA a pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iva.map(p => (
                      <tr key={p.periodo} onClick={() => setPeriodoSel(p.periodo)}
                        style={{ borderBottom: '1px solid #f0f4f8', cursor: 'pointer',
                          background: p.periodo === periodoSel ? '#e8f1fb' : 'transparent' }}>
                        <td style={{ ...tdS, fontWeight: 700 }}>{labelPeriodo(p.periodo)}</td>
                        <td style={tdNum}>{fmt(p.neto_ventas)}</td>
                        <td style={{ ...tdNum, color: '#1e6bb8' }}>{fmt(p.iva_debito)}</td>
                        <td style={tdNum}>{fmt(p.neto_compras)}</td>
                        <td style={{ ...tdNum, color: '#1a7a4a' }}>{fmt(p.iva_credito)}</td>
                        <td style={{ ...tdNum, fontWeight: 800, color: p.iva_a_pagar >= 0 ? '#b0401a' : '#1a7a4a' }}>
                          {fmt(p.iva_a_pagar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            <p style={{ fontSize: 11, color: '#6b7a8d', marginTop: 12 }}>
              IVA a pagar = IVA Débito (ventas) − IVA Crédito (compras). Valor positivo = pagas al SII; negativo = remanente a favor.
            </p>
          </div>
        </div>
      )}

      {/* ══════ AVANCE PRESUPUESTARIO ══════ */}
      {tab === 'presupuesto' && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7a8d', marginBottom: 18 }}>
            Compara el avance físico de cada obra con el presupuesto ejecutado a la fecha (suma del % de avance × valor de cada partida).
          </p>

          {presupuesto.length === 0
            ? <div style={{ background: '#f8fafc', border: '1px dashed #d1d9e6', borderRadius: 10, padding: 30, textAlign: 'center', fontSize: 13, color: '#6b7a8d' }}>
                No hay proyectos con partidas cargadas. Agrega partidas de obra en cada proyecto para ver el avance presupuestario.
              </div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {presupuesto.map(p => {
                  const desviacion = p.pct_presupuesto - p.avance_fisico
                  const alerta = desviacion > 10  // gasto va más rápido que avance físico
                  return (
                    <div key={p.proyecto_id} style={{
                      background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: 18,
                      borderLeft: `4px solid ${alerta ? '#b0401a' : '#1a7a4a'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2535' }}>{p.nombre}</div>
                          <div style={{ fontSize: 12, color: '#6b7a8d' }}>{p.cliente} · {p.n_partidas} partidas</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#6b7a8d' }}>Valor contrato</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2535' }}>{fmtM(p.valor_contrato)}</div>
                        </div>
                      </div>

                      {/* Doble barra: físico vs presupuesto */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: '#6b7a8d' }}>Avance físico de obra</span>
                          <span style={{ fontWeight: 700, color: '#1e6bb8' }}>{p.avance_fisico}%</span>
                        </div>
                        <div style={{ height: 8, background: '#e8edf2', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.avance_fisico}%`, background: '#1e6bb8', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: '#6b7a8d' }}>Presupuesto ejecutado</span>
                          <span style={{ fontWeight: 700, color: alerta ? '#b0401a' : '#1a7a4a' }}>{p.pct_presupuesto}%</span>
                        </div>
                        <div style={{ height: 8, background: '#e8edf2', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.pct_presupuesto}%`, background: alerta ? '#b0401a' : '#1a7a4a', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #f0f4f8' }}>
                        <div style={{ fontSize: 12, color: '#6b7a8d' }}>
                          Ejecutado: <strong style={{ color: '#1a2535' }}>{fmt(p.ejecutado)}</strong> de {fmt(p.presupuesto_partidas)}
                        </div>
                        {alerta && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#b0401a', background: '#fdecea', padding: '3px 10px', borderRadius: 12 }}>
                            ⚠ Gasto {desviacion}% sobre avance físico
                          </span>
                        )}
                        {!alerta && desviacion < -10 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1a7a4a', background: '#e6f4ed', padding: '3px 10px', borderRadius: 12 }}>
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

const thS: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6b7a8d', textTransform: 'uppercase', letterSpacing: 0.3 }
const thNum: React.CSSProperties = { ...thS, textAlign: 'right' }
const tdS: React.CSSProperties = { padding: '8px 10px', color: '#1a2535' }
const tdNum: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', color: '#1a2535', fontVariantNumeric: 'tabular-nums' }

'use client'
// components/PresupuestoPanel.tsx
//
// Administra el presupuesto de la obra y los Estados de Pago.
// - Vista de presupuesto: planificado vs ejecutado vs cobrado
// - Estados de pago: cortes mensuales de avance, editables, con factura

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Btn, FormInput, Modal } from '@/components/ui'
import { fmt, fmtM } from '@/lib/format'
import { ESTADO_EP, type EstadoPago } from '@/types/estado-pago'

interface Props {
  proyectoId: string
  valorContrato: number
}

const IVA = 0.19

export default function PresupuestoPanel({ proyectoId, valorContrato }: Props) {
  const [eps, setEps]         = useState<EstadoPago[]>([])
  const [loading, setLoading] = useState(true)
  const [resumen, setResumen] = useState({ presupuesto: 0, ejecutado: 0, cobrado: 0, costo: 0, ganancia: 0, markup_real: 0, margen_venta: 0, costo_ejecutado: 0, ganancia_ejecutada: 0, gasto_real: 0, gasto_manual: 0, gasto_facturas: 0, desviacion: 0, ganancia_real: 0, pct_gastado: 0, gasto_por_partida: {} as Record<string, number> })

  // Gastos reales de la obra
  const [gastos, setGastos]     = useState<any[]>([])
  const [partidas, setPartidas] = useState<any[]>([])
  const [modalGasto, setModalGasto] = useState(false)
  const [gastoForm, setGastoForm]   = useState<any>({})
  const [savingGasto, setSavingGasto] = useState(false)

  // Modal nuevo EP
  const [modal, setModal]       = useState(false)
  const [sugerencia, setSugerencia] = useState<any>(null)
  const [detalleEdit, setDetalleEdit] = useState<any[]>([])
  const [retencion, setRetencion]   = useState(0)
  const [anticipo, setAnticipo]     = useState(0)
  const [notas, setNotas]           = useState('')
  const [saving, setSaving]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [epData, presData, gastosData, partData] = await Promise.all([
      fetch(`/api/estados-pago?proyecto_id=${proyectoId}`).then(r => r.json()),
      fetch('/api/presupuesto').then(r => r.json()).catch(() => []),
      fetch(`/api/gastos-obra?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/partidas-proyecto?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
    ])
    const epList = Array.isArray(epData) ? epData : []
    setEps(epList)
    setGastos(Array.isArray(gastosData) ? gastosData : [])
    setPartidas(Array.isArray(partData) ? partData.filter((x: any) => !x.parent_id) : [])

    // Resumen presupuestario de este proyecto
    const p = Array.isArray(presData) ? presData.find((x: any) => x.proyecto_id === proyectoId) : null
    const cobrado = epList
      .filter(e => e.estado === 'pagado')
      .reduce((s, e) => s + (e.monto_pagar || 0), 0)
    setResumen({
      presupuesto: p?.presupuesto_venta || p?.presupuesto_partidas || 0,
      ejecutado: p?.ejecutado || 0,
      cobrado,
      costo: p?.presupuesto_costo || 0,
      ganancia: p?.ganancia_esperada || 0,
      markup_real: p?.markup_real || 0,
      margen_venta: p?.margen_venta_pct || 0,
      costo_ejecutado: p?.costo_ejecutado || 0,
      ganancia_ejecutada: p?.ganancia_ejecutada || 0,
      gasto_real: p?.gasto_real || 0,
      gasto_manual: p?.gasto_manual || 0,
      gasto_facturas: p?.gasto_facturas || 0,
      desviacion: p?.desviacion || 0,
      ganancia_real: p?.ganancia_real || 0,
      pct_gastado: p?.pct_gastado || 0,
      gasto_por_partida: p?.gasto_por_partida || {},
    })
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { load() }, [load])

  // ─── Gastos reales ───────────────────────────────────────
  const openNuevoGasto = () => {
    setGastoForm({ categoria: 'materiales', fecha: new Date().toISOString().split('T')[0], partida_id: '', descripcion: '', monto: 0, proveedor: '', documento: '' })
    setModalGasto(true)
  }
  const updGasto = (k: string, v: any) => setGastoForm((f: any) => ({ ...f, [k]: v }))
  const guardarGasto = async () => {
    if (!gastoForm.descripcion) { alert('Describe el gasto'); return }
    if (!gastoForm.monto || Number(gastoForm.monto) <= 0) { alert('El monto debe ser mayor a cero'); return }
    setSavingGasto(true)
    const res = await fetch('/api/gastos-obra', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gastoForm, proyecto_id: proyectoId, monto: Number(gastoForm.monto), partida_id: gastoForm.partida_id || null }),
    })
    setSavingGasto(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar el gasto: ' + (err.error || 'error') +
        '\n\nSi menciona "gastos_obra", ejecuta el SQL 15_gastos_obra.sql en Supabase.')
      return
    }
    await load(); setModalGasto(false)
  }
  const delGasto = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    await fetch('/api/gastos-obra', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const CAT_LABEL: Record<string, string> = {
    mano_obra: '👷 Mano de obra', materiales: '🧱 Materiales', equipos: '🚜 Equipos',
    subcontrato: '🔧 Subcontrato', fletes: '🚚 Fletes', otros: '📦 Otros',
  }

  // ─── Abrir modal: pedir sugerencia de EP ─────────────────
  const openNuevoEP = async () => {
    const res = await fetch(`/api/estados-pago?proyecto_id=${proyectoId}&sugerir=1`)
    const sug = await res.json()
    setSugerencia(sug)
    setDetalleEdit((sug.detalle || []).map((d: any) => ({ ...d })))
    setRetencion(0)
    setAnticipo(0)
    setNotas('')
    setModal(true)
  }

  // Permite editar el monto de cada línea
  const updDetalle = (idx: number, monto: number) => {
    setDetalleEdit(prev => prev.map((d, i) => i === idx ? { ...d, monto } : d))
  }

  const montoNeto = useMemo(
    () => detalleEdit.reduce((s, d) => s + (Number(d.monto) || 0), 0),
    [detalleEdit]
  )
  const retencionMonto = Math.round(montoNeto * retencion / 100)
  const montoPagar = montoNeto - retencionMonto - anticipo
  const ivaCalc = Math.round(montoPagar * IVA)
  const totalCalc = montoPagar + ivaCalc

  const guardarEP = async () => {
    if (montoNeto <= 0) { alert('El monto del estado de pago debe ser mayor a cero'); return }
    setSaving(true)
    await fetch('/api/estados-pago', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto_id: proyectoId,
        numero: sugerencia.numero,
        periodo: new Date().toISOString().slice(0, 7),
        fecha: new Date().toISOString().split('T')[0],
        monto_neto: montoNeto,
        retencion_pct: retencion,
        anticipo_desc: anticipo,
        notas,
        detalle: detalleEdit,
      }),
    })
    await load(); setSaving(false); setModal(false)
  }

  const cambiarEstado = async (ep: EstadoPago, estado: string, generarFactura = false) => {
    const res = await fetch('/api/estados-pago', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ep.id, estado, generar_factura: generarFactura }),
    })
    const data = await res.json()
    if (data.factura_generada) alert('✓ Factura generada en el módulo de Facturación')
    await load()
  }

  const delEP = async (id: string) => {
    if (!confirm('¿Eliminar este estado de pago?')) return
    await fetch('/api/estados-pago', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  const totalCobradoConIva = eps.filter(e => e.estado === 'pagado').reduce((s, e) => s + (e.total || 0), 0)
  const pctCobrado = valorContrato > 0 ? Math.round(totalCobradoConIva / valorContrato * 100) : 0

  if (loading) return <p style={{ color: '#6b7a8d', textAlign: 'center', padding: 20 }}>Cargando...</p>

  return (
    <div>
      {/* Presupuesto vs Gasto REAL */}
      <div className="bg-canvas border border-line rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wide">Presupuesto vs gasto real</div>
          <button onClick={openNuevoGasto} className="text-[12px] font-bold text-brand bg-brand-bg px-3 py-1 rounded-lg hover:bg-brand hover:text-white transition">
            + Registrar gasto
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[11px] text-muted">Presupuestado (costo)</div>
            <div className="text-base font-bold text-[#b07d1a]">{fmt(resumen.costo)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Gasto real</div>
            <div className="text-base font-bold text-danger">{fmt(resumen.gasto_real)}</div>
            <div className="text-[10px] text-muted">{resumen.pct_gastado}% del presupuesto</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Desviación</div>
            <div className={`text-base font-bold ${resumen.desviacion >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.desviacion >= 0 ? '+' : ''}{fmt(resumen.desviacion)}
            </div>
            <div className="text-[10px] text-muted">{resumen.desviacion >= 0 ? 'Bajo presupuesto ✓' : '⚠ Te pasaste'}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Ganancia real a la fecha</div>
            <div className={`text-base font-bold ${resumen.ganancia_real >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(resumen.ganancia_real)}</div>
            <div className="text-[10px] text-muted">venta ejec. − gasto real</div>
          </div>
        </div>
        {/* Barra presupuesto vs gasto */}
        <div className="mt-3">
          <div className="h-2.5 bg-[#e8edf2] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${resumen.pct_gastado > 100 ? 'bg-danger' : 'bg-warning'}`}
              style={{ width: `${Math.min(100, resumen.pct_gastado)}%` }} />
          </div>
        </div>
        {/* Desglose del gasto real */}
        {resumen.gasto_real > 0 && (
          <div className="flex gap-4 mt-3 text-[11px] text-muted">
            <span>🧾 Facturas proveedores: {fmt(resumen.gasto_facturas)}</span>
            <span>✍️ Gastos manuales: {fmt(resumen.gasto_manual)}</span>
          </div>
        )}
      </div>

      {/* Lista de gastos registrados */}
      {gastos.length > 0 && (
        <div className="bg-white border border-line rounded-xl p-4 mb-5">
          <div className="text-[12px] font-bold text-ink mb-3">Gastos registrados ({gastos.length})</div>
          <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
            {gastos.map(g => {
              const partida = partidas.find(p => p.id === g.partida_id)
              return (
                <div key={g.id} className="flex items-center justify-between py-2 px-3 bg-canvas rounded-lg text-[12px]">
                  <div className="flex-1">
                    <span className="font-semibold text-ink">{g.descripcion}</span>
                    <div className="text-[10px] text-muted">
                      {CAT_LABEL[g.categoria] || g.categoria} · {g.fecha}
                      {partida && ` · ${partida.descripcion}`}
                      {g.proveedor && ` · ${g.proveedor}`}
                    </div>
                  </div>
                  <div className="font-bold text-danger tabular-nums mr-3">{fmt(g.monto)}</div>
                  <button onClick={() => delGasto(g.id)} className="text-danger text-[14px] hover:opacity-70">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen de ganancia esperada (planificación) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <ResumenCard label="Presupuesto costo" valor={fmtM(resumen.costo)} color="#b07d1a" sub="Lo planificado" />
        <ResumenCard label="Precio venta" valor={fmtM(resumen.presupuesto)} color="#1e6bb8" sub="Lo que cobras (neto)" />
        <ResumenCard label="Ganancia esperada" valor={fmtM(resumen.ganancia)} color="#1a7a4a" sub={`Margen ${resumen.margen_venta}%`} />
        <ResumenCard label="Cobrado" valor={fmtM(totalCobradoConIva)} color="#534ab7" sub={`${pctCobrado}% del contrato`} />
      </div>

      {/* Barra cobrado vs contrato */}
      <div className="mb-6">
        <div className="flex justify-between text-[11px] text-muted mb-1">
          <span>Avance de cobro</span>
          <span className="font-bold text-success">{pctCobrado}%</span>
        </div>
        <div className="h-2.5 bg-[#e8edf2] rounded-full overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${pctCobrado}%` }} />
        </div>
      </div>

      {/* ─── ESTADOS DE PAGO ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2535' }}>
          Estados de pago ({eps.length})
        </div>
        <Btn variant="primary" onClick={openNuevoEP} style={{ fontSize: 12, padding: '5px 12px' }}>
          + Nuevo estado de pago
        </Btn>
      </div>

      {eps.length === 0
        ? <div style={{ background: '#f8fafc', border: '1px dashed #d1d9e6', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 12, color: '#6b7a8d' }}>
            Sin estados de pago. Crea el primero cuando tengas avance de obra que cobrar.
          </div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {eps.map(ep => {
              const s = ESTADO_EP[ep.estado] || ESTADO_EP.borrador
              return (
                <div key={ep.id} style={{ border: '1px solid #e4e9f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a2535' }}>EP N°{ep.numero}</span>
                        <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>{s.label}</span>
                        {ep.factura_id && <span style={{ fontSize: 10, color: '#534ab7', fontWeight: 600 }}>🧾 Facturado</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7a8d', marginTop: 3 }}>
                        {ep.periodo} · {ep.fecha}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#1a2535' }}>{fmt(ep.total)}</div>
                      <div style={{ fontSize: 10, color: '#6b7a8d' }}>Neto {fmt(ep.monto_pagar)} + IVA</div>
                    </div>
                  </div>

                  {/* Desglose */}
                  {(ep.retencion_monto > 0 || ep.anticipo_desc > 0) && (
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#6b7a8d', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f4f8' }}>
                      <span>Avance: {fmt(ep.monto_neto)}</span>
                      {ep.retencion_monto > 0 && <span style={{ color: '#b0401a' }}>− Retención {ep.retencion_pct}%: {fmt(ep.retencion_monto)}</span>}
                      {ep.anticipo_desc > 0 && <span style={{ color: '#b0401a' }}>− Anticipo: {fmt(ep.anticipo_desc)}</span>}
                    </div>
                  )}

                  {/* Acciones por estado */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {ep.estado === 'borrador' && (
                      <Btn onClick={() => cambiarEstado(ep, 'presentado')} style={{ fontSize: 11, padding: '4px 10px' }}>Marcar presentado</Btn>
                    )}
                    {ep.estado === 'presentado' && (
                      <>
                        <Btn onClick={() => cambiarEstado(ep, 'aprobado')} style={{ fontSize: 11, padding: '4px 10px', background: '#e6f4ed', borderColor: '#b9e0c9', color: '#1a7a4a' }}>Aprobar</Btn>
                        <Btn onClick={() => cambiarEstado(ep, 'rechazado')} style={{ fontSize: 11, padding: '4px 10px', background: '#fdecea', borderColor: '#f5c6c2', color: '#b0401a' }}>Rechazar</Btn>
                      </>
                    )}
                    {ep.estado === 'aprobado' && (
                      <>
                        {!ep.factura_id && (
                          <Btn onClick={() => cambiarEstado(ep, 'aprobado', true)} style={{ fontSize: 11, padding: '4px 10px', background: '#eeedfe', borderColor: '#ccc5fc', color: '#534ab7', fontWeight: 700 }}>🧾 Generar factura</Btn>
                        )}
                        <Btn onClick={() => cambiarEstado(ep, 'pagado')} style={{ fontSize: 11, padding: '4px 10px', background: '#e6f4ed', borderColor: '#b9e0c9', color: '#1a7a4a' }}>Marcar pagado</Btn>
                      </>
                    )}
                    {ep.estado !== 'pagado' && (
                      <button onClick={() => delEP(ep.id)} style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', border: 'none', color: '#b0401a', cursor: 'pointer', marginLeft: 'auto' }}>Eliminar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {/* ═══ MODAL NUEVO EP ═══ */}
      {modal && sugerencia && (
        <Modal title={`Nuevo Estado de Pago N°${sugerencia.numero}`} onClose={() => setModal(false)}>
          {detalleEdit.length === 0
            ? <div style={{ textAlign: 'center', padding: 20 }}>
                <p style={{ fontSize: 13, color: '#6b7a8d' }}>No hay avance nuevo para cobrar.</p>
                <p style={{ fontSize: 12, color: '#6b7a8d', marginTop: 6 }}>Actualiza el avance de las partidas en la pestaña "Control de obra" antes de crear un estado de pago.</p>
              </div>
            : (
              <>
                <p style={{ fontSize: 12, color: '#6b7a8d', marginBottom: 14 }}>
                  Avance a cobrar por partida (sugerido desde el control de obra, editable).
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
                  {detalleEdit.map((d, idx) => (
                    <div key={d.partida_id} style={{ background: '#fafbfc', border: '1px solid #e4e9f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2535', marginBottom: 6 }}>{d.descripcion}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 11, color: '#6b7a8d' }}>
                          {d.avance_anterior}% → {d.avance_actual}% <span style={{ color: '#1a7a4a', fontWeight: 700 }}>(+{d.avance_periodo}%)</span>
                          <br/>de {fmt(d.valor_partida)}
                        </div>
                        <div style={{ width: 150 }}>
                          <label style={{ fontSize: 10, color: '#6b7a8d', display: 'block', marginBottom: 2 }}>Monto a cobrar</label>
                          <input type="number" value={d.monto}
                            onChange={e => updDetalle(idx, Number(e.target.value))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d9e6', borderRadius: 6, fontSize: 13, textAlign: 'right', fontWeight: 700 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Deducciones */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <FormInput label="Retención garantía (%)" value={retencion} onChange={v => setRetencion(Number(v) || 0)} type="number" />
                  <FormInput label="Amortización anticipo ($)" value={anticipo} onChange={v => setAnticipo(Number(v) || 0)} type="number" />
                </div>

                {/* Totales */}
                <div style={{ background: '#f0f4f8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <Row label="Avance del período (neto)" valor={fmt(montoNeto)} />
                  {retencionMonto > 0 && <Row label={`Retención ${retencion}%`} valor={`− ${fmt(retencionMonto)}`} color="#b0401a" />}
                  {anticipo > 0 && <Row label="Amortización anticipo" valor={`− ${fmt(anticipo)}`} color="#b0401a" />}
                  <Row label="IVA (19%)" valor={fmt(ivaCalc)} />
                  <div style={{ borderTop: '1px solid #d1d9e6', marginTop: 6, paddingTop: 6 }}>
                    <Row label="Total a facturar" valor={fmt(totalCalc)} bold />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <FormInput label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Ej: Incluye trabajos extraordinarios aprobados" />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Btn onClick={() => setModal(false)}>Cancelar</Btn>
                  <Btn variant="primary" onClick={guardarEP} disabled={saving}>{saving ? 'Guardando...' : 'Crear estado de pago'}</Btn>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* ═══ MODAL NUEVO GASTO ═══ */}
      {modalGasto && (
        <Modal title="Registrar gasto de obra" onClose={() => setModalGasto(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label-base">Descripción *</label>
              <input className="input-base" value={gastoForm.descripcion || ''} onChange={e => updGasto('descripcion', e.target.value)} placeholder="Ej: Compra de cemento, jornales semana 3" />
            </div>
            <div>
              <label className="label-base">Categoría</label>
              <select className="input-base cursor-pointer" value={gastoForm.categoria || 'materiales'} onChange={e => updGasto('categoria', e.target.value)}>
                <option value="mano_obra">👷 Mano de obra</option>
                <option value="materiales">🧱 Materiales</option>
                <option value="equipos">🚜 Equipos</option>
                <option value="subcontrato">🔧 Subcontrato</option>
                <option value="fletes">🚚 Fletes</option>
                <option value="otros">📦 Otros</option>
              </select>
            </div>
            <div>
              <label className="label-base">Monto ($) *</label>
              <input type="number" className="input-base" value={gastoForm.monto || ''} onChange={e => updGasto('monto', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label-base">Partida (a qué se imputa)</label>
              <select className="input-base cursor-pointer" value={gastoForm.partida_id || ''} onChange={e => updGasto('partida_id', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {partidas.map(p => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
              </select>
            </div>
            <div>
              <label className="label-base">Fecha</label>
              <input type="date" className="input-base" value={gastoForm.fecha || ''} onChange={e => updGasto('fecha', e.target.value)} />
            </div>
            <div>
              <label className="label-base">Proveedor (opcional)</label>
              <input className="input-base" value={gastoForm.proveedor || ''} onChange={e => updGasto('proveedor', e.target.value)} />
            </div>
            <div>
              <label className="label-base">N° documento (opcional)</label>
              <input className="input-base" value={gastoForm.documento || ''} onChange={e => updGasto('documento', e.target.value)} placeholder="Boleta/factura/vale" />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Btn onClick={() => setModalGasto(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardarGasto} disabled={savingGasto}>{savingGasto ? 'Guardando...' : 'Registrar gasto'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ResumenCard({ label, valor, color, sub }: { label: string; valor: string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#6b7a8d', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: '#6b7a8d', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Row({ label, valor, color, bold }: { label: string; valor: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 15 : 13, marginBottom: 3 }}>
      <span style={{ color: color || '#6b7a8d', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ color: color || '#1a2535', fontWeight: bold ? 800 : 600 }}>{valor}</span>
    </div>
  )
}

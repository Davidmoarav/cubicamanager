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
import DescargarEPBtn from '@/components/DescargarEPBtn'

interface Props {
  proyectoId: string
  valorContrato: number
  proyectoNombre?: string
  proyectoCliente?: string
  proyectoDireccion?: string
}

const IVA = 0.19

export default function PresupuestoPanel({ proyectoId, valorContrato, proyectoNombre = '', proyectoCliente = '', proyectoDireccion = '' }: Props) {
  const [eps, setEps]         = useState<EstadoPago[]>([])
  const [loading, setLoading] = useState(true)
  const [resumen, setResumen] = useState({ presupuesto: 0, ejecutado: 0, cobrado: 0, costo: 0, ganancia: 0, markup_real: 0, margen_venta: 0, costo_ejecutado: 0, ganancia_ejecutada: 0, gasto_real: 0, gasto_manual: 0, gasto_facturas: 0, desviacion: 0, ganancia_real: 0, pct_gastado: 0, gasto_por_partida: {} as Record<string, number>, detalle_partidas: [] as any[] })

  // Gastos reales de la obra
  const [gastos, setGastos]     = useState<any[]>([])
  const [partidas, setPartidas] = useState<any[]>([])
  const [modalGasto, setModalGasto] = useState(false)
  const [gastoForm, setGastoForm]   = useState<any>({})
  const [savingGasto, setSavingGasto] = useState(false)

  // Modal nuevo EP — cascada completa
  const [modal, setModal]       = useState(false)
  const [sugerencia, setSugerencia] = useState<any>(null)
  const [detalleEdit, setDetalleEdit] = useState<any[]>([])
  const [utilidadPct, setUtilidadPct] = useState(0)
  const [ggPct, setGgPct]           = useState(0)
  const [descuentos, setDescuentos] = useState(0)
  const [anticipoPct, setAnticipoPct] = useState(0)
  const [multas, setMultas]         = useState(0)
  const [retencionPct, setRetencionPct] = useState(0)
  const [notas, setNotas]           = useState('')
  const [saving, setSaving]         = useState(false)

  // Control de retenciones — devoluciones/liberaciones
  const [devoluciones, setDevoluciones] = useState<any[]>([])
  const [modalDev, setModalDev]     = useState(false)
  const [devForm, setDevForm]       = useState<{ tipo: string; monto: number; fecha: string; glosa: string }>({ tipo: 'retencion', monto: 0, fecha: '', glosa: '' })
  const [savingDev, setSavingDev]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [epData, presData, gastosData, partData, devData] = await Promise.all([
      fetch(`/api/estados-pago?proyecto_id=${proyectoId}`).then(r => r.json()),
      fetch(`/api/presupuesto?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/gastos-obra?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/partidas-proyecto?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/devoluciones?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
    ])
    const epList = Array.isArray(epData) ? epData : []
    setEps(epList)
    setGastos(Array.isArray(gastosData) ? gastosData : [])
    setPartidas(Array.isArray(partData) ? partData.filter((x: any) => !x.parent_id) : [])
    setDevoluciones(Array.isArray(devData) ? devData : [])

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
      detalle_partidas: p?.detalle_partidas || [],
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

  // ─── Abrir modal: pedir sugerencia de EP (trae % del proyecto) ──
  const openNuevoEP = async () => {
    const res = await fetch(`/api/estados-pago?proyecto_id=${proyectoId}&sugerir=1`)
    const sug = await res.json()
    setSugerencia(sug)
    setDetalleEdit((sug.detalle || []).map((d: any) => ({ ...d })))
    setUtilidadPct(Number(sug.utilidad_pct) || 0)
    setGgPct(Number(sug.gg_pct) || 0)
    setAnticipoPct(Number(sug.anticipo_pct) || 0)
    setRetencionPct(Number(sug.retencion_pct) || 0)
    setDescuentos(0)
    setMultas(0)
    setNotas('')
    setModal(true)
  }

  // Permite editar el monto de cada línea
  const updDetalle = (idx: number, monto: number) => {
    setDetalleEdit(prev => prev.map((d, i) => i === idx ? { ...d, monto } : d))
  }

  // ─── Cascada en vivo (idéntica al servidor) ──────────────
  const avanceObra = useMemo(
    () => detalleEdit.reduce((s, d) => s + (Number(d.monto) || 0), 0),
    [detalleEdit]
  )
  const utilidadMonto  = Math.round(avanceObra * utilidadPct / 100)
  const ggMonto        = Math.round(avanceObra * ggPct / 100)
  const bruto          = avanceObra + utilidadMonto + ggMonto
  const anticipoDesc   = Math.round(bruto * anticipoPct / 100)
  const retencionMonto = Math.round(bruto * retencionPct / 100)
  const totalNeto      = bruto - descuentos - anticipoDesc - multas - retencionMonto
  const ivaCalc        = Math.round(totalNeto * IVA)
  const totalCalc      = totalNeto + ivaCalc

  const guardarEP = async () => {
    if (avanceObra <= 0) { alert('El avance de obra del período debe ser mayor a cero'); return }
    setSaving(true)
    await fetch('/api/estados-pago', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto_id: proyectoId,
        numero: sugerencia.numero,
        periodo: new Date().toISOString().slice(0, 7),
        fecha: new Date().toISOString().split('T')[0],
        avance_obra: avanceObra,
        utilidad_pct: utilidadPct,
        gg_pct: ggPct,
        descuentos,
        anticipo_pct: anticipoPct,
        multas,
        retencion_pct: retencionPct,
        notas,
        detalle: detalleEdit,
      }),
    })
    await load(); setSaving(false); setModal(false)
  }

  // ─── Control de retenciones (acumulados + devoluciones + saldo) ──
  const control = useMemo(() => {
    const epsValidos = eps.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
    const retDescontada = epsValidos.reduce((s, e) => s + (e.retencion_monto || 0), 0)
    const antAmortizado = epsValidos.reduce((s, e) => s + (e.anticipo_desc || 0), 0)
    const retDevuelta = devoluciones.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (d.monto || 0), 0)
    const antDevuelto = devoluciones.filter(d => d.tipo === 'anticipo').reduce((s, d) => s + (d.monto || 0), 0)
    return {
      retDescontada, retDevuelta, retSaldo: retDescontada - retDevuelta,
      antAmortizado, antDevuelto, antSaldo: antAmortizado - antDevuelto,
    }
  }, [eps, devoluciones])

  const abrirDev = (tipo: 'retencion' | 'anticipo') => {
    setDevForm({ tipo, monto: 0, fecha: new Date().toISOString().split('T')[0], glosa: '' })
    setModalDev(true)
  }

  const guardarDev = async () => {
    if (devForm.monto <= 0) { alert('El monto debe ser mayor a cero'); return }
    setSavingDev(true)
    await fetch('/api/devoluciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, ...devForm }),
    })
    await load(); setSavingDev(false); setModalDev(false)
  }

  const eliminarDev = async (id: string) => {
    if (!confirm('¿Eliminar esta devolución?')) return
    await fetch('/api/devoluciones', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
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

  if (loading) return <p className="text-center py-5 text-muted text-[13px]">Cargando...</p>

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

      {/* Consumo del presupuesto por partida */}
      {resumen.detalle_partidas.some((d: any) => d.presupuesto_costo > 0 || d.gastado > 0) && (
        <div className="bg-white border border-line rounded-xl p-4 mb-5">
          <div className="text-[12px] font-bold text-ink mb-3">Consumo por partida</div>
          <div className="flex flex-col gap-2.5">
            {resumen.detalle_partidas
              .filter((d: any) => d.presupuesto_costo > 0 || d.gastado > 0)
              .map((d: any) => {
                const sobre = d.pct_gastado > 100
                return (
                  <div key={d.id}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-semibold text-ink truncate mr-3">{d.descripcion}</span>
                      <span className="text-muted tabular-nums whitespace-nowrap">
                        {fmt(d.gastado)} / {fmt(d.presupuesto_costo)}
                        <span className={`ml-2 font-bold ${sobre ? 'text-danger' : 'text-muted'}`}>{d.pct_gastado}%</span>
                      </span>
                    </div>
                    <div className="h-2 bg-[#e8edf2] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${sobre ? 'bg-danger' : 'bg-warning'}`}
                        style={{ width: `${Math.min(100, d.pct_gastado)}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
          <div className="text-[10px] text-muted mt-3">Gastado real vs presupuesto de costo. En rojo, las partidas que superan lo presupuestado.</div>
        </div>
      )}

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
        <ResumenCard label="Presupuesto costo" valor={fmtM(resumen.costo)} colorCls="text-warning" sub="Lo planificado" />
        <ResumenCard label="Precio venta" valor={fmtM(resumen.presupuesto)} colorCls="text-brand" sub="Lo que cobras (neto)" />
        <ResumenCard label="Ganancia esperada" valor={fmtM(resumen.ganancia)} colorCls="text-success" sub={`Margen ${resumen.margen_venta}%`} />
        <ResumenCard label="Cobrado" valor={fmtM(totalCobradoConIva)} colorCls="text-accent" sub={`${pctCobrado}% del contrato`} />
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
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-bold text-ink">
          Estados de pago ({eps.length})
        </div>
        <Btn variant="primary" onClick={openNuevoEP} className="!text-[12px] !px-3 !py-[5px]">
          + Nuevo estado de pago
        </Btn>
      </div>

      {eps.length === 0
        ? <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
            Sin estados de pago. Crea el primero cuando tengas avance de obra que cobrar.
          </div>
        : (
          <div className="flex flex-col gap-2">
            {eps.map(ep => {
              const s = ESTADO_EP[ep.estado] || ESTADO_EP.borrador
              return (
                <div key={ep.id} className="border border-line rounded-card p-3.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ink">EP N°{ep.numero}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: s.bg, color: s.color }} >{s.label}</span>
                        {ep.factura_id && <span className="text-[10px] text-accent font-semibold">🧾 Facturado</span>}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {ep.periodo} · {ep.fecha}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold text-ink">{fmt(ep.total)}</div>
                      <div className="text-[10px] text-muted">Neto {fmt(ep.monto_pagar)} + IVA</div>
                      <div className="mt-1">
                        <DescargarEPBtn ep={ep} proyecto={{ nombre: proyectoNombre, cliente: proyectoCliente, direccion: proyectoDireccion }} />
                      </div>
                    </div>
                  </div>

                  {/* Desglose */}
                  {(ep.bruto > 0 || ep.retencion_monto > 0 || ep.anticipo_desc > 0) && (
                    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted mt-2 pt-2 border-t border-[#f0f4f8]">
                      <span>Avance: {fmt(ep.avance_obra ?? ep.monto_neto)}</span>
                      {ep.utilidad_monto > 0 && <span className="text-success">+ Util. {ep.utilidad_pct}%: {fmt(ep.utilidad_monto)}</span>}
                      {ep.gg_monto > 0 && <span className="text-success">+ GG {ep.gg_pct}%: {fmt(ep.gg_monto)}</span>}
                      {ep.descuentos > 0 && <span className="text-danger">− Desc.: {fmt(ep.descuentos)}</span>}
                      {ep.anticipo_desc > 0 && <span className="text-danger">− Anticipo {ep.anticipo_pct}%: {fmt(ep.anticipo_desc)}</span>}
                      {ep.multas > 0 && <span className="text-danger">− Multas: {fmt(ep.multas)}</span>}
                      {ep.retencion_monto > 0 && <span className="text-danger">− Ret. {ep.retencion_pct}%: {fmt(ep.retencion_monto)}</span>}
                    </div>
                  )}

                  {/* Acciones por estado */}
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {ep.estado === 'borrador' && (
                      <Btn onClick={() => cambiarEstado(ep, 'presentado')} className="!text-[11px] !px-[10px] !py-1">Marcar presentado</Btn>
                    )}
                    {ep.estado === 'presentado' && (
                      <>
                        <Btn onClick={() => cambiarEstado(ep, 'aprobado')} className="!text-[11px] !px-[10px] !py-1 !bg-success-bg !border-[#b9e0c9] !text-success">Aprobar</Btn>
                        <Btn onClick={() => cambiarEstado(ep, 'rechazado')} className="!text-[11px] !px-[10px] !py-1 !bg-danger-bg !border-[#f5c6c2] !text-danger">Rechazar</Btn>
                      </>
                    )}
                    {ep.estado === 'aprobado' && (
                      <>
                        {!ep.factura_id && (
                          <Btn onClick={() => cambiarEstado(ep, 'aprobado', true)} className="!text-[11px] !px-[10px] !py-1 !bg-accent-bg !border-[#ccc5fc] !text-accent font-bold">🧾 Generar factura</Btn>
                        )}
                        <Btn onClick={() => cambiarEstado(ep, 'pagado')} className="!text-[11px] !px-[10px] !py-1 !bg-success-bg !border-[#b9e0c9] !text-success">Marcar pagado</Btn>
                      </>
                    )}
                    {ep.estado !== 'pagado' && (
                      <button onClick={() => delEP(ep.id)} className="text-[11px] px-2.5 py-1 bg-transparent border-none text-danger cursor-pointer ml-auto">Eliminar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {/* ═══ CONTROL DE RETENCIONES Y ANTICIPOS ═══ */}
      {eps.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[13px] font-bold text-ink">Control de retenciones y anticipos</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Retención */}
            <div className="border border-line rounded-card p-4">
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-[12px] font-bold text-accent uppercase tracking-wide">Retención de garantía</span>
                <button onClick={() => abrirDev('retencion')} className="text-[11px] font-bold px-2.5 py-1 bg-accent-bg text-accent rounded-md cursor-pointer border-none">+ Liberar</button>
              </div>
              <div className="flex flex-col gap-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-muted">Retenido acumulado</span><span className="font-bold text-ink">{fmt(control.retDescontada)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Devuelto al contratista</span><span className="font-bold text-success">− {fmt(control.retDevuelta)}</span></div>
                <div className="flex justify-between border-t border-line pt-1.5 mt-0.5"><span className="font-bold text-ink">Saldo por liberar</span><span className="font-extrabold text-danger">{fmt(control.retSaldo)}</span></div>
              </div>
            </div>

            {/* Anticipo */}
            <div className="border border-line rounded-card p-4">
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-[12px] font-bold text-accent uppercase tracking-wide">Anticipo</span>
                <button onClick={() => abrirDev('anticipo')} className="text-[11px] font-bold px-2.5 py-1 bg-accent-bg text-accent rounded-md cursor-pointer border-none">+ Devolver</button>
              </div>
              <div className="flex flex-col gap-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-muted">Amortizado acumulado</span><span className="font-bold text-ink">{fmt(control.antAmortizado)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Devuelto adicional</span><span className="font-bold text-success">− {fmt(control.antDevuelto)}</span></div>
                <div className="flex justify-between border-t border-line pt-1.5 mt-0.5"><span className="font-bold text-ink">Saldo</span><span className="font-extrabold text-brand">{fmt(control.antSaldo)}</span></div>
              </div>
            </div>
          </div>

          {/* Historial de devoluciones */}
          {devoluciones.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Movimientos registrados</span>
              {devoluciones.map(d => (
                <div key={d.id} className="flex justify-between items-center text-[12px] bg-canvas rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${d.tipo === 'retencion' ? 'bg-accent-bg text-accent' : 'bg-brand-bg text-brand'}`}>
                      {d.tipo === 'retencion' ? 'Retención' : 'Anticipo'}
                    </span>
                    <span className="text-muted">{d.fecha}</span>
                    {d.glosa && <span className="text-muted">· {d.glosa}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-ink">{fmt(d.monto)}</span>
                    <button onClick={() => eliminarDev(d.id)} className="text-danger text-[11px] bg-transparent border-none cursor-pointer">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL DEVOLUCIÓN ═══ */}
      {modalDev && (
        <Modal title={devForm.tipo === 'retencion' ? 'Liberar retención de garantía' : 'Devolver anticipo'} onClose={() => setModalDev(false)}>
          <div className="flex flex-col gap-3.5">
            <FormInput label="Monto ($)" value={devForm.monto} onChange={v => setDevForm(f => ({ ...f, monto: Number(v) || 0 }))} type="number" />
            <FormInput label="Fecha" value={devForm.fecha} onChange={v => setDevForm(f => ({ ...f, fecha: v }))} type="date" />
            <FormInput label="Glosa (opcional)" value={devForm.glosa} onChange={v => setDevForm(f => ({ ...f, glosa: v }))} placeholder="Ej: Liberación 50% garantía tras recepción provisoria" />
            <div className="flex gap-2 justify-end">
              <Btn onClick={() => setModalDev(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={guardarDev} disabled={savingDev}>{savingDev ? 'Guardando...' : 'Registrar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal && sugerencia && (
        <Modal title={`Nuevo Estado de Pago N°${sugerencia.numero}`} onClose={() => setModal(false)}>
          {detalleEdit.length === 0
            ? <div className="text-center py-5">
                <p className="text-[13px] text-muted">No hay avance nuevo para cobrar.</p>
                <p className="text-[12px] text-muted mt-1.5">Actualiza el avance de las partidas en la pestaña "Control de obra" antes de crear un estado de pago.</p>
              </div>
            : (
              <>
                <p className="text-[12px] text-muted mb-3.5">
                  Avance a cobrar por partida (sugerido desde el control de obra, editable).
                </p>

                <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto mb-4">
                  {detalleEdit.map((d, idx) => (
                    <div key={d.partida_id} className="bg-canvas border border-line rounded-lg p-3">
                      <div className="text-[13px] font-semibold text-ink mb-1.5">{d.descripcion}</div>
                      <div className="flex justify-between items-center gap-3">
                        <div className="text-[11px] text-muted">
                          {d.avance_anterior}% → {d.avance_actual}% <span className="text-success font-bold">(+{d.avance_periodo}%)</span>
                          <br/>de {fmt(d.valor_partida)}
                        </div>
                        <div className="w-[150px]">
                          <label className="text-[10px] text-muted block mb-0.5">Monto a cobrar</label>
                          <input type="number" value={d.monto}
                            onChange={e => updDetalle(idx, Number(e.target.value))}
                            className="w-full px-2 py-1.5 border border-line2 rounded-md text-[13px] text-right font-bold" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Márgenes automáticos */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <FormInput label="Utilidad (%)" value={utilidadPct} onChange={v => setUtilidadPct(Number(v) || 0)} type="number" />
                  <FormInput label="Gastos Generales (%)" value={ggPct} onChange={v => setGgPct(Number(v) || 0)} type="number" />
                </div>

                {/* Deducciones */}
                <div className="grid grid-cols-2 gap-3 mb-1.5">
                  <FormInput label="Descuentos ($)" value={descuentos} onChange={v => setDescuentos(Number(v) || 0)} type="number" />
                  <FormInput label="Anticipo carátula (%)" value={anticipoPct} onChange={v => setAnticipoPct(Number(v) || 0)} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3.5">
                  <FormInput label="Multas ($)" value={multas} onChange={v => setMultas(Number(v) || 0)} type="number" />
                  <FormInput label="Retención (%)" value={retencionPct} onChange={v => setRetencionPct(Number(v) || 0)} type="number" />
                </div>

                {/* Cascada completa */}
                <div className="bg-canvas rounded-card p-3.5 mb-3.5">
                  <Row label="Avance de obra del período" valor={fmt(avanceObra)} />
                  {utilidadMonto > 0 && <Row label={`Utilidad ${utilidadPct}%`} valor={`+ ${fmt(utilidadMonto)}`} />}
                  {ggMonto > 0 && <Row label={`Gastos Generales ${ggPct}%`} valor={`+ ${fmt(ggMonto)}`} />}
                  <div className="border-t border-line2 mt-1.5 pt-1.5">
                    <Row label="Valor EEPP (bruto)" valor={fmt(bruto)} bold />
                  </div>
                  {descuentos > 0 && <Row label="Descuentos" valor={`− ${fmt(descuentos)}`} danger />}
                  {anticipoDesc > 0 && <Row label={`Anticipo carátula ${anticipoPct}%`} valor={`− ${fmt(anticipoDesc)}`} danger />}
                  {multas > 0 && <Row label="Multas" valor={`− ${fmt(multas)}`} danger />}
                  {retencionMonto > 0 && <Row label={`Retención ${retencionPct}%`} valor={`− ${fmt(retencionMonto)}`} danger />}
                  <div className="border-t border-line2 mt-1.5 pt-1.5">
                    <Row label="Total neto" valor={fmt(totalNeto)} />
                  </div>
                  <Row label="IVA (19%)" valor={fmt(ivaCalc)} />
                  <div className="border-t border-line2 mt-1.5 pt-1.5">
                    <Row label="Líquido a pagar" valor={fmt(totalCalc)} bold />
                  </div>
                </div>

                <div className="mb-3.5">
                  <FormInput label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Ej: Incluye trabajos extraordinarios aprobados" />
                </div>

                <div className="flex gap-2 justify-end">
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

function ResumenCard({ label, valor, colorCls, sub }: { label: string; valor: string; colorCls: string; sub?: string }) {
  return (
    <div className="bg-white border border-line rounded-card px-3.5 py-3">
      <div className="text-[10px] text-muted uppercase tracking-wide font-bold">{label}</div>
      <div className={`text-[17px] font-extrabold mt-1 ${colorCls}`}>{valor}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function Row({ label, valor, danger, bold }: { label: string; valor: string; danger?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between mb-0.5 ${bold ? 'text-[15px]' : 'text-[13px]'}`}>
      <span className={`${danger ? 'text-danger' : 'text-muted'} ${bold ? 'font-bold' : 'font-normal'}`}>{label}</span>
      <span className={`${danger ? 'text-danger' : 'text-[#1a2535]'} ${bold ? 'font-extrabold' : 'font-semibold'}`}>{valor}</span>
    </div>
  )
}
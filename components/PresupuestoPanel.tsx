'use client'
// components/PresupuestoPanel.tsx
//
// Administra el presupuesto de la obra y los Estados de Pago.
// - Vista de presupuesto: planificado vs ejecutado vs cobrado
// - Estados de pago: cortes mensuales de avance, editables, con factura

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { Btn, FormInput, Modal } from '@/components/ui'
import { usePermisos } from '@/lib/usePermisos'
import { fmt, fmtFecha, fmtPeriodo } from '@/lib/format'
import { ESTADO_EP, type EstadoPago } from '@/types/estado-pago'
import DescargarEPBtn from '@/components/DescargarEPBtn'
import AvisosPagoPanel from '@/components/AvisosPagoPanel'
import { contratoNeto, pctCobrado } from '@/lib/informe'
import { avisar, confirmar } from '@/lib/avisos'
import { createClient } from '@/lib/supabase'
import { subirArchivo } from '@/lib/subir-documento'
import Evidencias from '@/components/Evidencias'
import { esNativo, guardarArchivo } from '@/lib/nativo'

interface Props {
  anticipoRecibido?: number
  proyectoId: string
  valorContrato: number
  montoContrato?: number
  moneda?: string
  valorUf?: number
  proyectoNombre?: string
  proyectoCliente?: string
  proyectoDireccion?: string
}

const IVA = 0.19
const ACEPTA_COMPROBANTE = 'image/*,application/pdf'
// Gasto registrado a mano: los automáticos llevan el comprobante en su documento de origen
const esGastoManual = (g: any) => !g.agregado && !g.orden_compra_id && !g.liquidacion_id && !g.subcontrato_ep_id && !g.equipo_uso_id && !g.traspaso_id

export default function PresupuestoPanel({ proyectoId, valorContrato, montoContrato, moneda, valorUf, anticipoRecibido = 0, proyectoNombre = '', proyectoCliente = '', proyectoDireccion = '' }: Props) {
  const { soloLectura } = usePermisos('obra')
  const [eps, setEps]         = useState<EstadoPago[]>([])
  const [loading, setLoading] = useState(true)
  const [resumen, setResumen] = useState({ presupuesto: 0, ejecutado: 0, cobrado: 0, costo: 0, ganancia: 0, markup_real: 0, margen_venta: 0, costo_ejecutado: 0, ganancia_ejecutada: 0, mano_obra_reservada: false, gasto_real: 0, gasto_manual: 0, gasto_ordenes: 0, gasto_sueldos: 0, gasto_subcontratos: 0, gasto_equipos: 0, gasto_traspasos: 0, gasto_facturas: 0, gasto_sin_partida: 0, desviacion: 0, desviacion_ejecutada: 0, pct_costo_ejecutado: 0, pct_ejecutado: 0, ganancia_real: 0, pct_gastado: 0, moneda: 'peso', valor_uf: 0, valor_contrato_pesos: 0, gasto_por_partida: {} as Record<string, number>, detalle_partidas: [] as any[] })

  // Gastos reales de la obra
  const [gastos, setGastos]     = useState<any[]>([])
  const [partidas, setPartidas] = useState<any[]>([])
  const [modalGasto, setModalGasto] = useState(false)
  const [gastoForm, setGastoForm]   = useState<any>({})
  const [savingGasto, setSavingGasto] = useState(false)
  const [gastoArchivo, setGastoArchivo] = useState<File | null>(null)
  const [adjuntandoId, setAdjuntandoId] = useState<string | null>(null)

  // Modal nuevo EP — cascada completa
  const [modal, setModal]       = useState(false)
  const [sugerencia, setSugerencia] = useState<any>(null)
  const [beneficiarios, setBeneficiarios] = useState<any[]>([])
  // Alcance del cobro: obra completa (vacío) o una o varias viviendas
  const [alcanceEP, setAlcanceEP] = useState<string[]>([])
  const [estadoViv, setEstadoViv] = useState<Record<string, string>>({})
  const [verAlcance, setVerAlcance] = useState(false)
  const [detalleEdit, setDetalleEdit] = useState<any[]>([])
  const [utilidadPct, setUtilidadPct] = useState(0)
  const [ggPct, setGgPct]           = useState(0)
  const [descuentos, setDescuentos] = useState(0)
  const [anticipoPct, setAnticipoPct] = useState(0)
  const [multas, setMultas]         = useState(0)
  const [retencionPct, setRetencionPct] = useState(0)
  const [subTab, setSubTab] = useState<'presupuesto' | 'estados' | 'retenciones'>('presupuesto')
  const [notas, setNotas]           = useState('')
  const [saving, setSaving]         = useState(false)

  // Control de retenciones — devoluciones/liberaciones
  const [devoluciones, setDevoluciones] = useState<any[]>([])
  const [modalDev, setModalDev]     = useState(false)
  const [devForm, setDevForm]       = useState<{ tipo: string; monto: number; fecha: string; glosa: string }>({ tipo: 'retencion', monto: 0, fecha: '', glosa: '' })
  const [savingDev, setSavingDev]   = useState(false)

  // Con caché (SWR): las claves de estados de pago y partidas son las mismas que usa la página
  // de la obra, así que no se piden dos veces; volver a esta pestaña es inmediato.
  const swrEp     = useSWR<any>(`/api/estados-pago?proyecto_id=${proyectoId}`)
  const swrPres   = useSWR<any>(`/api/presupuesto?proyecto_id=${proyectoId}`)
  const swrGastos = useSWR<any>(`/api/gastos-obra?proyecto_id=${proyectoId}`)
  const swrPart   = useSWR<any>(`/api/partidas-proyecto?proyecto_id=${proyectoId}`)
  const swrDev    = useSWR<any>(`/api/devoluciones?proyecto_id=${proyectoId}`)
  const listo = (r: { data?: any; error?: any }) => r.data !== undefined || !!r.error
  const todoListo = [swrEp, swrPres, swrGastos, swrPart, swrDev].every(listo)

  useEffect(() => {
    if (!todoListo) return
    const epData = swrEp.data, presData = swrPres.data, gastosData = swrGastos.data, partData = swrPart.data, devData = swrDev.data
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
      mano_obra_reservada: !!p?.mano_obra_reservada,
      gasto_manual: p?.gasto_manual || 0,
      gasto_ordenes: p?.gasto_ordenes || 0,
      gasto_sueldos: p?.gasto_sueldos || 0,
      gasto_subcontratos: p?.gasto_subcontratos || 0,
      gasto_equipos: p?.gasto_equipos || 0,
      gasto_traspasos: p?.gasto_traspasos || 0,
      gasto_facturas: p?.gasto_facturas || 0,
      gasto_sin_partida: p?.gasto_sin_partida || 0,
      desviacion: p?.desviacion || 0,
      desviacion_ejecutada: p?.desviacion_ejecutada || 0,
      pct_ejecutado: p?.pct_ejecutado || 0,
      pct_costo_ejecutado: p?.pct_costo_ejecutado || 0,
      ganancia_real: p?.ganancia_real || 0,
      pct_gastado: p?.pct_gastado || 0,
      moneda: p?.moneda || 'peso',
      valor_uf: p?.valor_uf || 0,
      valor_contrato_pesos: p?.valor_contrato_pesos || 0,
      gasto_por_partida: p?.gasto_por_partida || {},
      detalle_partidas: p?.detalle_partidas || [],
    })
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoListo, swrEp.data, swrPres.data, swrGastos.data, swrPart.data, swrDev.data, proyectoId])

  const mutadores = [swrEp.mutate, swrPres.mutate, swrGastos.mutate, swrPart.mutate, swrDev.mutate]
  const load = useCallback(async () => { await Promise.all(mutadores.map(m => m())) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    mutadores)


  // Cargar la lista de beneficiarios (subproyectos nivel 1) para el alcance del EP
  useEffect(() => {
    fetch(`/api/estados-pago?proyecto_id=${proyectoId}&beneficiarios=1`)
      .then(r => r.json())
      .then(d => setBeneficiarios(Array.isArray(d) ? d : []))
      .catch(() => setBeneficiarios([]))
    // Estado de cada vivienda, para cobrar de una vez las terminadas (sin sql/54 no hay fichas)
    fetch(`/api/viviendas?proyecto_id=${proyectoId}`)
      .then(r => r.json())
      .then(d => setEstadoViv(Object.fromEntries((d?.viviendas ?? []).map((v: any) => [v.partida_id, v.estado]))))
      .catch(() => setEstadoViv({}))
  }, [proyectoId])

  // ─── Gastos reales ───────────────────────────────────────
  const openNuevoGasto = () => {
    setGastoForm({ categoria: 'materiales', fecha: new Date().toISOString().split('T')[0], partida_id: '', descripcion: '', monto: 0, proveedor: '', documento: '' })
    setGastoArchivo(null)
    setModalGasto(true)
  }
  const updGasto = (k: string, v: any) => setGastoForm((f: any) => ({ ...f, [k]: v }))
  const guardarGasto = async () => {
    if (!gastoForm.descripcion) { avisar('Describe el gasto'); return }
    if (!gastoForm.monto || Number(gastoForm.monto) <= 0) { avisar('El monto debe ser mayor a cero'); return }
    setSavingGasto(true)
    const supabase = createClient()
    let archivo: { archivo_path: string; archivo_nombre: string; archivo_tipo: string } | null = null
    if (gastoArchivo) {
      try {
        const path = await subirArchivo(supabase, proyectoId, gastoArchivo, 'gastos')
        archivo = { archivo_path: path, archivo_nombre: gastoArchivo.name, archivo_tipo: gastoArchivo.type || 'application/octet-stream' }
      } catch (e: any) {
        setSavingGasto(false)
        avisar('No se pudo subir el comprobante: ' + (e?.message || 'error'))
        return
      }
    }
    const res = await fetch('/api/gastos-obra', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gastoForm, ...archivo, proyecto_id: proyectoId, monto: Number(gastoForm.monto), partida_id: gastoForm.partida_id || null }),
    })
    setSavingGasto(false)
    if (!res.ok) {
      if (archivo) await supabase.storage.from('proyecto-docs').remove([archivo.archivo_path])
      const err = await res.json().catch(() => ({}))
      avisar('No se pudo guardar el gasto: ' + (err.error || 'error'))
      return
    }
    await load(); setModalGasto(false); setGastoArchivo(null)
  }

  // ─── Comprobante (factura/boleta) del gasto ──────────────
  const verComprobante = async (g: any) => {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('proyecto-docs').createSignedUrl(g.archivo_path, 60)
    if (error || !data?.signedUrl) { avisar('No se pudo abrir el comprobante'); return }
    const nombre = g.archivo_nombre || 'comprobante'
    if (esNativo()) {
      try {
        const r = await fetch(data.signedUrl)
        if (!r.ok) throw new Error()
        await guardarArchivo(await r.blob(), nombre)
      } catch { avisar('No se pudo descargar el comprobante') }
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const adjuntarComprobante = async (g: any, file: File) => {
    setAdjuntandoId(g.id)
    const supabase = createClient()
    let path = ''
    try {
      path = await subirArchivo(supabase, proyectoId, file, 'gastos')
      const res = await fetch('/api/gastos-obra', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: g.id, archivo_path: path, archivo_nombre: file.name, archivo_tipo: file.type || 'application/octet-stream' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'error')
      await load()
    } catch (e: any) {
      if (path) await supabase.storage.from('proyecto-docs').remove([path])
      avisar('No se pudo adjuntar el comprobante: ' + (e?.message || 'error'))
    } finally {
      setAdjuntandoId(null)
    }
  }
  const quitarComprobante = async (g: any) => {
    if (!(await confirmar('¿Quitar el comprobante de este gasto?'))) return
    const res = await fetch('/api/gastos-obra', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, archivo_path: null }),
    })
    if (!res.ok) { avisar('No se pudo quitar el comprobante'); return }
    await load()
  }
  const delGasto = async (id: string) => {
    if (!(await confirmar('¿Eliminar este gasto?'))) return
    await fetch('/api/gastos-obra', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const CAT_LABEL: Record<string, string> = {
    mano_obra: 'Mano de obra', materiales: 'Materiales', equipos: 'Equipos',
    subcontrato: 'Subcontrato', fletes: 'Fletes', otros: 'Otros',
  }

  // ─── Abrir modal: pedir sugerencia de EP (trae % del proyecto) ──
  const openNuevoEP = async (alcance: string[] = []) => {
    const url = `/api/estados-pago?proyecto_id=${proyectoId}&sugerir=1` +
      (alcance.length ? `&beneficiario_id=${alcance.join(',')}` : '')
    const res = await fetch(url)
    const sug = await res.json()
    if (!res.ok) { avisar(sug?.error ?? 'No se pudo calcular el estado de pago'); return }
    setSugerencia(sug)
    setVerAlcance(false)
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

  // Permite editar el monto (suma alzada, administración) o la cantidad medida (serie de precios)
  const updDetalle = (idx: number, monto: number) => {
    setDetalleEdit(prev => prev.map((d, i) => i === idx ? { ...d, monto } : d))
  }
  const updCantidad = (idx: number, cantidad: number) => {
    setDetalleEdit(prev => prev.map((d, i) => i === idx
      ? { ...d, cantidad_actual: cantidad, monto: Math.max(0, Math.round((cantidad - (Number(d.cantidad_anterior) || 0)) * (Number(d.precio_unitario) || 0))) }
      : d))
  }
  const modalidadEP: string = sugerencia?.modalidad || 'suma_alzada'
  const honorarioPctEP = Number(sugerencia?.honorario_pct) || 0

  // ─── Cascada en vivo (suma alzada: el margen ya está en el precio de la partida) ──
  const avanceObra = useMemo(
    () => detalleEdit.reduce((s, d) => s + (Number(d.monto) || 0), 0),
    [detalleEdit]
  )
  const honorarioMonto = Math.round(avanceObra * honorarioPctEP / 100)   // solo en administración
  const bruto          = avanceObra + honorarioMonto                     // Valor EEPP
  const anticipoDesc   = Math.round(bruto * anticipoPct / 100)
  const retencionMonto = Math.round(bruto * retencionPct / 100)
  const totalNeto      = bruto - descuentos - anticipoDesc - multas - retencionMonto
  const ivaCalc        = Math.round(totalNeto * IVA)
  const totalCalc      = totalNeto + ivaCalc

  const guardarEP = async () => {
    if (avanceObra <= 0) { avisar('El avance de obra del período debe ser mayor a cero'); return }
    setSaving(true)
    // El alcance queda guardado; en las notas, legible para el PDF
    const nombres = alcanceEP.map(id => beneficiarios.find(b => b.id === id)?.descripcion).filter(Boolean)
    const notasFinal = nombres.length ? `[${nombres.length > 3 ? `${nombres.length} viviendas` : nombres.join(', ')}] ${notas}`.trim() : notas
    const res = await fetch('/api/estados-pago', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto_id: proyectoId,
        numero: sugerencia.numero,
        periodo: new Date().toISOString().slice(0, 7),
        fecha: new Date().toISOString().split('T')[0],
        avance_obra: avanceObra,
        utilidad_pct: 0,
        gg_pct: 0,
        descuentos,
        anticipo_pct: anticipoPct,
        multas,
        retencion_pct: retencionPct,
        notas: notasFinal,
        alcance: alcanceEP,
        detalle: detalleEdit.map(d => ({ partida_id: d.partida_id, monto: d.monto, cantidad_actual: d.cantidad_actual })),
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { avisar(j?.error ?? 'No se pudo crear el estado de pago'); return }
    await load(); setModal(false)
  }

  // ─── Control de retenciones (acumulados + devoluciones + saldo) ──
  const control = useMemo(() => {
    const epsValidos = eps.filter(e => e.estado === 'aprobado' || e.estado === 'pagado')
    const retDescontada = epsValidos.reduce((s, e) => s + (e.retencion_monto || 0), 0)
    const antAmortizado = epsValidos.reduce((s, e) => s + (e.anticipo_desc || 0), 0)
    const retDevuelta = devoluciones.filter(d => d.tipo === 'retencion').reduce((s, d) => s + (d.monto || 0), 0)
    const antDevuelto = devoluciones.filter(d => d.tipo === 'anticipo').reduce((s, d) => s + (d.monto || 0), 0)
    // Anticipo: te lo PAGAN al inicio (deuda tuya) y se amortiza en cada EP.
    // Saldo = lo que aún queda por amortizar/devolver.
    const antSaldo = anticipoRecibido - antAmortizado - antDevuelto
    return {
      retDescontada, retDevuelta, retSaldo: retDescontada - retDevuelta,
      anticipoRecibido, antAmortizado, antDevuelto, antSaldo,
    }
  }, [eps, devoluciones, anticipoRecibido])

  const abrirDev = (tipo: 'retencion' | 'anticipo') => {
    setDevForm({ tipo, monto: 0, fecha: new Date().toISOString().split('T')[0], glosa: '' })
    setModalDev(true)
  }

  const guardarDev = async () => {
    if (devForm.monto <= 0) { avisar('El monto debe ser mayor a cero'); return }
    setSavingDev(true)
    await fetch('/api/devoluciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, ...devForm }),
    })
    await load(); setSavingDev(false); setModalDev(false)
  }

  const eliminarDev = async (id: string) => {
    if (!(await confirmar('¿Eliminar esta devolución?'))) return
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
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { avisar(data?.error ?? 'No se pudo cambiar el estado'); return }
    if (data.factura_generada) avisar('Factura generada en el módulo de Facturación', 'ok')
    await load()
  }

  const delEP = async (id: string) => {
    if (!(await confirmar('¿Eliminar este estado de pago?'))) return
    const res = await fetch('/api/estados-pago', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { avisar((await res.json().catch(() => ({})))?.error ?? 'No se pudo eliminar'); return }
    await load()
  }

  // Formato según la moneda del proyecto.
  // Internamente todo se calcula en pesos. Si el contrato es en UF, se muestra
  // el valor en UF y, para control interno, el equivalente en pesos.
  const esUF = resumen.moneda === 'uf'
  const ufVal = Number(resumen.valor_uf) || 0
  const enUF = (pesos: number) => (ufVal > 0 ? (pesos / ufVal) : 0)
  // Valor principal (lo que se le presenta al mandante)
  const fmtMoneda = (pesos: number) => esUF && ufVal > 0
    ? `${enUF(pesos).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`
    : fmt(pesos)
  // Equivalente en pesos (nuestra vista interna), solo cuando es UF
  const fmtPesos = (pesos: number) => esUF && ufVal > 0 ? fmt(pesos) : ''

  const totalCobradoConIva = eps.filter(e => e.estado === 'pagado').reduce((s, e) => s + (e.total || 0), 0)
  const pctCobro = Math.round(pctCobrado(eps, contratoNeto({ valor: valorContrato, monto_contrato: montoContrato, moneda, valor_uf: valorUf })))

  if (loading) return <p className="text-center py-5 text-muted text-[13px]">Cargando...</p>

  return (
    <div>
      {soloLectura && (
        <div className="bg-[#fff8e6] border border-[#f0dca8] text-[#8a6314] text-[12px] px-4 py-2.5 rounded-lg mb-4">
          <strong>Solo lectura.</strong> Puedes consultar el presupuesto y los estados de pago, pero no modificarlos.
        </div>
      )}
      {/* Sub-pestañas */}
      <div className="flex gap-1 mb-5 border-b border-line">
        {[
          { k: 'presupuesto', label: 'Gasto real' },
          { k: 'estados',     label: 'Estados de pago' },
          { k: 'retenciones', label: 'Retenciones' },
        ].map(t => (
          <button key={t.k} onClick={() => setSubTab(t.k as any)}
            className={`px-3.5 py-2 text-[13px] font-semibold -mb-px border-b-2 transition ${subTab === t.k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={soloLectura ? 'pointer-events-none opacity-95' : ''}>

      {subTab === 'presupuesto' && (<>
      {/* Presupuesto vs Gasto REAL */}
      <div className="bg-canvas border border-line rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wide">Presupuesto vs gasto real</div>
          <button onClick={openNuevoGasto} className="text-[12px] font-bold text-brand bg-brand-bg px-3 py-1 rounded-lg hover:bg-brand hover:text-white transition">
            + Registrar gasto
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {resumen.moneda === 'uf' && (
            <div className="col-span-2 lg:col-span-4 bg-[#fff8e6] border border-[#f0dca8] rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="text-[11px] font-bold text-[#8a6314] uppercase tracking-wide">Contrato en UF</span>
              <span className="text-[12px] text-[#8a6314]">
                Valor: <strong>{(valorContrato || 0).toLocaleString('es-CL')} UF</strong>
              </span>
              <span className="text-[12px] text-[#8a6314]">
                UF hoy: <strong>{fmt(resumen.valor_uf)}</strong>
              </span>
              <span className="text-[12px] text-[#8a6314]">
                Equivale a: <strong>{fmt(resumen.valor_contrato_pesos)}</strong>
              </span>
              <span className="text-[10px] text-[#a5854a] ml-auto">Partidas y costos en pesos · rentabilidad convertida con la UF</span>
            </div>
          )}
          <div>
            <div className="text-[11px] text-muted">Presupuestado (costo)</div>
            <div className="text-base font-bold text-[#b07d1a]">{fmt(resumen.costo)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Gasto real</div>
            <div className="text-base font-bold text-danger">{fmt(resumen.gasto_real)}</div>
            <div className="text-[10px] text-muted">{resumen.pct_gastado}% del presupuesto</div>
            {resumen.mano_obra_reservada && <div className="text-[10px] text-warning font-semibold">Sin la mano de obra de cuadrillas de menos de 3 personas</div>}
          </div>
          <div>
            <div className="text-[11px] text-muted">Desviación al avance</div>
            <div className={`text-base font-bold ${resumen.desviacion_ejecutada >= 0 ? 'text-success' : 'text-danger'}`}>
              {resumen.desviacion_ejecutada >= 0 ? '+' : ''}{fmt(resumen.desviacion_ejecutada)}
            </div>
            <div className="text-[10px] text-muted">
              {resumen.costo_ejecutado > 0
                ? (resumen.desviacion_ejecutada >= 0
                    ? `Bajo costo para el ${resumen.pct_ejecutado ?? 0}% de avance`
                    : `Sobre el costo esperado para el avance actual`)
                : 'Sin avance cargado'}
            </div>
            <div className="text-[10px] text-subtle mt-0.5">Total obra: {resumen.desviacion >= 0 ? '+' : ''}{fmt(resumen.desviacion)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Ganancia real a la fecha</div>
            <div className={`text-base font-bold ${resumen.ganancia_real >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(resumen.ganancia_real)}</div>
            <div className="text-[10px] text-muted">venta ejec. − gasto real</div>
          </div>
        </div>
        {/* Barra presupuesto vs gasto */}
        <div className="mt-3">
          <div className="h-2.5 bg-[#EDE7E0] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${resumen.pct_gastado > 100 ? 'bg-danger' : 'bg-warning'}`}
              style={{ width: `${Math.min(100, resumen.pct_gastado)}%` }} />
          </div>
        </div>
        {/* Desglose del gasto real */}
        {resumen.gasto_real > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted">
            <span>Facturas proveedores: {fmt(resumen.gasto_facturas)}</span>
            <span>Órdenes de compra: {fmt(resumen.gasto_ordenes)}</span>
            <span>Sueldos: {fmt(resumen.gasto_sueldos)}</span>
            {resumen.gasto_subcontratos !== 0 && <span>Subcontratos: {fmt(resumen.gasto_subcontratos)}</span>}
            {resumen.gasto_equipos !== 0 && <span>Equipos: {fmt(resumen.gasto_equipos)}</span>}
            {resumen.gasto_traspasos !== 0 && <span>Traspasos de bodega: {fmt(resumen.gasto_traspasos)}</span>}
            <span>Gastos manuales: {fmt(resumen.gasto_manual)}</span>
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
                    <div className="h-2 bg-[#EDE7E0] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${sobre ? 'bg-danger' : 'bg-warning'}`}
                        style={{ width: `${Math.min(100, d.pct_gastado)}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
          {resumen.gasto_sin_partida !== 0 && (
            <div className="flex items-center justify-between text-[12px] mt-3 pt-3 border-t border-line">
              <span className="font-semibold text-warning">Gasto sin partida asignada</span>
              <span className="font-bold text-warning tabular-nums">{fmt(resumen.gasto_sin_partida)}</span>
            </div>
          )}
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
                      {CAT_LABEL[g.categoria] || g.categoria} · {fmtFecha(g.fecha)}
                      {partida && ` · ${partida.descripcion}`}
                      {g.proveedor && ` · ${g.proveedor}`}
                    </div>
                  </div>
                  {g.archivo_path ? (
                    <span className="flex items-center gap-1 mr-3">
                      <button onClick={() => verComprobante(g)} title={g.archivo_nombre || 'Comprobante'} className="text-[11px] font-semibold text-brand hover:underline">📎 Ver</button>
                      {!soloLectura && esGastoManual(g) && (
                        <button onClick={() => quitarComprobante(g)} aria-label={`Quitar comprobante de ${g.descripcion}`} className="text-[11px] text-muted hover:text-danger">quitar</button>
                      )}
                    </span>
                  ) : !soloLectura && esGastoManual(g) && (
                    <label className={`text-[11px] font-semibold text-muted hover:text-brand mr-3 ${adjuntandoId === g.id ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                      {adjuntandoId === g.id ? 'Subiendo...' : '📎 Adjuntar'}
                      <input type="file" accept={ACEPTA_COMPROBANTE} className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) adjuntarComprobante(g, f) }} />
                    </label>
                  )}
                  <div className="font-bold text-danger tabular-nums mr-3">{fmt(g.monto)}</div>
                  {!g.agregado && <button onClick={() => delGasto(g.id)} aria-label={`Eliminar ${g.descripcion}`} className="text-danger text-[14px] hover:opacity-70">✕</button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen de ganancia esperada (planificación) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <ResumenCard label="Presupuesto costo" valor={fmt(resumen.costo)} colorCls="text-warning" sub="Lo planificado" />
        <ResumenCard label="Precio venta" valor={fmt(resumen.presupuesto)} colorCls="text-brand" sub="Lo que cobras (neto)" />
        <ResumenCard label="Ganancia esperada" valor={fmt(resumen.ganancia)} colorCls="text-success" sub={`Margen ${resumen.margen_venta}%`} />
        <ResumenCard label="Cobrado" valor={fmt(totalCobradoConIva)} colorCls="text-accent" sub={`Con IVA · ${pctCobro}% del contrato`} />
      </div>

      {/* Barra cobrado vs contrato */}
      <div className="mb-6">
        <div className="flex justify-between text-[11px] text-muted mb-1">
          <span>Avance de cobro</span>
          <span className="font-bold text-success">{pctCobro}%</span>
        </div>
        <div className="h-2.5 bg-[#EDE7E0] rounded-full overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pctCobro)}%` }} />
        </div>
      </div>
      </>)}

      {subTab === 'estados' && (<>
      {/* ─── ESTADOS DE PAGO ─── */}
      <AvisosPagoPanel proyectoId={proyectoId} onCambio={load} />
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-ink">
          Estados de pago ({eps.length})
        </div>
        {!soloLectura && (
          beneficiarios.length > 0 ? (
            <div className="flex items-center gap-2 relative">
              <button type="button" onClick={() => setVerAlcance(v => !v)} aria-expanded={verAlcance}
                className="text-[12px] border border-line rounded-md px-2 py-[5px] bg-white">
                {alcanceEP.length === 0 ? 'Obra completa' : `${alcanceEP.length} ${alcanceEP.length === 1 ? 'vivienda' : 'viviendas'}`} ▾
              </button>
              <Btn variant="primary" onClick={() => openNuevoEP(alcanceEP)} className="!text-[12px] !px-3 !py-[5px]">
                + Nuevo estado de pago
              </Btn>
              {verAlcance && (
                <div className="absolute right-0 top-full mt-1 z-20 w-[300px] bg-white border border-line rounded-lg shadow-pop p-2">
                  <div className="flex flex-wrap gap-1.5 mb-2 text-[11px]">
                    <button type="button" onClick={() => setAlcanceEP([])} className="px-2 py-1 rounded border border-line2 font-semibold">Obra completa</button>
                    {Object.keys(estadoViv).length > 0 && (
                      <button type="button" onClick={() => setAlcanceEP(beneficiarios.filter(b => ['terminada', 'recepcionada'].includes(estadoViv[b.id])).map(b => b.id))}
                        className="px-2 py-1 rounded border border-line2 font-semibold">Terminadas y recepcionadas</button>
                    )}
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {beneficiarios.map(b => (
                      <label key={b.id} className="flex items-center gap-2 px-1.5 py-1 text-[12px] cursor-pointer hover:bg-canvas rounded">
                        <input type="checkbox" checked={alcanceEP.includes(b.id)}
                          onChange={() => setAlcanceEP(a => a.includes(b.id) ? a.filter(x => x !== b.id) : [...a, b.id])} />
                        <span className="flex-1 truncate">{b.descripcion}</span>
                        {estadoViv[b.id] && <span className="text-[10px] text-muted">{estadoViv[b.id].replace('_', ' ')}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Btn variant="primary" onClick={() => openNuevoEP()} className="!text-[12px] !px-3 !py-[5px]">
              + Nuevo estado de pago
            </Btn>
          )
        )}
      </div>
      {beneficiarios.length > 0 && (
        <p className="text-[11px] text-muted mb-3 -mt-1">
          Elige el <strong>alcance</strong>: cobra la obra completa, una vivienda o varias (por ejemplo, las terminadas).
        </p>
      )}

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
                        <span className="text-sm font-bold text-ink">Estado de pago N°{ep.numero}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: s.bg, color: s.color }} >{s.label}</span>
                        {ep.factura_id && <span className="text-[10px] text-accent font-semibold">Facturado</span>}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {fmtPeriodo(ep.periodo)} · {fmtFecha(ep.fecha)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold text-ink">{fmtMoneda(ep.total)}</div>
                      {esUF && ufVal > 0
                        ? <div className="text-[10px] text-subtle">{fmt(ep.total)} · Neto {fmtMoneda(ep.monto_pagar)}</div>
                        : <div className="text-[10px] text-muted">Neto {fmt(ep.monto_pagar)} + IVA</div>}
                      <div className="mt-1">
                        <DescargarEPBtn ep={ep} proyecto={{ nombre: proyectoNombre, cliente: proyectoCliente, direccion: proyectoDireccion }} />
                      </div>
                    </div>
                  </div>

                  {/* Desglose */}
                  {(ep.bruto > 0 || ep.retencion_monto > 0 || ep.anticipo_desc > 0) && (
                    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted mt-2 pt-2 border-t border-[#F1ECE6]">
                      <span>Avance: {fmt(ep.avance_obra ?? ep.monto_neto)}</span>
                      {ep.utilidad_monto > 0 && <span className="text-success">+ Util. {ep.utilidad_pct}%: {fmt(ep.utilidad_monto)}</span>}
                      {ep.gg_monto > 0 && <span className="text-success">+ Gastos generales {ep.gg_pct}%: {fmt(ep.gg_monto)}</span>}
                      {ep.descuentos > 0 && <span className="text-danger">− Desc.: {fmt(ep.descuentos)}</span>}
                      {ep.anticipo_desc > 0 && <span className="text-danger">− Anticipo {ep.anticipo_pct}%: {fmt(ep.anticipo_desc)}</span>}
                      {ep.multas > 0 && <span className="text-danger">− Multas: {fmt(ep.multas)}</span>}
                      {ep.retencion_monto > 0 && <span className="text-danger">− Ret. {ep.retencion_pct}%: {fmt(ep.retencion_monto)}</span>}
                    </div>
                  )}

                  {/* Respaldos del cobro: carátula firmada, fotos de avance, recepción */}
                  <div className="mt-2 pt-2 border-t border-[#F1ECE6]">
                    <Evidencias proyectoId={proyectoId} entidadTipo="estado_pago" entidadId={ep.id} titulo="Respaldos" compacto />
                  </div>

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
                          <Btn onClick={() => cambiarEstado(ep, 'aprobado', true)} className="!text-[11px] !px-[10px] !py-1 !bg-accent-bg !border-[#ccc5fc] !text-accent font-bold">Generar factura</Btn>
                        )}
                        <Btn onClick={() => cambiarEstado(ep, 'pagado')} className="!text-[11px] !px-[10px] !py-1 !bg-success-bg !border-[#b9e0c9] !text-success">Marcar pagado</Btn>
                      </>
                    )}
                    {ep.estado === 'rechazado' && (
                      <Btn onClick={() => cambiarEstado(ep, 'borrador')} className="!text-[11px] !px-[10px] !py-1">Volver a borrador</Btn>
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
      </>)}

      {subTab === 'retenciones' && (<>
      {eps.length === 0 && (
        <p className="text-center py-8 text-muted text-[13px]">Aún no hay estados de pago. Créalos en la pestaña “Estados de pago” para gestionar retenciones y anticipos.</p>
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
                <div className="flex justify-between"><span className="text-muted">Anticipo recibido</span><span className="font-bold text-ink">{fmt(control.anticipoRecibido)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Descontado en estados de pago</span><span className="font-bold text-success">− {fmt(control.antAmortizado)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Devuelto adicional</span><span className="font-bold text-success">− {fmt(control.antDevuelto)}</span></div>
                <div className="flex justify-between border-t border-line pt-1.5 mt-0.5"><span className="font-bold text-ink">Saldo por amortizar</span><span className={`font-extrabold ${control.antSaldo > 0 ? 'text-brand' : 'text-success'}`}>{fmt(control.antSaldo)}</span></div>
                {control.anticipoRecibido === 0 && control.antAmortizado > 0 && (
                  <div className="text-[10px] text-[#b0641a] mt-1">Registra el anticipo recibido en los datos de la obra para ver el saldo real.</div>
                )}
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
                    <span className="text-muted">{fmtFecha(d.fecha)}</span>
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
      </>)}

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
                  {modalidadEP === 'serie_precios' ? 'Serie de precios: indica la cantidad medida acumulada de cada partida; se cobra la diferencia con lo ya cobrado.'
                    : modalidadEP === 'administracion' ? `Administración: costo real de la obra aún no rendido, más honorario de ${honorarioPctEP}%. Puedes rendir menos.`
                    : 'Suma alzada: avance a cobrar por partida, sugerido desde el control de obra. Puedes cobrar menos, no más que el avance.'}
                </p>

                <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto mb-4">
                  {detalleEdit.map((d, idx) => (
                    <div key={d.partida_id} className="bg-canvas border border-line rounded-lg p-3">
                      <div className="text-[13px] font-semibold text-ink mb-1.5">{d.descripcion}</div>
                      <div className="flex justify-between items-center gap-3">
                        {modalidadEP === 'serie_precios' ? (
                          <>
                            <div className="text-[11px] text-muted">
                              Presupuesto {Number(d.cantidad_presupuestada)} {d.unidad || ''} × {fmt(d.precio_unitario)}
                              <br/>Ya cobrado: {Number(d.cantidad_anterior)} {d.unidad || ''} · Este estado: <span className="text-success font-bold">{fmt(d.monto)}</span>
                            </div>
                            <div className="w-[150px]">
                              <label className="text-[10px] text-muted block mb-0.5">Cantidad acumulada medida</label>
                              <input type="number" value={d.cantidad_actual} min={d.cantidad_anterior}
                                onChange={e => updCantidad(idx, Number(e.target.value))}
                                className="w-full px-2 py-1.5 border border-line2 rounded-md text-[13px] text-right font-bold" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[11px] text-muted">
                              {modalidadEP === 'administracion' ? 'Gastos, compras y sueldos imputados a la obra' : (
                                <>{d.avance_anterior}% → {d.avance_actual}% <span className="text-success font-bold">(+{d.avance_periodo}%)</span></>
                              )}
                              <br/>{modalidadEP === 'administracion' ? 'Pendiente de rendir' : 'Hasta'} {fmt(d.maximo ?? d.monto)}
                            </div>
                            <div className="w-[150px]">
                              <label className="text-[10px] text-muted block mb-0.5">{modalidadEP === 'administracion' ? 'Costo a rendir' : 'Monto a cobrar'}</label>
                              <input type="number" value={d.monto} max={d.maximo ?? undefined}
                                onChange={e => updDetalle(idx, Number(e.target.value))}
                                className="w-full px-2 py-1.5 border border-line2 rounded-md text-[13px] text-right font-bold" />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
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
                  {esUF && ufVal > 0 && (
                    <div className="text-[10px] text-[#8a6314] bg-[#fff8e6] rounded px-2 py-1 mb-2">
                      Contrato en UF (UF = {fmt(ufVal)}). Se presenta en UF; en gris, el equivalente en pesos para control interno.
                    </div>
                  )}
                  {honorarioMonto > 0 && <Row label="Costo rendido" valor={fmtMoneda(avanceObra)} sub={fmtPesos(avanceObra)} />}
                  {honorarioMonto > 0 && <Row label={`Honorario ${honorarioPctEP}%`} valor={fmtMoneda(honorarioMonto)} sub={fmtPesos(honorarioMonto)} />}
                  <Row label="Valor del avance del período" valor={fmtMoneda(bruto)} sub={fmtPesos(bruto)} bold />
                  {descuentos > 0 && <Row label="Descuentos" valor={`− ${fmtMoneda(descuentos)}`} sub={fmtPesos(descuentos)} danger />}
                  {anticipoDesc > 0 && <Row label={`Anticipo carátula ${anticipoPct}%`} valor={`− ${fmtMoneda(anticipoDesc)}`} sub={fmtPesos(anticipoDesc)} danger />}
                  {multas > 0 && <Row label="Multas" valor={`− ${fmtMoneda(multas)}`} sub={fmtPesos(multas)} danger />}
                  {retencionMonto > 0 && <Row label={`Retención ${retencionPct}%`} valor={`− ${fmtMoneda(retencionMonto)}`} sub={fmtPesos(retencionMonto)} danger />}
                  <div className="border-t border-line2 mt-1.5 pt-1.5">
                    <Row label="Total neto" valor={fmtMoneda(totalNeto)} sub={fmtPesos(totalNeto)} />
                  </div>
                  <Row label="IVA (19%)" valor={fmtMoneda(ivaCalc)} sub={fmtPesos(ivaCalc)} />
                  <div className="border-t border-line2 mt-1.5 pt-1.5">
                    <Row label="Líquido a pagar" valor={fmtMoneda(totalCalc)} sub={fmtPesos(totalCalc)} bold />
                  </div>
                </div>

                <div className="mb-3.5">
                  <FormInput label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Ej: Incluye trabajos extraordinarios aprobados" />
                </div>

                <div className="flex gap-2 justify-end">
                  <Btn onClick={() => setModal(false)}>Cancelar</Btn>
                  <Btn variant="primary" onClick={guardarEP} disabled={saving}>{saving ? 'Guardando...' : (alcanceEP.length ? `Crear estado de pago (${alcanceEP.length} ${alcanceEP.length === 1 ? 'vivienda' : 'viviendas'})` : 'Crear estado de pago')}</Btn>
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
                <option value="mano_obra">Mano de obra</option>
                <option value="materiales">Materiales</option>
                <option value="equipos">Equipos</option>
                <option value="subcontrato">Subcontrato</option>
                <option value="fletes">Fletes</option>
                <option value="otros">Otros</option>
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
            <div className="col-span-2">
              <label className="label-base">Factura o boleta (opcional)</label>
              {gastoArchivo ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-canvas rounded-lg text-[12px]">
                  <span className="truncate text-ink">📎 {gastoArchivo.name}</span>
                  <button type="button" onClick={() => setGastoArchivo(null)} className="text-muted hover:text-danger shrink-0">Quitar</button>
                </div>
              ) : (
                <input type="file" accept={ACEPTA_COMPROBANTE} className="input-base cursor-pointer"
                  onChange={e => setGastoArchivo(e.target.files?.[0] ?? null)} />
              )}
              <div className="text-[10px] text-muted mt-1">Foto o PDF, hasta 20 MB.</div>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Btn onClick={() => setModalGasto(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardarGasto} disabled={savingGasto}>{savingGasto ? 'Guardando...' : 'Registrar gasto'}</Btn>
          </div>
        </Modal>
      )}
      </div>
    </div>
  )
}

function ResumenCard({ label, valor, colorCls, sub }: { label: string; valor: string; colorCls: string; sub?: string }) {
  return (
    <div className="bg-white border border-line rounded-card px-3.5 py-3 min-w-0">
      <div className="text-[10px] text-muted uppercase tracking-wide font-bold">{label}</div>
      <div className={`text-[17px] font-extrabold mt-1 [overflow-wrap:anywhere] ${colorCls}`}>{valor}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function Row({ label, valor, sub, danger, bold }: { label: string; valor: string; sub?: string; danger?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline mb-0.5 ${bold ? 'text-[15px]' : 'text-[13px]'}`}>
      <span className={`${danger ? 'text-danger' : 'text-muted'} ${bold ? 'font-bold' : 'font-normal'}`}>{label}</span>
      <span className="text-right">
        <span className={`${danger ? 'text-danger' : 'text-[#1a2535]'} ${bold ? 'font-extrabold' : 'font-semibold'}`}>{valor}</span>
        {sub && <span className="block text-[10px] text-subtle font-normal">{sub}</span>}
      </span>
    </div>
  )
}
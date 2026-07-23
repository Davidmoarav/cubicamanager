'use client'
// app/(protected)/remuneraciones/page.tsx

import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, FormInput, FormSelect, Modal, SectionTitle, MetricCard } from '@/components/ui'
import { fmt } from '@/lib/format'
import { calcularLiquidacion, type ParametrosRemuneracion, type EmpleadoPrevisional } from '@/types/finanzas'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function periodoActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelPeriodo(periodo: string) {
  const [y, m] = periodo.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

export default function RemuneracionesPage() {
  const [tab, setTab] = useState<'liquidaciones' | 'parametros' | 'empleados'>('liquidaciones')
  const { data: paramsData = null, mutate: mutateParams } = useSWR<ParametrosRemuneracion | null>('/api/parametros-rem', fetcher)
  const { data: empData = [], isLoading, mutate: mutateEmp } = useSWR<EmpleadoPrevisional[]>('/api/empleados', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)
  const [params, setParams] = useState<ParametrosRemuneracion | null>(null)
  const empleados = useMemo(() => (empData as any[]).filter((e: any) => e.estado !== 'inactivo'), [empData])
  useEffect(() => { if (paramsData !== undefined) setParams(prev => prev ?? paramsData) }, [paramsData])
  const [periodo, setPeriodo] = useState(periodoActual())
  const [savingParams, setSavingParams] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Modal de edición previsional de empleado
  const [empModal, setEmpModal] = useState<EmpleadoPrevisional | null>(null)
  const [empForm, setEmpForm] = useState<any>({})
  const [savingEmp, setSavingEmp] = useState(false)

  // ─── Carga inicial ───────────────────────────────────────

  // ─── Liquidaciones calculadas en vivo ────────────────────
  const liquidaciones = useMemo(() => {
    if (!params) return []
    return empleados.map(emp => ({
      empleado: emp,
      calc: calcularLiquidacion(emp, params),
    }))
  }, [empleados, params])

  const totales = useMemo(() => {
    return liquidaciones.reduce((acc, l) => ({
      imponible: acc.imponible + l.calc.total_imponible,
      descuentos: acc.descuentos + l.calc.total_descuentos,
      liquido: acc.liquido + l.calc.liquido_pagar,
    }), { imponible: 0, descuentos: 0, liquido: 0 })
  }, [liquidaciones])

  // ─── Guardar parámetros ──────────────────────────────────
  const updParam = (k: string, v: any) => setParams(p => p ? { ...p, [k]: Number(v) } : p)

  const saveParams = async () => {
    if (!params) return
    setSavingParams(true)
    setMsg(null)
    const res = await fetch('/api/parametros-rem', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (res.ok) setMsg('Parámetros guardados correctamente')
    setSavingParams(false)
  }

  // ─── Editar previsional de empleado ──────────────────────
  const openEmp = (emp: EmpleadoPrevisional) => {
    setEmpForm({ ...emp })
    setEmpModal(emp)
  }
  const updEmp = (k: string, v: any) => setEmpForm((f: any) => ({ ...f, [k]: v }))

  const saveEmp = async () => {
    setSavingEmp(true)
    await fetch('/api/empleados', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empForm),
    })
    await mutateEmp()
    setSavingEmp(false)
    setEmpModal(null)
  }

  // ─── Guardar liquidación de un empleado ──────────────────
  // El servidor recalcula desde el empleado + parámetros guardados
  // (lo que se ve en pantalla es referencial).
  const guardarLiq = async (emp: EmpleadoPrevisional, _calc: any) => {
    await fetch('/api/remuneraciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empleado_id: emp.id, periodo, estado: 'borrador' }),
    })
    setMsg(`Liquidación de ${emp.nombre} guardada`)
  }

  if (isLoading || !params) return <p className="text-muted p-5">Cargando...</p>

  return (
    <div>
      <div className="mb-5">
        <SectionTitle>Remuneraciones</SectionTitle>
        <p className="text-sm text-muted mt-1">Gestión de sueldos, descuentos previsionales y liquidaciones</p>
      </div>

      {msg && (
        <div className="bg-success-bg text-success border border-[#b9e0c9] px-4 py-2.5 rounded-xl mb-4 text-[13px]">
          {msg}
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1 p-1 bg-canvas rounded-xl mb-6 overflow-x-auto">
        {[
          { key: 'liquidaciones' as const, label: '💰 Liquidaciones' },
          { key: 'empleados' as const,     label: '👤 Datos previsionales' },
          { key: 'parametros' as const,    label: '⚙ Parámetros' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-semibold transition
              ${tab === t.key ? 'bg-white text-brand shadow-card' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ TAB LIQUIDACIONES ══════ */}
      {tab === 'liquidaciones' && (
        <div>
          {/* Selector de período */}
          <div className="flex items-center gap-3 mb-[18px]">
            <label className="text-[13px] font-semibold text-muted">Período:</label>
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="px-3 py-2 border border-[#d1d9e6] rounded-[7px] text-[13px]" />
            <span className="text-[13px] text-[#1a2535] font-semibold">{labelPeriodo(periodo)}</span>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <MetricCard label="Total imponible"  value={fmt(totales.imponible)} sub={`${liquidaciones.length} empleados`} />
            <MetricCard label="Total descuentos" value={fmt(totales.descuentos)} subColor="#b0401a" />
            <MetricCard label="Líquido a pagar"  value={fmt(totales.liquido)} subColor="#1a7a4a" sub="Total nómina del mes" />
          </div>

          {/* Tabla de liquidaciones */}
          <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px] overflow-x-auto">
            <table className="w-full border-collapse text-[12px] min-w-[800px]">
              <thead>
                <tr className="border-b-2 border-[#e4e9f0]">
                  <th className={thS}>Empleado</th>
                  <th className={thNum}>Imponible</th>
                  <th className={thNum}>AFP</th>
                  <th className={thNum}>Salud</th>
                  <th className={thNum}>AFC</th>
                  <th className={thNum}>Impuesto</th>
                  <th className={thNum}>Otros</th>
                  <th className={thNum}>Líquido</th>
                  <th className={thS}></th>
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map(({ empleado, calc }) => (
                  <tr key={empleado.id} className="border-b border-canvas">
                    <td className={tdS}>
                      <div className="font-bold text-[#1a2535]">{empleado.nombre}</div>
                      <div className="text-[10px] text-muted">{empleado.cargo} · {empleado.afp_nombre || 'AFP'} · {empleado.salud_sistema || 'Fonasa'}</div>
                    </td>
                    <td className={tdNum}>{fmt(calc.total_imponible)}</td>
                    <td className={`${tdNum} text-danger`}>{fmt(calc.desc_afp)}</td>
                    <td className={`${tdNum} text-danger`}>{fmt(calc.desc_salud)}</td>
                    <td className={`${tdNum} text-danger`}>{fmt(calc.desc_afc)}</td>
                    <td className={`${tdNum} text-danger`}>{fmt(calc.desc_impuesto)}</td>
                    <td className={`${tdNum} text-danger`}>{fmt(calc.otros_descuentos)}</td>
                    <td className={`${tdNum} font-extrabold text-success`}>{fmt(calc.liquido_pagar)}</td>
                    <td className={tdS}>
                      <Btn onClick={() => guardarLiq(empleado, calc)} className="text-[11px] px-2.5 py-1.5">Guardar</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {liquidaciones.length === 0 && <p className="text-center text-muted p-5">No hay empleados activos.</p>}
          </div>

          <p className="text-[11px] text-muted mt-2.5">
            💡 Las liquidaciones se calculan automáticamente con los parámetros y datos previsionales de cada empleado. Edita los datos en la pestaña correspondiente.
          </p>
        </div>
      )}

      {/* ══════ TAB DATOS PREVISIONALES POR EMPLEADO ══════ */}
      {tab === 'empleados' && (
        <div className="bg-white border border-[#e4e9f0] rounded-xl p-[18px] overflow-x-auto">
          <table className="w-full border-collapse text-[12px] min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-[#e4e9f0]">
                <th className={thS}>Empleado</th>
                <th className={thS}>AFP</th>
                <th className={thS}>Salud</th>
                <th className={thS}>Contrato</th>
                <th className={thNum}>Sueldo base</th>
                <th className={thNum}>Bonos/Asign.</th>
                <th className={thS}></th>
              </tr>
            </thead>
            <tbody>
              {empleados.map(emp => (
                <tr key={emp.id} className="border-b border-canvas">
                  <td className={tdS}><span className="font-bold">{emp.nombre}</span><br/><span className="text-[10px] text-muted">{emp.cargo}</span></td>
                  <td className={tdS}>{emp.afp_nombre || 'Modelo'} {emp.afp_pct_custom ? `(${emp.afp_pct_custom}%)` : ''}</td>
                  <td className={tdS}>{emp.salud_sistema || 'Fonasa'}{emp.salud_sistema === 'Isapre' && emp.salud_uf ? ` (${emp.salud_uf} UF)` : ''}</td>
                  <td className={tdS}>{emp.contrato_tipo || 'indefinido'}</td>
                  <td className={tdNum}>{fmt(emp.sueldo)}</td>
                  <td className={tdNum}>{fmt((emp.bono_imponible || 0) + (emp.colacion || 0) + (emp.movilizacion || 0))}</td>
                  <td className={tdS}><Btn onClick={() => openEmp(emp)} className="text-[11px] px-2.5 py-1.5">Editar</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {empleados.length === 0 && <p className="text-center text-muted p-5">No hay empleados. Agrégalos en el módulo RRHH.</p>}
        </div>
      )}

      {/* ══════ TAB PARÁMETROS ══════ */}
      {tab === 'parametros' && (
        <div className="max-w-[640px]">
          <div className="bg-white border border-[#e4e9f0] rounded-xl p-5 mb-4">
            <div className="text-[14px] font-bold text-[#1a2535] mb-1">Porcentajes previsionales</div>
            <p className="text-[12px] text-muted mb-4">Valores por defecto que se aplican a todos los empleados (salvo que tengan valor propio).</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <FormInput label="AFP - cotización obligatoria (%)" value={params.afp_pct} onChange={v => updParam('afp_pct', v)} type="number" />
              <FormInput label="AFP - comisión promedio (%)" value={params.afp_comision_pct} onChange={v => updParam('afp_comision_pct', v)} type="number" />
              <FormInput label="Salud - Fonasa/Isapre base (%)" value={params.salud_pct} onChange={v => updParam('salud_pct', v)} type="number" />
              <FormInput label="AFC - trabajador (%)" value={params.afc_trabajador_pct} onChange={v => updParam('afc_trabajador_pct', v)} type="number" />
              <FormInput label="AFC - empleador (%)" value={params.afc_empleador_pct} onChange={v => updParam('afc_empleador_pct', v)} type="number" />
              <FormInput label="Tope imponible AFC (UF)" value={params.tope_afc_uf ?? 131.9} onChange={v => updParam('tope_afc_uf', v)} type="number" />
              <FormInput label="Jornada semanal (horas)" value={params.jornada_semanal ?? 42} onChange={v => updParam('jornada_semanal', v)} type="number" />
            </div>
          </div>

          <div className="bg-white border border-[#e4e9f0] rounded-xl p-5 mb-4">
            <div className="text-[14px] font-bold text-[#1a2535] mb-4">Valores de referencia</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <FormInput label="Valor UF ($)" value={params.uf_valor} onChange={v => updParam('uf_valor', v)} type="number" />
              <FormInput label="Valor UTM ($)" value={params.utm_valor} onChange={v => updParam('utm_valor', v)} type="number" />
              <div className="flex items-end">
                <Btn onClick={async () => {
                  setMsg(null)
                  const res = await fetch('/api/indicadores')
                  const j = await res.json()
                  if (!res.ok) { setMsg(j.error || 'No se pudo obtener UF/UTM'); return }
                  setParams(p => p ? { ...p, uf_valor: j.uf, utm_valor: j.utm } : p)
                  setMsg(`UF $${j.uf.toLocaleString('es-CL')} y UTM $${j.utm.toLocaleString('es-CL')} traídas de ${j.fuente}. Recuerda Guardar.`)
                }}>
                  ↻ Traer UF/UTM del día
                </Btn>
              </div>
              <FormInput label="Tope imponible (UF)" value={params.tope_imponible_uf} onChange={v => updParam('tope_imponible_uf', v)} type="number" />
              <FormInput label="Tope gratificación mensual ($)" value={params.gratificacion_tope} onChange={v => updParam('gratificacion_tope', v)} type="number" />
            </div>
          </div>

          <div className="flex justify-end">
            <Btn variant="primary" onClick={saveParams} disabled={savingParams}>
              {savingParams ? 'Guardando...' : 'Guardar parámetros'}
            </Btn>
          </div>
        </div>
      )}

      {/* ══════ MODAL EDITAR PREVISIONAL EMPLEADO ══════ */}
      {empModal && (
        <Modal title={`Datos previsionales — ${empModal.nombre}`} onClose={() => setEmpModal(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormInput label="Sueldo base ($)" value={empForm.sueldo ?? 0} onChange={v => updEmp('sueldo', Number(v))} type="number" />
            <FormInput label="Horas extra (cant.)" value={empForm.horas_extra ?? 0} onChange={v => updEmp('horas_extra', Number(v))} type="number" />

            <FormInput label="Nombre AFP" value={empForm.afp_nombre || ''} onChange={v => updEmp('afp_nombre', v)} placeholder="Modelo, Habitat, ProVida..." />
            <FormInput label="AFP % propio (opcional)" value={empForm.afp_pct_custom ?? ''} onChange={v => updEmp('afp_pct_custom', v ? Number(v) : null)} type="number" placeholder="Si difiere del global" />

            <FormSelect label="Sistema de salud" value={empForm.salud_sistema || 'Fonasa'} onChange={v => updEmp('salud_sistema', v)}
              options={[{ value: 'Fonasa', label: 'Fonasa' }, { value: 'Isapre', label: 'Isapre' }]} />
            {empForm.salud_sistema === 'Isapre'
              ? <FormInput label="Plan Isapre (UF)" value={empForm.salud_uf ?? 0} onChange={v => updEmp('salud_uf', Number(v))} type="number" />
              : <FormInput label="Salud % propio (opcional)" value={empForm.salud_pct_custom ?? ''} onChange={v => updEmp('salud_pct_custom', v ? Number(v) : null)} type="number" placeholder="Default 7%" />}

            <FormSelect label="Tipo de contrato" value={empForm.contrato_tipo || 'indefinido'} onChange={v => updEmp('contrato_tipo', v)}
              options={[
                { value: 'indefinido', label: 'Indefinido' },
                { value: 'plazo_fijo', label: 'Plazo fijo' },
                { value: 'obra_faena', label: 'Por obra o faena' },
              ]} />
            <FormInput label="Bono imponible ($)" value={empForm.bono_imponible ?? 0} onChange={v => updEmp('bono_imponible', Number(v))} type="number" />

            <FormInput label="Colación ($, no imponible)" value={empForm.colacion ?? 0} onChange={v => updEmp('colacion', Number(v))} type="number" />
            <FormInput label="Movilización ($, no imponible)" value={empForm.movilizacion ?? 0} onChange={v => updEmp('movilizacion', Number(v))} type="number" />

            <div className="col-span-full">
              <FormInput label="Otros descuentos ($, anticipos/préstamos)" value={empForm.otros_descuentos ?? 0} onChange={v => updEmp('otros_descuentos', Number(v))} type="number" />
            </div>

            <div className="col-span-full">
              <FormSelect label="Obra asignada (su sueldo cuenta como gasto de esa obra)" value={empForm.proyecto_id || ''} onChange={v => updEmp('proyecto_id', v || null)}
                options={[{ value: '', label: 'Sin asignar (no imputa a obra)' }, ...proyectos.map((p: any) => ({ value: p.id, label: p.nombre }))]} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setEmpModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={saveEmp} disabled={savingEmp}>{savingEmp ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

const thS = 'text-left px-[10px] py-2 text-[10px] font-bold text-muted uppercase tracking-[0.3px]'
const thNum = `${thS} text-right`
const tdS = 'px-[10px] py-2 text-[#1a2535]'
const tdNum = 'px-[10px] py-2 text-right text-[#1a2535] tabular-nums'
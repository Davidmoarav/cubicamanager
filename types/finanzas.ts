// types/finanzas.ts

export interface ParametrosRemuneracion {
  id?: string
  user_id?: string
  afp_pct: number
  afp_comision_pct: number
  salud_pct: number
  afc_trabajador_pct: number
  afc_empleador_pct: number
  uf_valor: number
  utm_valor: number
  tope_imponible_uf: number
  tope_afc_uf?: number          // tope propio del seguro de cesantía (≠ tope AFP/salud)
  jornada_semanal?: number      // horas semanales de la jornada ordinaria (Ley 21.561)
  afc_empleador_plazo_pct?: number   // AFC empleador en contrato a plazo o por obra
  sis_pct?: number                   // seguro de invalidez y sobrevivencia
  cotizacion_empleador_pct?: number  // cotización de la reforma de pensiones (Ley 21.735)
  mutual_pct?: number                // tasa de mutual: depende de cada empresa
  gratificacion_tope: number
  colacion_default: number
  movilizacion_default: number
  updated_at?: string
}

// Defaults compartidos (los usa la API y el cálculo cuando aún no hay fila guardada).
// Valores de referencia 2025-2026 — el usuario debe mantenerlos al día.
export const REM_DEFAULTS: ParametrosRemuneracion = {
  afp_pct: 10.00, afp_comision_pct: 1.44, salud_pct: 7.00,
  afc_trabajador_pct: 0.60, afc_empleador_pct: 2.40,
  uf_valor: 39000, utm_valor: 68000,
  tope_imponible_uf: 87.80,
  tope_afc_uf: 131.90,          // tope AFC (131,9 UF en 2025)
  jornada_semanal: 42,          // 42 h desde abril 2026 (Ley 21.561)
  afc_empleador_plazo_pct: 3.00,
  sis_pct: 1.78,                // trimestre ago-oct 2026 (cambia cada trimestre)
  cotizacion_empleador_pct: 3.50, // desde agosto 2026 (sube gradualmente cada agosto)
  mutual_pct: 0.93,
  gratificacion_tope: 209396, colacion_default: 0, movilizacion_default: 0,
}

export interface EmpleadoPrevisional {
  id: string
  nombre: string
  rut?: string
  cargo?: string
  sueldo: number
  horas_extra: number
  estado: string
  tipo: string
  // Previsional
  afp_nombre?: string
  afp_pct_custom?: number | null
  salud_sistema?: 'Fonasa' | 'Isapre'
  salud_pct_custom?: number | null
  salud_uf?: number
  contrato_tipo?: 'indefinido' | 'plazo_fijo' | 'obra_faena'
  colacion?: number
  movilizacion?: number
  bono_imponible?: number
  otros_descuentos?: number
}

export interface Liquidacion {
  id: string
  empleado_id: string
  periodo: string
  sueldo_base: number
  horas_extra_monto: number
  gratificacion: number
  bono_imponible: number
  colacion: number
  movilizacion: number
  total_imponible: number
  total_haberes: number
  desc_afp: number
  desc_salud: number
  desc_afc: number
  otros_descuentos: number
  total_descuentos: number
  liquido_pagar: number
  estado: 'borrador' | 'pagada'
  user_id?: string
  created_at?: string
  empleado?: EmpleadoPrevisional
}

export interface FacturaIVA {
  id: string
  numero?: string
  cliente: string
  proyecto?: string
  tipo: 'venta' | 'compra'
  neto: number
  iva: number
  monto: number
  emision?: string
  vencimiento?: string
  periodo?: string
  estado: string
}

// ─── Cálculo de liquidación (función pura, reutilizable) ──
// Impuesto Único de Segunda Categoría (tabla mensual, tramos en UTM)
export function impuestoUnico(baseTributable: number, utm: number): number {
  if (baseTributable <= 0 || utm <= 0) return 0
  const baseUTM = baseTributable / utm
  const tramos = [
    { hasta: 13.5,     factor: 0,     rebaja: 0 },
    { hasta: 30,       factor: 0.04,  rebaja: 0.54 },
    { hasta: 50,       factor: 0.08,  rebaja: 1.74 },
    { hasta: 70,       factor: 0.135, rebaja: 4.49 },
    { hasta: 90,       factor: 0.23,  rebaja: 11.14 },
    { hasta: 120,      factor: 0.304, rebaja: 17.80 },
    { hasta: 310,      factor: 0.35,  rebaja: 23.32 },
    { hasta: Infinity, factor: 0.40,  rebaja: 38.82 },
  ]
  const t = tramos.find(x => baseUTM <= x.hasta)!
  return Math.max(0, Math.round((baseUTM * t.factor - t.rebaja) * utm))
}

export function calcularLiquidacion(
  emp: EmpleadoPrevisional,
  params: ParametrosRemuneracion
) {
  const sueldoBase = Number(emp.sueldo) || 0

  // Horas extra con recargo 50% — fórmula de la Dirección del Trabajo:
  //   factor = (28 / (30 × 4 × jornada)) × 1.5  →  45h: 0,0077778 · 44h: 0,0079545 · 42h: 0,0083333
  const jornada = Number(params.jornada_semanal) || 42
  const factorHoraExtra = (28 / (30 * 4 * jornada)) * 1.5
  const horasExtraMonto = Math.round(sueldoBase * factorHoraExtra * (Number(emp.horas_extra) || 0))

  const bonoImponible = Number(emp.bono_imponible) || 0

  // Gratificación legal: 25% de lo devengado con tope
  const baseGrat = sueldoBase + horasExtraMonto + bonoImponible
  const gratificacion = Math.min(Math.round(baseGrat * 0.25), params.gratificacion_tope)

  // Renta imponible: bruta (para haber e impuesto) vs con tope (para cotizaciones)
  const topeImponible = Math.round(params.tope_imponible_uf * params.uf_valor)
  const imponibleBruto = sueldoBase + horasExtraMonto + bonoImponible + gratificacion
  const totalImponible = Math.min(imponibleBruto, topeImponible)   // base de AFP/salud/AFC

  // Descuentos previsionales (sobre la base con tope)
  const afpPct = emp.afp_pct_custom ?? params.afp_pct
  const afpComision = params.afp_comision_pct
  const descAfp = Math.round(totalImponible * (afpPct + afpComision) / 100)

  // Salud (Isapre: mayor entre plan y 7% legal; Fonasa: %)
  let descSalud = 0
  if (emp.salud_sistema === 'Isapre' && (emp.salud_uf || 0) > 0) {
    const plan = Math.round((emp.salud_uf || 0) * params.uf_valor)
    const minLegal = Math.round(totalImponible * params.salud_pct / 100)
    descSalud = Math.max(plan, minLegal)
  } else {
    const saludPct = emp.salud_pct_custom ?? params.salud_pct
    descSalud = Math.round(totalImponible * saludPct / 100)
  }

  // AFC (seguro cesantía) - trabajador solo si contrato indefinido.
  // Tiene TOPE PROPIO, más alto que el de AFP/salud (131,9 UF vs 87,8 UF en 2025).
  const topeAfc = Math.round((Number(params.tope_afc_uf) || REM_DEFAULTS.tope_afc_uf!) * params.uf_valor)
  const imponibleAfc = Math.min(imponibleBruto, topeAfc)
  const descAfc = emp.contrato_tipo === 'indefinido'
    ? Math.round(imponibleAfc * params.afc_trabajador_pct / 100)
    : 0

  // Impuesto Único: base = renta bruta imponible − cotizaciones previsionales
  const baseTributable = Math.max(0, imponibleBruto - descAfp - descSalud - descAfc)
  const descImpuesto = impuestoUnico(baseTributable, params.utm_valor)

  const otrosDescuentos = Number(emp.otros_descuentos) || 0

  const totalDescuentos = descAfp + descSalud + descAfc + descImpuesto + otrosDescuentos

  // No imponibles
  const colacion = Number(emp.colacion) || 0
  const movilizacion = Number(emp.movilizacion) || 0

  // Haberes brutos (renta real, sin tope) + no imponibles
  const totalHaberes = imponibleBruto + colacion + movilizacion
  const liquidoPagar = totalHaberes - totalDescuentos

  return {
    sueldo_base: sueldoBase,
    horas_extra_monto: horasExtraMonto,
    gratificacion,
    bono_imponible: bonoImponible,
    colacion,
    movilizacion,
    total_imponible: totalImponible,
    total_haberes: totalHaberes,
    desc_afp: descAfp,
    desc_salud: descSalud,
    desc_afc: descAfc,
    desc_impuesto: descImpuesto,
    otros_descuentos: otrosDescuentos,
    total_descuentos: totalDescuentos,
    liquido_pagar: liquidoPagar,
  }
}

// ─── Aportes del empleador (función pura) ─────────────────
// No se descuentan al trabajador: son costo de la empresa, además de los haberes.
export function aportesEmpleador(
  liq: { total_imponible?: number; total_haberes?: number; colacion?: number; movilizacion?: number },
  contratoTipo: string | null | undefined,
  params: ParametrosRemuneracion
) {
  const base = Number(liq.total_imponible) || 0   // con tope AFP/salud

  // AFC tiene tope propio, y el empleador paga más en contratos a plazo o por obra
  const imponibleBruto = (Number(liq.total_haberes) || 0) - (Number(liq.colacion) || 0) - (Number(liq.movilizacion) || 0)
  const topeAfc = Math.round((Number(params.tope_afc_uf) || REM_DEFAULTS.tope_afc_uf!) * params.uf_valor)
  const afcPct = contratoTipo === 'indefinido'
    ? Number(params.afc_empleador_pct) || 0
    : Number(params.afc_empleador_plazo_pct ?? REM_DEFAULTS.afc_empleador_plazo_pct) || 0

  const afc = Math.round(Math.min(imponibleBruto, topeAfc) * afcPct / 100)
  const sis = Math.round(base * (Number(params.sis_pct ?? REM_DEFAULTS.sis_pct) || 0) / 100)
  const cotizacion = Math.round(base * (Number(params.cotizacion_empleador_pct ?? REM_DEFAULTS.cotizacion_empleador_pct) || 0) / 100)
  const mutual = Math.round(base * (Number(params.mutual_pct ?? REM_DEFAULTS.mutual_pct) || 0) / 100)

  return { afc, sis, cotizacion, mutual, total: afc + sis + cotizacion + mutual }
}
// lib/conciliacion-sii.ts
// Compara el Registro de Compras y Ventas del SII con los documentos cargados.
// Función pura: solo informa, no modifica nada.
import { claveFactura, claveFacturaLegacy, normalizarRut } from './sii'

export interface FilaRegistro {
  numero?: string | null
  contraparte?: string | null
  rut?: string | null
  doc_tipo?: string | null
  neto?: number | null
  iva?: number | null
  total?: number | null
  emision?: string | null
  periodo?: string | null
}

export interface DocSistema {
  id: string
  numero?: string | null
  cliente?: string | null
  rut_contraparte?: string | null
  doc_tipo?: string | null
  neto?: number | null
  iva?: number | null
  monto?: number | null
  emision?: string | null
  periodo?: string | null
}

export type EstadoConciliacion = 'cuadra' | 'diferencia' | 'otro_periodo' | 'solo_sii' | 'solo_sistema'

export interface ItemConciliacion {
  estado: EstadoConciliacion
  numero: string
  contraparte: string
  doc_tipo: string
  registro: FilaRegistro | null
  documento_id: string | null
  neto_sii: number | null
  iva_sii: number | null
  total_sii: number | null
  neto_sistema: number | null
  iva_sistema: number | null
  total_sistema: number | null
  periodo_sistema: string | null
}

const TOLERANCIA = 1 // peso: redondeo entre sistemas

// El SII puede traer las notas de crédito en negativo: se comparan los valores absolutos
const abs = (n: number | null | undefined) => Math.abs(Number(n) || 0)
const conSigno = (doc: { doc_tipo?: string | null }, n: number | null | undefined) =>
  (doc.doc_tipo === 'nota_credito' ? -1 : 1) * abs(n)

const periodoDe = (d: { periodo?: string | null; emision?: string | null }) =>
  d.periodo || (d.emision ? String(d.emision).slice(0, 7) : null)

export function conciliarRegistro(registro: FilaRegistro[], documentos: DocSistema[], periodo: string) {
  const usados = new Set<string>()

  const porClave = new Map<string, DocSistema>()
  const porLegacy = new Map<string, DocSistema[]>()
  for (const d of documentos) {
    const base = { numero: d.numero, periodo: '', doc_tipo: d.doc_tipo || 'factura' }
    porClave.set(claveFactura({ ...base, rut_contraparte: d.rut_contraparte }), d)
    const k = claveFacturaLegacy(base)
    porLegacy.set(k, [...(porLegacy.get(k) ?? []), d])
  }

  // El mismo folio con otro RUT es otro documento; sin RUT cargado, se acepta por folio
  const buscar = (r: FilaRegistro) => {
    const base = { numero: r.numero, periodo: '', doc_tipo: r.doc_tipo || 'factura' }
    const exacto = porClave.get(claveFactura({ ...base, rut_contraparte: r.rut }))
    if (exacto) return exacto
    return (porLegacy.get(claveFacturaLegacy(base)) ?? [])
      .find(d => !usados.has(d.id) && (!normalizarRut(d.rut_contraparte) || !normalizarRut(r.rut)))
  }

  const items: ItemConciliacion[] = registro.map(r => {
    const d = buscar(r)
    if (d) usados.add(d.id)
    const distinto = !!d && (
      Math.abs(abs(r.neto) - abs(d.neto)) > TOLERANCIA ||
      Math.abs(abs(r.iva) - abs(d.iva)) > TOLERANCIA ||
      Math.abs(abs(r.total) - abs(d.monto)) > TOLERANCIA
    )
    const otroPeriodo = !!d && !!periodoDe(d) && periodoDe(d) !== (r.periodo || periodo)
    return {
      estado: !d ? 'solo_sii' : distinto ? 'diferencia' : otroPeriodo ? 'otro_periodo' : 'cuadra',
      numero: String(r.numero ?? ''),
      contraparte: r.contraparte || d?.cliente || '',
      doc_tipo: r.doc_tipo || 'factura',
      registro: r,
      documento_id: d?.id ?? null,
      neto_sii: abs(r.neto),
      iva_sii: abs(r.iva),
      total_sii: abs(r.total),
      neto_sistema: d ? abs(d.neto) : null,
      iva_sistema: d ? abs(d.iva) : null,
      total_sistema: d ? abs(d.monto) : null,
      periodo_sistema: d ? periodoDe(d) : null,
    }
  })

  // Las boletas se registran como resumen mensual: no aparecen una a una en el registro
  const noVistos = documentos.filter(d => !usados.has(d.id) && periodoDe(d) === periodo && d.doc_tipo !== 'boleta')
  for (const d of noVistos) {
    items.push({
      estado: 'solo_sistema',
      numero: String(d.numero ?? ''),
      contraparte: d.cliente || '',
      doc_tipo: d.doc_tipo || 'factura',
      registro: null,
      documento_id: d.id,
      neto_sii: null, iva_sii: null, total_sii: null,
      neto_sistema: abs(d.neto), iva_sistema: abs(d.iva), total_sistema: abs(d.monto),
      periodo_sistema: periodoDe(d),
    })
  }

  const cuenta = (e: EstadoConciliacion) => items.filter(i => i.estado === e).length
  const sumaSII = (c: 'neto' | 'iva' | 'total') => registro.reduce((s, r) => s + conSigno(r, r[c]), 0)
  const delPeriodo = documentos.filter(d => periodoDe(d) === periodo && d.doc_tipo !== 'boleta')
  const sumaSis = (c: 'neto' | 'iva' | 'monto') => delPeriodo.reduce((s, d) => s + conSigno(d, d[c]), 0)

  return {
    items,
    resumen: {
      cuadra: cuenta('cuadra'),
      diferencia: cuenta('diferencia'),
      otro_periodo: cuenta('otro_periodo'),
      solo_sii: cuenta('solo_sii'),
      solo_sistema: cuenta('solo_sistema'),
      neto_sii: sumaSII('neto'), iva_sii: sumaSII('iva'), total_sii: sumaSII('total'),
      neto_sistema: sumaSis('neto'), iva_sistema: sumaSis('iva'), total_sistema: sumaSis('monto'),
    },
  }
}

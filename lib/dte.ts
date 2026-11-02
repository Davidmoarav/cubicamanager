// lib/dte.ts
// Documento tributario electrónico: arma y valida el documento a partir de la factura.
// Función pura y sin formato de ningún proveedor: cada proveedor lo traduce al suyo.
import { isValidRut, formatRut } from './rut'

export const NOMBRE_DTE: Record<number, string> = {
  33: 'Factura electrónica',
  34: 'Factura exenta electrónica',
  56: 'Nota de débito electrónica',
  61: 'Nota de crédito electrónica',
}

// Código de referencia del SII para notas
export const CODIGOS_REFERENCIA = [
  { value: 1, label: 'Anula el documento' },
  { value: 2, label: 'Corrige texto' },
  { value: 3, label: 'Corrige montos' },
]

const TASA_IVA = 19

export interface ParteDTE {
  rut?: string | null
  razon_social?: string | null
  giro?: string | null
  direccion?: string | null
  comuna?: string | null
}

export interface DocumentoDTE {
  tipo_dte: number
  fecha: string
  emisor: ParteDTE
  receptor: ParteDTE
  detalle: { descripcion: string; cantidad: number; precio: number; monto: number }[]
  totales: { neto: number; exento: number; tasa_iva: number; iva: number; total: number }
  referencias: { tipo_dte: number; folio: string; fecha: string | null; codigo: number; razon: string }[]
}

export function tipoDTE(factura: { doc_tipo?: string | null; iva?: number | null }): number | null {
  switch (factura.doc_tipo || 'factura') {
    case 'factura': return (Number(factura.iva) || 0) === 0 ? 34 : 33
    case 'nota_debito': return 56
    case 'nota_credito': return 61
    default: return null
  }
}

function validarParte(p: ParteDTE, nombre: string, errores: string[]) {
  if (!p.rut || !isValidRut(p.rut)) errores.push(`${nombre}: el RUT falta o no es válido`)
  if (!p.razon_social?.trim()) errores.push(`${nombre}: falta la razón social`)
  if (!p.giro?.trim()) errores.push(`${nombre}: falta el giro`)
  if (!p.direccion?.trim()) errores.push(`${nombre}: falta la dirección`)
  if (!p.comuna?.trim()) errores.push(`${nombre}: falta la comuna`)
}

export function construirDTE(e: {
  factura: any
  emisor: ParteDTE
  receptor: ParteDTE
  // Documento que modifica una nota, con su folio ya emitido
  referencia?: { tipo_dte: number; folio?: string | null; fecha?: string | null } | null
  codigoReferencia?: number
  descripcion?: string
}): { documento: DocumentoDTE | null; errores: string[] } {
  const { factura: f } = e
  const errores: string[] = []

  if (f.tipo === 'compra') errores.push('Solo se emiten documentos de venta')
  const tipo = tipoDTE(f)
  if (!tipo) errores.push('Este tipo de documento no se emite como DTE')
  if (!f.emision) errores.push('Falta la fecha de emisión')

  validarParte(e.emisor, 'Emisor', errores)
  validarParte(e.receptor, 'Receptor', errores)

  const neto = Number(f.neto) || 0
  const iva = Number(f.iva) || 0
  const total = Number(f.monto) || 0
  if (neto <= 0) errores.push('El neto debe ser mayor que 0')
  if (Math.abs(neto + iva - total) > 1) errores.push('Neto más IVA no da el total del documento')

  const exento = iva === 0
  if (!exento && Math.abs(Math.round(neto * TASA_IVA / 100) - iva) > 1) {
    errores.push(`El IVA no corresponde al ${TASA_IVA}% del neto`)
  }

  const esNota = tipo === 56 || tipo === 61
  const codigo = e.codigoReferencia ?? 3
  if (esNota) {
    if (!e.referencia) errores.push('La nota debe indicar la factura que modifica')
    else if (!e.referencia.folio) errores.push('La factura que modifica esta nota aún no tiene folio del SII')
    if (!CODIGOS_REFERENCIA.some(c => c.value === codigo)) errores.push('El código de referencia no es válido')
  }

  if (errores.length > 0 || !tipo) return { documento: null, errores }

  const formatear = (p: ParteDTE): ParteDTE => ({ ...p, rut: formatRut(p.rut as string) })
  return {
    errores,
    documento: {
      tipo_dte: tipo,
      fecha: f.emision,
      emisor: formatear(e.emisor),
      receptor: formatear(e.receptor),
      detalle: [{
        descripcion: e.descripcion || (f.proyecto ? `Servicios de construcción · ${f.proyecto}` : 'Servicios de construcción'),
        cantidad: 1,
        precio: neto,
        monto: neto,
      }],
      totales: { neto: exento ? 0 : neto, exento: exento ? neto : 0, tasa_iva: exento ? 0 : TASA_IVA, iva, total },
      referencias: esNota && e.referencia ? [{
        tipo_dte: e.referencia.tipo_dte,
        folio: String(e.referencia.folio),
        fecha: e.referencia.fecha ?? null,
        codigo,
        razon: CODIGOS_REFERENCIA.find(c => c.value === codigo)?.label ?? '',
      }] : [],
    },
  }
}

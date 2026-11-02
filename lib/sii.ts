// lib/sii.ts
// Helpers PUROS para importar el Registro de Compras y Ventas del SII.
// Centralizados y testeados (tests/sii.test.ts): aquí vive la parte frágil
// del importador (CSV con comillas, fechas, códigos de documento, dedup).

// ─── Códigos de tipo de documento SII → doc_tipo interno ───
// 33 factura electrónica · 34 factura exenta · 35/38/39/41 boletas ·
// 43 liquidación factura · 46 factura de compra · 48 comprobante de pago
// electrónico (tarjetas) · 56 nota de débito · 61 nota de crédito ·
// 110 factura de exportación · 111 ND exportación · 112 NC exportación
export const TIPO_DOC_SII: Record<string, string> = {
  '33': 'factura', '34': 'factura', '43': 'factura', '46': 'factura', '110': 'factura',
  '35': 'boleta', '38': 'boleta', '39': 'boleta', '41': 'boleta', '48': 'boleta',
  '56': 'nota_debito', '111': 'nota_debito',
  '61': 'nota_credito', '112': 'nota_credito',
}

export function mapTipoDocSII(codigo: string): string {
  return TIPO_DOC_SII[(codigo || '').trim()] || 'factura'
}

// ─── Split de una línea CSV respetando comillas ────────────
// "EMPRESA X, LTDA";123  →  ['EMPRESA X, LTDA', '123']
export function splitCSVLine(linea: string, sep: string): string[] {
  const out: string[] = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { campo += '"'; i++ }  // comilla escapada ""
        else enComillas = false
      } else campo += ch
    } else {
      if (ch === '"') enComillas = true
      else if (ch === sep) { out.push(campo); campo = '' }
      else campo += ch
    }
  }
  out.push(campo)
  return out.map(c => c.trim())
}

// ─── Fecha SII → YYYY-MM-DD (o null si no es interpretable) ─
// Acepta: DD/MM/AAAA · DD-MM-AAAA · DD-MM-AA · AAAA-MM-DD (con o sin hora)
export function parseFechaSII(s: string | null | undefined): string | null {
  if (!s) return null
  const limpio = String(s).trim().split(' ')[0]
  const partes = limpio.split(/[-/]/)
  if (partes.length !== 3) return null

  let d: string, m: string, a: string
  if (partes[0].length === 4) {          // AAAA-MM-DD
    ;[a, m, d] = partes
  } else {                               // DD-MM-AAAA o DD-MM-AA
    ;[d, m, a] = partes
    if (a.length === 2) a = '20' + a
  }
  const dia = Number(d), mes = Number(m), anio = Number(a)
  if (!anio || anio < 1990 || anio > 2100) return null
  if (!mes || mes < 1 || mes > 12) return null
  if (!dia || dia < 1 || dia > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ─── Número SII → entero (soporta $ y separadores de miles) ─
export function parseMontoSII(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0
  return Number(String(s).replace(/[^\d-]/g, '')) || 0
}

// ─── RUT normalizado para comparar (sin puntos, minúscula) ──
export function normalizarRut(rut: string | null | undefined): string {
  return String(rut || '').toLowerCase().replace(/[^0-9k]/g, '')
}

// ─── Clave anti-duplicados de una factura ──────────────────
// Incluye el RUT de la contraparte: dos proveedores distintos pueden
// emitir el MISMO folio en el MISMO período (antes se descartaba el 2º).
export function claveFactura(f: {
  numero?: string | null; periodo?: string | null;
  doc_tipo?: string | null; rut_contraparte?: string | null;
}): string {
  return [
    String(f.numero ?? '').trim(),
    String(f.periodo ?? ''),
    f.doc_tipo || 'factura',
    normalizarRut(f.rut_contraparte),
  ].join('__')
}

// Clave antigua (sin RUT) — para no re-importar filas cargadas antes
// de que existiera la columna rut_contraparte.
export function claveFacturaLegacy(f: {
  numero?: string | null; periodo?: string | null; doc_tipo?: string | null;
}): string {
  return [
    String(f.numero ?? '').trim(),
    String(f.periodo ?? ''),
    f.doc_tipo || 'factura',
  ].join('__')
}

// ─── Decodificar el archivo: UTF-8, y si viene corrupto, Latin-1 ─
// El SII suele exportar en Windows-1252; leído como UTF-8 aparece '�'.
export function decodificarCSV(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8
  try { return new TextDecoder('windows-1252').decode(buffer) }
  catch { return utf8 }
}

// ─── Registro de Compras y Ventas: del CSV a filas ─────────
export interface FilaRCV {
  numero: string
  contraparte: string
  rut: string
  neto: number
  exento: number
  iva: number
  total: number
  emision: string | null
  periodo: string | null
  doc_tipo: string
  ref_detectada: string
}

const normalizarColumna = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

// Detecta las columnas por nombre: el SII no siempre las entrega en el mismo orden.
export function parsearRCV(texto: string): { filas: FilaRCV[]; omitidas: number; error: string | null } {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim())
  if (lineas.length < 2) return { filas: [], omitidas: 0, error: 'El archivo está vacío o no tiene datos' }

  const sep = lineas[0].includes(';') ? ';' : ','
  const header = splitCSVLine(lineas[0], sep).map(normalizarColumna)
  const idx = (nombres: string[]) => {
    for (const n of nombres) {
      const i = header.findIndex(h => h.includes(normalizarColumna(n)))
      if (i >= 0) return i
    }
    return -1
  }

  const iFolio  = idx(['folio'])
  const iRut    = idx(['rutproveedor', 'rutcliente', 'rut'])
  const iRazon  = idx(['razonsocial', 'razon'])
  const iFecha  = idx(['fechadocto', 'fechaemision', 'fecha'])
  const iNeto   = idx(['montoneto', 'neto'])
  const iExento = idx(['montoexento', 'exento'])
  const iIva    = idx(['montoivarecuperable', 'ivarecuperable', 'montoiva', 'iva'])
  const iTotal  = idx(['montototal', 'total'])
  const iTipoDoc= idx(['tipodoc', 'tipodte', 'tipodocumento'])
  const iRef    = idx(['nceondesobrefact', 'ndesobrefact', 'sobrefactdecompra', 'sobrefact', 'facturareferencia', 'referencia'])

  if (iNeto < 0 || iTotal < 0) {
    return { filas: [], omitidas: 0, error: 'No se reconocen las columnas del archivo. ¿Es un RCV del SII?' }
  }

  const filas: FilaRCV[] = []
  let omitidas = 0
  for (let i = 1; i < lineas.length; i++) {
    // Split que respeta comillas: "EMPRESA X, LTDA" ya no corre las columnas
    const c = splitCSVLine(lineas[i], sep)
    const neto = parseMontoSII(c[iNeto])
    const exento = iExento >= 0 ? parseMontoSII(c[iExento]) : 0
    const total = parseMontoSII(c[iTotal])
    const iva = iIva >= 0 ? parseMontoSII(c[iIva]) : 0
    if (neto === 0 && total === 0 && exento === 0 && iva === 0) { omitidas++; continue }

    const emision = iFecha >= 0 ? parseFechaSII(c[iFecha]) : null
    const codTipo = iTipoDoc >= 0 ? (c[iTipoDoc] || '').trim() : '33'
    filas.push({
      numero: iFolio >= 0 ? (c[iFolio] || '').trim() : '',
      contraparte: iRazon >= 0 ? (c[iRazon] || '').trim() : 'Sin nombre',
      rut: iRut >= 0 ? (c[iRut] || '').trim() : '',
      neto: neto + exento,   // el neto total incluye lo exento (sin IVA)
      exento,
      iva,
      total,
      emision,
      periodo: emision ? emision.slice(0, 7) : null,
      doc_tipo: mapTipoDocSII(codTipo),
      ref_detectada: iRef >= 0 ? (c[iRef] || '').trim() : '',
    })
  }

  if (filas.length === 0) return { filas, omitidas, error: 'No se encontraron facturas válidas en el archivo' }
  return { filas, omitidas, error: null }
}

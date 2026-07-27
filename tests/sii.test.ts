// tests/sii.test.ts
// Tests del importador SII: las causas reales de "facturas que no se suben".
import { describe, it, expect } from 'vitest'
import {
  splitCSVLine, parseFechaSII, parseMontoSII, normalizarRut,
  mapTipoDocSII, claveFactura, claveFacturaLegacy,
} from '../lib/sii'

describe('splitCSVLine (CSV con comillas)', () => {
  it('la coma dentro de comillas NO corre las columnas', () => {
    expect(splitCSVLine('123,"EMPRESA X, LTDA",1000', ','))
      .toEqual(['123', 'EMPRESA X, LTDA', '1000'])
  })
  it('punto y coma dentro de comillas', () => {
    expect(splitCSVLine('33;"CONSTRUCTORA; HIJOS";500000', ';'))
      .toEqual(['33', 'CONSTRUCTORA; HIJOS', '500000'])
  })
  it('comilla escapada "" dentro del campo', () => {
    expect(splitCSVLine('1,"DICE ""HOLA""",2', ',')).toEqual(['1', 'DICE "HOLA"', '2'])
  })
  it('campos vacíos se conservan (los índices no se corren)', () => {
    expect(splitCSVLine('a;;c', ';')).toEqual(['a', '', 'c'])
  })
})

describe('parseFechaSII', () => {
  it('DD/MM/AAAA y DD-MM-AAAA', () => {
    expect(parseFechaSII('15/03/2026')).toBe('2026-03-15')
    expect(parseFechaSII('01-12-2025')).toBe('2025-12-01')
  })
  it('año corto DD-MM-AA', () => {
    expect(parseFechaSII('05-07-26')).toBe('2026-07-05')
  })
  it('AAAA-MM-DD (ya ISO) no genera fecha corrupta', () => {
    // Antes producía "2020-03-2015" e invalidaba el lote entero de 100 filas
    expect(parseFechaSII('2026-03-15')).toBe('2026-03-15')
  })
  it('con hora, la descarta', () => {
    expect(parseFechaSII('15/03/2026 14:30')).toBe('2026-03-15')
  })
  it('basura → null (no rompe el lote)', () => {
    expect(parseFechaSII('')).toBeNull()
    expect(parseFechaSII('sin fecha')).toBeNull()
    expect(parseFechaSII('99/99/9999')).toBeNull()
  })
})

describe('parseMontoSII', () => {
  it('separador de miles y signo', () => {
    expect(parseMontoSII('1.234.567')).toBe(1234567)
    expect(parseMontoSII('$500.000')).toBe(500000)
    expect(parseMontoSII('-19.000')).toBe(-19000)
    expect(parseMontoSII('')).toBe(0)
  })
})

describe('mapTipoDocSII (comprobantes electrónicos incluidos)', () => {
  it('facturas: 33, 34, 43, 46, 110', () => {
    for (const c of ['33', '34', '43', '46', '110']) expect(mapTipoDocSII(c)).toBe('factura')
  })
  it('boletas y comprobante de pago electrónico: 35, 38, 39, 41, 48', () => {
    for (const c of ['35', '38', '39', '41', '48']) expect(mapTipoDocSII(c)).toBe('boleta')
  })
  it('notas: 56/111 débito, 61/112 crédito', () => {
    expect(mapTipoDocSII('56')).toBe('nota_debito')
    expect(mapTipoDocSII('111')).toBe('nota_debito')
    expect(mapTipoDocSII('61')).toBe('nota_credito')
    expect(mapTipoDocSII('112')).toBe('nota_credito')
  })
  it('código desconocido → factura (no se pierde la fila)', () => {
    expect(mapTipoDocSII('999')).toBe('factura')
  })
})

describe('claveFactura (anti-duplicados)', () => {
  it('dos proveedores con el MISMO folio son documentos DISTINTOS', () => {
    const a = { numero: '123', periodo: '2026-01', doc_tipo: 'factura', rut_contraparte: '76111222-3' }
    const b = { numero: '123', periodo: '2026-01', doc_tipo: 'factura', rut_contraparte: '77888999-K' }
    expect(claveFactura(a)).not.toBe(claveFactura(b))
  })
  it('el mismo documento re-importado SÍ es duplicado (RUT con/sin puntos)', () => {
    const a = { numero: '123', periodo: '2026-01', doc_tipo: 'factura', rut_contraparte: '76.111.222-3' }
    const b = { numero: '123', periodo: '2026-01', doc_tipo: 'factura', rut_contraparte: '76111222-3' }
    expect(claveFactura(a)).toBe(claveFactura(b))
  })
  it('factura y nota de crédito con el mismo folio NO chocan', () => {
    const f = { numero: '55', periodo: '2026-02', doc_tipo: 'factura', rut_contraparte: '1-9' }
    const n = { numero: '55', periodo: '2026-02', doc_tipo: 'nota_credito', rut_contraparte: '1-9' }
    expect(claveFactura(f)).not.toBe(claveFactura(n))
  })
  it('clave legacy compatible con filas antiguas sin RUT', () => {
    const antigua = { numero: '9', periodo: '2025-12', doc_tipo: 'factura' }
    expect(claveFacturaLegacy(antigua)).toBe('9__2025-12__factura')
  })
})

describe('normalizarRut', () => {
  it('quita puntos/guiones y baja a minúscula', () => {
    expect(normalizarRut('76.111.222-K')).toBe('76111222k')
    expect(normalizarRut(' 1-9 ')).toBe('19')
    expect(normalizarRut(null)).toBe('')
  })
})

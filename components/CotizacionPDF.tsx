'use client'
// components/CotizacionPDF.tsx
//
// Plantilla PDF estilo Brandis: logo + datos empresa arriba,
// datos del cliente, tabla de partidas, totales con IVA, notas al pie.

import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import type { Cotizacion, PartidaCotizacion } from '@/types/cotizaciones'
import type { Cliente } from '@/types/cliente'
import type { EmpresaConfig } from '@/types/empresa'

// ── HELPERS (compartidos por todas las plantillas) ──────
import { fmtCL, fechaLarga as fmtFecha, IVA_PCT as IVA } from './pdf-comunes'

// ── ESTILOS PDF ─────────────────────────────────────────
const createStyles = (color: string) => StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a2535',
  },
  // ─── HEADER ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: color,
  },
  logoBox: {
    width: 140,
    maxHeight: 80,
  },
  logo: {
    maxWidth: 140,
    maxHeight: 80,
    objectFit: 'contain',
  },
  logoPlaceholder: {
    width: 140,
    height: 80,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  logoPlaceholderText: {
    fontSize: 9,
    color: '#6b7a8d',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  rutEmpresa: {
    fontSize: 9,
    color: '#6b7a8d',
    marginBottom: 4,
  },
  titleCotizacion: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 4,
    color: color,
    marginBottom: 4,
  },
  fechaCotizacion: {
    fontSize: 9,
    color: '#6b7a8d',
  },

  // ─── DATOS EMPRESA Y CLIENTE ───
  twoCols: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 18,
  },
  colLeft: {
    flex: 1,
    paddingRight: 14,
  },
  colRight: {
    flex: 1,
    paddingLeft: 14,
    borderLeftWidth: 0.5,
    borderLeftColor: '#d1d9e6',
  },
  blockTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: color,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  blockName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1a2535',
    marginBottom: 2,
  },
  blockLine: {
    fontSize: 9,
    color: '#4a5568',
    marginBottom: 1.5,
    lineHeight: 1.3,
  },

  // ─── INTRO ───
  intro: {
    fontSize: 10,
    color: '#1a2535',
    marginBottom: 14,
    lineHeight: 1.4,
  },

  // ─── TABLA ───
  table: {
    marginTop: 8,
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f4f7fb',
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#d1d9e6',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  thCantidad:    { width: 50, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase' },
  thDescripcion: { flex: 1,  fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase' },
  thPrecio:      { width: 70, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', textAlign: 'right' },
  thTotal:       { width: 70, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e4e9f0',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tdCantidad:    { width: 50, fontSize: 9, color: '#1a2535' },
  tdDescripcion: { flex: 1,  fontSize: 9, color: '#1a2535', paddingRight: 10, lineHeight: 1.35 },
  tdPrecio:      { width: 70, fontSize: 9, color: '#1a2535', textAlign: 'right' },
  tdTotal:       { width: 70, fontSize: 9, color: '#1a2535', textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  // ─── TOTALES ───
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  totalsBox: {
    width: 220,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e4e9f0',
  },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: '#f4f7fb',
  },
  totalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: color,
  },
  totalValue: {
    fontSize: 10,
    color: '#1a2535',
    fontFamily: 'Helvetica-Bold',
  },
  totalFinalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: color,
  },
  totalFinalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1a2535',
  },

  // ─── PIE ───
  notas: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#d1d9e6',
    fontSize: 9,
    color: '#6b7a8d',
    lineHeight: 1.4,
  },
  notasTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: color,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#a0aab8',
    borderTopWidth: 0.5,
    borderTopColor: '#e4e9f0',
    paddingTop: 8,
  },
})

// ── COMPONENTE ─────────────────────────────────────────
interface Props {
  cotizacion: Cotizacion
  cliente?: Cliente | null
  empresa?: EmpresaConfig | null
  logoUrl?: string | null
}

export function CotizacionPDF({ cotizacion, cliente, empresa, logoUrl }: Props) {
  const color = empresa?.color_primario || '#1e6bb8'
  const styles = createStyles(color)

  const partidas: PartidaCotizacion[] = cotizacion.partidas ?? []
  const neto  = partidas.reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0), 0)
  const iva   = Math.round(neto * IVA)
  const total = Math.round(neto) + iva

  return (
    <Document
      title={`Cotización ${cotizacion.numero || ''}`}
      author={empresa?.razon_social || 'Cubica Manager'}
      subject="Cotización"
    >
      <Page size="A4" style={styles.page}>

        {/* ─── HEADER: logo + título ─── */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {logoUrl
              ? <Image src={logoUrl} style={styles.logo} />
              : <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderText}>{empresa?.razon_social || 'Logo'}</Text></View>
            }
          </View>
          <View style={styles.headerRight}>
            {empresa?.rut && <Text style={styles.rutEmpresa}>RUT: {empresa.rut}</Text>}
            <Text style={styles.titleCotizacion}>COTIZACIÓN</Text>
            <Text style={styles.fechaCotizacion}>{fmtFecha(cotizacion.fecha)}</Text>
            {cotizacion.numero && <Text style={[styles.fechaCotizacion, { marginTop: 2, fontFamily: 'Helvetica-Bold' }]}>N° {cotizacion.numero}</Text>}
          </View>
        </View>

        {/* ─── BLOQUE EMPRESA + CLIENTE ─── */}
        <View style={styles.twoCols}>
          {/* EMPRESA */}
          <View style={styles.colLeft}>
            <Text style={styles.blockTitle}>De</Text>
            {empresa?.razon_social && <Text style={styles.blockName}>{empresa.razon_social}</Text>}
            {empresa?.giro      && <Text style={styles.blockLine}>{empresa.giro}</Text>}
            {empresa?.direccion && <Text style={styles.blockLine}>{empresa.direccion}</Text>}
            {(empresa?.comuna || empresa?.ciudad) && (
              <Text style={styles.blockLine}>{[empresa.comuna, empresa.ciudad].filter(Boolean).join(', ')}</Text>
            )}
            {empresa?.telefono  && <Text style={styles.blockLine}>{empresa.telefono}</Text>}
            {empresa?.email     && <Text style={styles.blockLine}>{empresa.email}</Text>}
            {empresa?.sitio_web && <Text style={styles.blockLine}>{empresa.sitio_web}</Text>}
          </View>

          {/* CLIENTE */}
          <View style={styles.colRight}>
            <Text style={styles.blockTitle}>Cliente</Text>
            <Text style={styles.blockName}>{cliente?.razon_social || cotizacion.cliente}</Text>
            {cliente?.rut       && <Text style={styles.blockLine}>RUT: {cliente.rut}</Text>}
            {cliente?.giro      && <Text style={styles.blockLine}>{cliente.giro}</Text>}
            {cliente?.contacto  && <Text style={styles.blockLine}>Atte: {cliente.contacto}</Text>}
            {cliente?.direccion && <Text style={styles.blockLine}>{cliente.direccion}</Text>}
            {(cliente?.comuna || cliente?.ciudad) && (
              <Text style={styles.blockLine}>{[cliente.comuna, cliente.ciudad].filter(Boolean).join(', ')}</Text>
            )}
            {cliente?.telefono  && <Text style={styles.blockLine}>{cliente.telefono}</Text>}
            {cliente?.email     && <Text style={styles.blockLine}>{cliente.email}</Text>}
          </View>
        </View>

        {/* ─── INTRO ─── */}
        {cotizacion.descripcion && (
          <Text style={styles.intro}>{cotizacion.descripcion}</Text>
        )}

        {/* ─── TABLA DE PARTIDAS ─── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thCantidad}>Cantidad</Text>
            <Text style={styles.thDescripcion}>Descripción</Text>
            <Text style={styles.thPrecio}>Valor uni.</Text>
            <Text style={styles.thTotal}>Valor Neto</Text>
          </View>

          {partidas.map((p, i) => {
            const sub = (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0)
            return (
              <View key={p.id || i} style={styles.tableRow} wrap={false}>
                <Text style={styles.tdCantidad}>{Number(p.cantidad)} {p.unidad}</Text>
                <Text style={styles.tdDescripcion}>{p.descripcion}</Text>
                <Text style={styles.tdPrecio}>{fmtCL(p.precio_unitario)}</Text>
                <Text style={styles.tdTotal}>{fmtCL(sub)}</Text>
              </View>
            )
          })}
        </View>

        {/* ─── TOTALES ─── */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Valor Neto</Text>
              <Text style={styles.totalValue}>{fmtCL(neto)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA</Text>
              <Text style={styles.totalValue}>{fmtCL(iva)}</Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalFinalLabel}>Valor total</Text>
              <Text style={styles.totalFinalValue}>{fmtCL(total)}</Text>
            </View>
          </View>
        </View>

        {/* ─── NOTAS ─── */}
        {(cotizacion.notas || empresa?.notas_pdf || cotizacion.validez_dias) && (
          <View style={styles.notas}>
            <Text style={styles.notasTitle}>Términos y condiciones</Text>
            {cotizacion.validez_dias && <Text>Validez de la oferta: {cotizacion.validez_dias} días desde la fecha de emisión.</Text>}
            {cotizacion.notas && <Text>{cotizacion.notas}</Text>}
            {empresa?.notas_pdf && <Text>{empresa.notas_pdf}</Text>}
          </View>
        )}

        {/* ─── FOOTER ─── */}
        <View style={styles.footer} fixed>
          <Text>{empresa?.razon_social || 'Cubica Manager'}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

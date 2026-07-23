'use client'
// components/OrdenCompraPDF.tsx
//
// PDF de orden de compra: logo + datos empresa, datos del proveedor,
// tabla de líneas (material/cantidad/precio), totales con IVA, notas al pie.

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { EmpresaConfig } from '@/types/empresa'
import type { Proveedor } from '@/types'

import { fmtCL, fechaLarga as fmtFecha, IVA_PCT as IVA } from './pdf-comunes'

const createStyles = (color: string) => StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a2535' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: color,
  },
  logoBox: { width: 140, maxHeight: 80 },
  logo: { maxWidth: 140, maxHeight: 80, objectFit: 'contain' },
  logoPlaceholder: { width: 140, height: 80, backgroundColor: '#f0f4f8', justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  logoPlaceholderText: { fontSize: 9, color: '#6b7a8d' },
  headerRight: { alignItems: 'flex-end' },
  rutEmpresa: { fontSize: 9, color: '#6b7a8d', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 3, color: color, marginBottom: 4 },
  fecha: { fontSize: 9, color: '#6b7a8d' },

  twoCols: { flexDirection: 'row', marginTop: 14, marginBottom: 18 },
  colLeft: { flex: 1, paddingRight: 14 },
  colRight: { flex: 1, paddingLeft: 14, borderLeftWidth: 0.5, borderLeftColor: '#d1d9e6' },
  blockTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  blockName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1a2535', marginBottom: 2 },
  blockLine: { fontSize: 9, color: '#4a5568', marginBottom: 1.5, lineHeight: 1.3 },

  proyectoBar: {
    backgroundColor: '#f4f7fb', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 10,
    marginBottom: 14, fontSize: 9, color: '#4a5568',
  },

  table: { marginTop: 8, marginBottom: 10 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#f4f7fb', borderTopWidth: 0.5, borderBottomWidth: 0.5,
    borderColor: '#d1d9e6', paddingVertical: 7, paddingHorizontal: 8,
  },
  thMaterial: { flex: 1,  fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase' },
  thUnidad:   { width: 42, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase' },
  thCantidad: { width: 55, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', textAlign: 'right' },
  thPrecio:   { width: 70, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', textAlign: 'right' },
  thTotal:    { width: 75, fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', textAlign: 'right' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e4e9f0', paddingVertical: 7, paddingHorizontal: 8 },
  tdMaterial: { flex: 1,  fontSize: 9, color: '#1a2535', paddingRight: 10, lineHeight: 1.35 },
  tdUnidad:   { width: 42, fontSize: 9, color: '#4a5568' },
  tdCantidad: { width: 55, fontSize: 9, color: '#1a2535', textAlign: 'right' },
  tdPrecio:   { width: 70, fontSize: 9, color: '#1a2535', textAlign: 'right' },
  tdTotal:    { width: 75, fontSize: 9, color: '#1a2535', textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  totalsBox: { width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#e4e9f0' },
  totalRowFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#f4f7fb' },
  totalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: color },
  totalValue: { fontSize: 10, color: '#1a2535', fontFamily: 'Helvetica-Bold' },
  totalFinalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: color },
  totalFinalValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1a2535' },

  notas: { marginTop: 24, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#d1d9e6', fontSize: 9, color: '#6b7a8d', lineHeight: 1.4 },
  notasTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  footer: {
    position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 8, color: '#a0aab8', borderTopWidth: 0.5, borderTopColor: '#e4e9f0', paddingTop: 8,
  },
})

interface Props {
  orden: any
  proveedor?: Proveedor | null
  empresa?: EmpresaConfig | null
  logoUrl?: string | null
}

export function OrdenCompraPDF({ orden, proveedor, empresa, logoUrl }: Props) {
  const color = empresa?.color_primario || '#1e6bb8'
  const styles = createStyles(color)

  const lineas: any[] = orden?.lineas ?? []
  const neto  = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0)
  const iva   = Math.round(neto * IVA)
  const total = Math.round(neto) + iva

  return (
    <Document
      title={`Orden de compra ${orden?.numero || ''}`}
      author={empresa?.razon_social || 'Cubica Manager'}
      subject="Orden de compra"
    >
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            {logoUrl
              ? <Image src={logoUrl} style={styles.logo} />
              : <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderText}>{empresa?.razon_social || 'Logo'}</Text></View>}
          </View>
          <View style={styles.headerRight}>
            {empresa?.rut && <Text style={styles.rutEmpresa}>RUT: {empresa.rut}</Text>}
            <Text style={styles.title}>ORDEN DE COMPRA</Text>
            <Text style={styles.fecha}>{fmtFecha(orden?.fecha)}</Text>
            {orden?.numero != null && <Text style={[styles.fecha, { marginTop: 2, fontFamily: 'Helvetica-Bold' }]}>N° {orden.numero}</Text>}
          </View>
        </View>

        {/* EMPRESA + PROVEEDOR */}
        <View style={styles.twoCols}>
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
          </View>

          <View style={styles.colRight}>
            <Text style={styles.blockTitle}>Proveedor</Text>
            <Text style={styles.blockName}>{(proveedor as any)?.nombre || orden?.proveedor || '—'}</Text>
            {(proveedor as any)?.rut      && <Text style={styles.blockLine}>RUT: {(proveedor as any).rut}</Text>}
            {(proveedor as any)?.rubro    && <Text style={styles.blockLine}>{(proveedor as any).rubro}</Text>}
            {(proveedor as any)?.contacto && <Text style={styles.blockLine}>Atte: {(proveedor as any).contacto}</Text>}
            {(proveedor as any)?.telefono && <Text style={styles.blockLine}>{(proveedor as any).telefono}</Text>}
          </View>
        </View>

        {/* PROYECTO (si aplica) */}
        {orden?.proyecto && (
          <View style={styles.proyectoBar}>
            <Text>Obra / proyecto: <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a2535' }}>{orden.proyecto}</Text></Text>
          </View>
        )}

        {/* TABLA */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.thMaterial}>Material</Text>
            <Text style={styles.thUnidad}>Unidad</Text>
            <Text style={styles.thCantidad}>Cantidad</Text>
            <Text style={styles.thPrecio}>Precio uni.</Text>
            <Text style={styles.thTotal}>Subtotal</Text>
          </View>

          {lineas.map((l, i) => {
            const sub = (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)
            return (
              <View key={l.id || i} style={styles.tableRow} wrap={false}>
                <Text style={styles.tdMaterial}>{l.material}</Text>
                <Text style={styles.tdUnidad}>{l.unidad}</Text>
                <Text style={styles.tdCantidad}>{Number(l.cantidad).toLocaleString('es-CL')}</Text>
                <Text style={styles.tdPrecio}>{fmtCL(l.precio_unitario)}</Text>
                <Text style={styles.tdTotal}>{fmtCL(sub)}</Text>
              </View>
            )
          })}
        </View>

        {/* TOTALES */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Neto</Text>
              <Text style={styles.totalValue}>{fmtCL(neto)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA 19%</Text>
              <Text style={styles.totalValue}>{fmtCL(iva)}</Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalFinalLabel}>Total</Text>
              <Text style={styles.totalFinalValue}>{fmtCL(total)}</Text>
            </View>
          </View>
        </View>

        {/* NOTAS */}
        {(orden?.notas || empresa?.notas_pdf) && (
          <View style={styles.notas}>
            <Text style={styles.notasTitle}>Notas</Text>
            {orden?.notas && <Text>{orden.notas}</Text>}
            {empresa?.notas_pdf && <Text>{empresa.notas_pdf}</Text>}
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>{empresa?.razon_social || 'Cubica Manager'}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
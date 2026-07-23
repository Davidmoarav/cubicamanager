'use client'
// components/EstadoPagoPDF.tsx
//
// PDF de Estado de Pago — diseño Cubica (navy #0F2B53 / dorado #F5B800).
// Replica el formato constructora: cabecera con datos de obra, tabla de
// partidas con 4 bloques (Total Contrato / Ejec. a la fecha / Pago anterior
// / Pago actual), cascada final de deducciones y espacio de firmas.

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { EstadoPago, EstadoPagoDetalle } from '@/types/estado-pago'
import type { EmpresaConfig } from '@/types/empresa'

import {
  PDF_NAVY as NAVY, PDF_GOLD as GOLD, PDF_INK as INK, PDF_MUTE as MUTE, PDF_LINE as LINE,
  fmtCL, pctCL as pct, fechaCorta as fmtFecha,
} from './pdf-comunes'

interface Props {
  ep: EstadoPago
  proyecto: { nombre: string; cliente?: string; direccion?: string; contrato_n?: string | number }
  empresa?: EmpresaConfig | null
  logoUrl?: string | null
  detalle?: EstadoPagoDetalle[]
}

const st = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 8, color: INK },

  // ─── HEADER ───
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 12, marginBottom: 12 },
  logo: { maxWidth: 120, maxHeight: 54, objectFit: 'contain' },
  logoPh: { width: 120, height: 46, backgroundColor: NAVY, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center' },
  logoPhTxt: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 1 },
  headerRight: { alignItems: 'flex-end' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 1 },
  titleBar: { width: 44, height: 3, backgroundColor: GOLD, marginTop: 3, marginBottom: 6, alignSelf: 'flex-end' },
  epNum: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK },
  epMeta: { fontSize: 8, color: MUTE, marginTop: 2 },

  // ─── DATOS OBRA ───
  infoBox: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12,
    backgroundColor: '#f4f7fb', borderRadius: 4, padding: 8 },
  infoCol: { flex: 1 },
  infoLbl: { fontSize: 7, color: MUTE, textTransform: 'uppercase', marginBottom: 1 },
  infoVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 4 },

  // ─── TABLA ───
  tblHeadGroup: { flexDirection: 'row', backgroundColor: NAVY },
  tblHead: { flexDirection: 'row', backgroundColor: '#1c3b66' },
  groupCell: { color: '#fff', fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center',
    paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: '#33507d' },
  th: { color: '#fff', fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'right',
    paddingVertical: 3, paddingHorizontal: 3, borderRightWidth: 0.5, borderRightColor: '#33507d' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  rowAlt: { backgroundColor: '#f9fbfd' },
  td: { fontSize: 6.5, textAlign: 'right', paddingVertical: 2.5, paddingHorizontal: 3,
    borderRightWidth: 0.5, borderRightColor: '#eef2f7' },
  tdName: { fontSize: 6.5, textAlign: 'left' },

  // col widths
  cN: { width: '4%', textAlign: 'center' },
  cDesc: { width: '26%' },
  cUnid: { width: '5%', textAlign: 'center' },
  cQ: { width: '6.5%' },
  cMoney: { width: '10.5%' },

  // ─── TOTAL ROW ───
  totalRow: { flexDirection: 'row', backgroundColor: '#e8eef6', borderTopWidth: 1, borderTopColor: NAVY },
  totalTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: NAVY, paddingVertical: 3, paddingHorizontal: 3, textAlign: 'right' },

  // ─── CASCADA ───
  cascadaWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  cascada: { width: '52%', borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  cascRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 8,
    borderBottomWidth: 0.5, borderBottomColor: '#eef2f7' },
  cascLbl: { fontSize: 8, color: INK },
  cascVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK },
  cascValNeg: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#b0401a' },
  cascTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 8,
    backgroundColor: NAVY },
  cascTotalLbl: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' },
  cascTotalVal: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GOLD },

  // ─── ACUMULADOS ───
  acumWrap: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  acumBox: { width: '48%', borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  acumTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase',
    marginBottom: 4, borderBottomWidth: 0.5, borderBottomColor: LINE, paddingBottom: 3 },
  acumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  acumLbl: { fontSize: 7.5, color: MUTE },
  acumVal: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: INK },

  // ─── FIRMAS ───
  firmas: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 40 },
  firmaCol: { alignItems: 'center', width: '30%' },
  firmaLine: { borderTopWidth: 0.8, borderTopColor: INK, width: '100%', marginBottom: 3 },
  firmaTxt: { fontSize: 7, color: MUTE, textAlign: 'center' },

  // ─── FOOTER ───
  footer: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row',
    justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
  footerTxt: { fontSize: 6.5, color: MUTE },
})

export function EstadoPagoPDF({ ep, proyecto, empresa, logoUrl, detalle = [] }: Props) {
  const items = detalle.length ? detalle : (ep.detalle || [])

  // Derivar las 4 columnas por partida a partir del avance guardado
  const filas = items.map(d => {
    const valor = Number(d.valor_partida) || 0
    const aAnt = Number(d.avance_anterior) || 0
    const aAct = Number(d.avance_actual) || 0
    const aPer = Number(d.avance_periodo) || 0
    return {
      desc: d.descripcion || '',
      unidad: (d as any).unidad || 'GL',
      totalContrato: valor,
      ejecTotal: Math.round(valor * aAct / 100),
      pagoAnterior: Math.round(valor * aAnt / 100),
      pagoActual: Number(d.monto) || Math.round(valor * aPer / 100),
      aAct, aAnt,
    }
  })

  const sumTotalContrato = filas.reduce((s, f) => s + f.totalContrato, 0)
  const sumEjec = filas.reduce((s, f) => s + f.ejecTotal, 0)
  const sumAnterior = filas.reduce((s, f) => s + f.pagoAnterior, 0)
  const sumActual = filas.reduce((s, f) => s + f.pagoActual, 0)

  const razon = empresa?.razon_social || 'Empresa'

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={st.page}>
        {/* HEADER */}
        <View style={st.header}>
          {logoUrl
            ? <Image src={logoUrl} style={st.logo} />
            : <View style={st.logoPh}><Text style={st.logoPhTxt}>CUBICA</Text></View>}
          <View style={st.headerRight}>
            <Text style={st.title}>ESTADO DE PAGO</Text>
            <View style={st.titleBar} />
            <Text style={st.epNum}>N° {ep.numero}</Text>
            <Text style={st.epMeta}>Período {ep.periodo || '—'} · Fecha {fmtFecha(ep.fecha)}</Text>
            {proyecto.contrato_n != null && <Text style={st.epMeta}>Contrato N° {proyecto.contrato_n}</Text>}
          </View>
        </View>

        {/* DATOS OBRA */}
        <View style={st.infoBox}>
          <View style={st.infoCol}>
            <Text style={st.infoLbl}>Contratista</Text>
            <Text style={st.infoVal}>{razon}</Text>
            <Text style={st.infoLbl}>RUT</Text>
            <Text style={st.infoVal}>{empresa?.rut || '—'}</Text>
          </View>
          <View style={st.infoCol}>
            <Text style={st.infoLbl}>Obra</Text>
            <Text style={st.infoVal}>{proyecto.nombre}</Text>
            <Text style={st.infoLbl}>Dirección</Text>
            <Text style={st.infoVal}>{proyecto.direccion || '—'}</Text>
          </View>
          <View style={st.infoCol}>
            <Text style={st.infoLbl}>Mandante</Text>
            <Text style={st.infoVal}>{proyecto.cliente || '—'}</Text>
            <Text style={st.infoLbl}>Estado de pago al</Text>
            <Text style={st.infoVal}>{fmtFecha(ep.fecha)}</Text>
          </View>
        </View>

        {/* TABLA — grupos de columnas */}
        <View style={st.tblHeadGroup}>
          <Text style={[st.groupCell, st.cN]}> </Text>
          <Text style={[st.groupCell, st.cDesc]}> </Text>
          <Text style={[st.groupCell, st.cUnid]}> </Text>
          <Text style={[st.groupCell, { width: '21%' }]}>Total Contrato</Text>
          <Text style={[st.groupCell, { width: '10.5%' }]}>Ejec. a la fecha</Text>
          <Text style={[st.groupCell, { width: '10.5%' }]}>Pago anterior</Text>
          <Text style={[st.groupCell, { width: '10.5%' }]}>Pago actual</Text>
        </View>
        <View style={st.tblHead}>
          <Text style={[st.th, st.cN]}>N°</Text>
          <Text style={[st.th, st.cDesc, { textAlign: 'left' }]}>Actividad</Text>
          <Text style={[st.th, st.cUnid]}>Un.</Text>
          <Text style={[st.th, st.cMoney]}>Total</Text>
          <Text style={[st.th, st.cMoney]}>%</Text>
          <Text style={[st.th, st.cMoney]}>Total</Text>
          <Text style={[st.th, st.cMoney]}>Total</Text>
          <Text style={[st.th, st.cMoney]}>Total</Text>
        </View>

        {filas.map((f, i) => (
          <View key={i} style={[st.row, ...(i % 2 ? [st.rowAlt] : [])]}>
            <Text style={[st.td, st.cN]}>{i + 1}</Text>
            <Text style={[st.td, st.cDesc, st.tdName]}>{f.desc}</Text>
            <Text style={[st.td, st.cUnid]}>{f.unidad}</Text>
            <Text style={[st.td, st.cMoney]}>{fmtCL(f.totalContrato)}</Text>
            <Text style={[st.td, st.cMoney]}>{pct(f.aAct)}</Text>
            <Text style={[st.td, st.cMoney]}>{fmtCL(f.ejecTotal)}</Text>
            <Text style={[st.td, st.cMoney]}>{fmtCL(f.pagoAnterior)}</Text>
            <Text style={[st.td, st.cMoney]}>{fmtCL(f.pagoActual)}</Text>
          </View>
        ))}

        {/* TOTAL FILA */}
        <View style={st.totalRow}>
          <Text style={[st.totalTxt, st.cN]}> </Text>
          <Text style={[st.totalTxt, st.cDesc, { textAlign: 'left' }]}>TOTALES</Text>
          <Text style={[st.totalTxt, st.cUnid]}> </Text>
          <Text style={[st.totalTxt, st.cMoney]}>{fmtCL(sumTotalContrato)}</Text>
          <Text style={[st.totalTxt, st.cMoney]}> </Text>
          <Text style={[st.totalTxt, st.cMoney]}>{fmtCL(sumEjec)}</Text>
          <Text style={[st.totalTxt, st.cMoney]}>{fmtCL(sumAnterior)}</Text>
          <Text style={[st.totalTxt, st.cMoney]}>{fmtCL(sumActual)}</Text>
        </View>

        {/* CASCADA DE DEDUCCIONES */}
        <View style={st.cascadaWrap}>
          <View style={st.cascada}>
            <View style={st.cascRow}><Text style={st.cascLbl}>Avance de obra del período</Text><Text style={st.cascVal}>{fmtCL(ep.avance_obra)}</Text></View>
            {ep.utilidad_monto > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Utilidad ({pct(ep.utilidad_pct)})</Text><Text style={st.cascVal}>{fmtCL(ep.utilidad_monto)}</Text></View>}
            {ep.gg_monto > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Gastos Generales ({pct(ep.gg_pct)})</Text><Text style={st.cascVal}>{fmtCL(ep.gg_monto)}</Text></View>}
            <View style={st.cascRow}><Text style={[st.cascLbl, { fontFamily: 'Helvetica-Bold' }]}>Valor EEPP (bruto)</Text><Text style={st.cascVal}>{fmtCL(ep.bruto)}</Text></View>
            {ep.descuentos > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Descuentos</Text><Text style={st.cascValNeg}>− {fmtCL(ep.descuentos)}</Text></View>}
            {ep.anticipo_desc > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Anticipo carátula ({pct(ep.anticipo_pct)})</Text><Text style={st.cascValNeg}>− {fmtCL(ep.anticipo_desc)}</Text></View>}
            {ep.multas > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Multas</Text><Text style={st.cascValNeg}>− {fmtCL(ep.multas)}</Text></View>}
            {ep.retencion_monto > 0 && <View style={st.cascRow}><Text style={st.cascLbl}>Retención ({pct(ep.retencion_pct)})</Text><Text style={st.cascValNeg}>− {fmtCL(ep.retencion_monto)}</Text></View>}
            <View style={st.cascRow}><Text style={[st.cascLbl, { fontFamily: 'Helvetica-Bold' }]}>Total neto</Text><Text style={st.cascVal}>{fmtCL(ep.monto_pagar)}</Text></View>
            <View style={st.cascRow}><Text style={st.cascLbl}>IVA (19%)</Text><Text style={st.cascVal}>{fmtCL(ep.iva)}</Text></View>
            <View style={st.cascTotal}><Text style={st.cascTotalLbl}>Líquido a pagar E.E.P.P.</Text><Text style={st.cascTotalVal}>{fmtCL(ep.total)}</Text></View>
          </View>
        </View>

        {/* FIRMAS */}
        <View style={st.firmas}>
          <View style={st.firmaCol}><View style={st.firmaLine} /><Text style={st.firmaTxt}>Administrador de Obra</Text></View>
          <View style={st.firmaCol}><View style={st.firmaLine} /><Text style={st.firmaTxt}>V°B° Contratista</Text></View>
          <View style={st.firmaCol}><View style={st.firmaLine} /><Text style={st.firmaTxt}>V°B° Control Presupuesto</Text></View>
        </View>

        {/* FOOTER */}
        <View style={st.footer} fixed>
          <Text style={st.footerTxt}>{razon} · Generado con Cubica Manager</Text>
          <Text style={st.footerTxt} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
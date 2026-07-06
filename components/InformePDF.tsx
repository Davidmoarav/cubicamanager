'use client'
// components/InformePDF.tsx
//
// PDF del Informe Ejecutivo — diseño Cubica (navy #0F2B53 / dorado #F5B800).
// KPIs financieros, retenciones y proyección de mano de obra en tablas.
// Sin sección de conclusiones redactadas.

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const NAVY = '#0F2B53'
const GOLD = '#F5B800'
const INK  = '#1a2535'
const MUTE = '#6b7a8d'
const LINE = '#d1d9e6'

const fmtCL = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const fmtFecha = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
}
const labelMes = (m: string) => {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[Number(mo) - 1] || mo} ${y}`
}

interface Props {
  data: any
  proximo?: any
  empresa?: any
  logoUrl?: string | null
}

const st = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: INK },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 12, marginBottom: 14 },
  logo: { maxWidth: 120, maxHeight: 54, objectFit: 'contain' },
  logoPh: { width: 120, height: 46, backgroundColor: NAVY, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  logoPhTxt: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 1 },
  headerRight: { alignItems: 'flex-end' },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: NAVY, letterSpacing: 1 },
  titleBar: { width: 44, height: 3, backgroundColor: GOLD, marginTop: 3, marginBottom: 6, alignSelf: 'flex-end' },
  meta: { fontSize: 8, color: MUTE, marginTop: 1 },

  obra: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 },
  obraSub: { fontSize: 8, color: MUTE, marginBottom: 12 },

  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },

  // KPI cards
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpi: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  kpiLbl: { fontSize: 7, color: MUTE, marginBottom: 3 },
  kpiVal: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK },
  kpiSub: { fontSize: 7, color: MUTE, marginTop: 2 },

  // próximo EP
  proxBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f4f7fb', borderRadius: 4, padding: 10, marginTop: 8 },
  proxLbl: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  proxSub: { fontSize: 7.5, color: MUTE, marginTop: 1 },
  proxVal: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: INK },

  // tablas
  tHead: { flexDirection: 'row', backgroundColor: NAVY, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  th: { color: '#fff', fontSize: 7.5, fontFamily: 'Helvetica-Bold', paddingVertical: 4, paddingHorizontal: 5 },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  tRowAlt: { backgroundColor: '#f9fbfd' },
  td: { fontSize: 8, paddingVertical: 3, paddingHorizontal: 5 },
  tFoot: { flexDirection: 'row', backgroundColor: '#e8eef6', borderTopWidth: 1, borderTopColor: NAVY },
  tf: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, paddingVertical: 4, paddingHorizontal: 5 },

  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row',
    justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
  footerTxt: { fontSize: 6.5, color: MUTE },
})

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={st.kpi}>
      <Text style={st.kpiLbl}>{label}</Text>
      <Text style={st.kpiVal}>{value}</Text>
      {sub ? <Text style={st.kpiSub}>{sub}</Text> : null}
    </View>
  )
}

export function InformePDF({ data, proximo, empresa, logoUrl }: Props) {
  const k = data.kpis
  const proy = data.proyecto || {}
  const razon = empresa?.razon_social || 'Casa del EIFS SpA'
  const eps = (data.estados_pago || []).filter((e: any) => ['presentado', 'aprobado', 'pagado'].includes(e.estado))
  const pmo = data.proyeccion_mo || []

  return (
    <Document>
      <Page size="A4" style={st.page}>
        {/* HEADER */}
        <View style={st.header}>
          {logoUrl
            ? <Image src={logoUrl} style={st.logo} />
            : <View style={st.logoPh}><Text style={st.logoPhTxt}>CUBICA</Text></View>}
          <View style={st.headerRight}>
            <Text style={st.title}>INFORME EJECUTIVO</Text>
            <View style={st.titleBar} />
            <Text style={st.meta}>Fecha de corte: {fmtFecha()}</Text>
            <Text style={st.meta}>{razon}</Text>
          </View>
        </View>

        <Text style={st.obra}>{proy.nombre || 'Proyecto'}</Text>
        <Text style={st.obraSub}>{proy.cliente ? `Mandante: ${proy.cliente}` : ''}{proy.direccion ? ` · ${proy.direccion}` : ''}</Text>

        {/* FINANCIERO */}
        <Text style={st.sectionTitle}>Avance financiero</Text>
        <View style={st.kpiRow}>
          <KPI label="Cobrado" value={`${k.cobrado_pct}%`} sub={fmtCL(k.total_cobrado)} />
          <KPI label="Facturado acumulado" value={`${k.avance_financiero_pct}%`} sub={fmtCL(k.total_facturado)} />
          <KPI label="Saldo por facturar" value={fmtCL(k.saldo_por_facturar)} sub="del contrato" />
          <KPI label="Valor contrato (neto)" value={fmtCL(k.valor_contrato)} sub={`${k.n_estados} estados de pago`} />
        </View>

        {proximo && (
          <View style={st.proxBox}>
            <View>
              <Text style={st.proxLbl}>Próximo estado de pago (sugerido) — EP N°{proximo.numero}</Text>
              <Text style={st.proxSub}>Según avance actual de obra</Text>
            </View>
            <Text style={st.proxVal}>{fmtCL(proximo.total)}</Text>
          </View>
        )}

        {/* RETENCIONES */}
        <Text style={st.sectionTitle}>Retenciones y anticipos</Text>
        <View style={st.kpiRow}>
          <KPI label="Retención acumulada" value={fmtCL(k.retencion_acumulada)} />
          <KPI label="Retención por liberar" value={fmtCL(k.retencion_saldo)} sub={`devuelto ${fmtCL(k.retencion_devuelta)}`} />
          <KPI label="Anticipo amortizado" value={fmtCL(k.anticipo_amortizado)} />
          <KPI label="Saldo anticipo" value={fmtCL(k.anticipo_saldo)} sub={`devuelto ${fmtCL(k.anticipo_devuelto)}`} />
        </View>

        {/* MANO DE OBRA */}
        <Text style={st.sectionTitle}>Mano de obra</Text>
        <View style={st.kpiRow}>
          <KPI label="Dotación actual" value={String(k.dotacion_actual)} sub="trabajadores" />
          <KPI label="Costo M.O mensual" value={fmtCL(k.costo_mo_mensual)} sub="incl. imposiciones" />
          <KPI label="Gasto M.O pendiente" value={fmtCL(k.gasto_mo_pendiente)} sub="hasta cierre" />
          <KPI label="Costo M.O total" value={fmtCL(k.costo_mo_total)} sub="proyectado" />
        </View>

        {/* TABLA ESTADOS DE PAGO */}
        {eps.length > 0 && (
          <>
            <Text style={st.sectionTitle}>Estados de pago</Text>
            <View style={st.tHead}>
              <Text style={[st.th, { width: '10%' }]}>N°</Text>
              <Text style={[st.th, { width: '20%' }]}>Período</Text>
              <Text style={[st.th, { width: '18%', textAlign: 'right' }]}>Bruto</Text>
              <Text style={[st.th, { width: '18%', textAlign: 'right' }]}>Retención</Text>
              <Text style={[st.th, { width: '17%', textAlign: 'right' }]}>Líquido</Text>
              <Text style={[st.th, { width: '17%', textAlign: 'right' }]}>Estado</Text>
            </View>
            {eps.map((e: any, i: number) => (
              <View key={i} style={[st.tRow, ...(i % 2 ? [st.tRowAlt] : [])]}>
                <Text style={[st.td, { width: '10%' }]}>{e.numero}</Text>
                <Text style={[st.td, { width: '20%' }]}>{e.periodo || '—'}</Text>
                <Text style={[st.td, { width: '18%', textAlign: 'right' }]}>{fmtCL(e.bruto)}</Text>
                <Text style={[st.td, { width: '18%', textAlign: 'right' }]}>{fmtCL(e.retencion_monto)}</Text>
                <Text style={[st.td, { width: '17%', textAlign: 'right' }]}>{fmtCL(e.total)}</Text>
                <Text style={[st.td, { width: '17%', textAlign: 'right', textTransform: 'capitalize' }]}>{e.estado}</Text>
              </View>
            ))}
          </>
        )}

        {/* TABLA PROYECCIÓN MO */}
        {pmo.length > 0 && (
          <>
            <Text style={st.sectionTitle}>Proyección de mano de obra</Text>
            <View style={st.tHead}>
              <Text style={[st.th, { width: '22%' }]}>Mes</Text>
              <Text style={[st.th, { width: '18%', textAlign: 'right' }]}>Dotación</Text>
              <Text style={[st.th, { width: '30%', textAlign: 'right' }]}>Costo M.O</Text>
              <Text style={[st.th, { width: '30%', textAlign: 'right' }]}>Finiquito</Text>
            </View>
            {pmo.map((r: any, i: number) => (
              <View key={i} style={[st.tRow, ...(i % 2 ? [st.tRowAlt] : [])]}>
                <Text style={[st.td, { width: '22%' }]}>{labelMes(r.mes)}</Text>
                <Text style={[st.td, { width: '18%', textAlign: 'right' }]}>{r.dotacion}</Text>
                <Text style={[st.td, { width: '30%', textAlign: 'right' }]}>{fmtCL((r.dotacion || 0) * (r.costo_unitario || 0))}</Text>
                <Text style={[st.td, { width: '30%', textAlign: 'right' }]}>{fmtCL(r.finiquito)}</Text>
              </View>
            ))}
            <View style={st.tFoot}>
              <Text style={[st.tf, { width: '22%' }]}>TOTAL</Text>
              <Text style={[st.tf, { width: '18%' }]}></Text>
              <Text style={[st.tf, { width: '30%', textAlign: 'right' }]}>{fmtCL(k.costo_mo_total)}</Text>
              <Text style={[st.tf, { width: '30%', textAlign: 'right' }]}> </Text>
            </View>
          </>
        )}

        {/* FOOTER */}
        <View style={st.footer} fixed>
          <Text style={st.footerTxt}>{razon} · Generado con Cubica Manager</Text>
          <Text style={st.footerTxt} render={({ pageNumber, totalPages }: any) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
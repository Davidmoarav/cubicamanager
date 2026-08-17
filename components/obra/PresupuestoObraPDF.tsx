'use client'
// components/obra/PresupuestoObraPDF.tsx — Plantilla PDF del presupuesto
// del workspace Obra, estilo ObraMaestra: acento coral, tabla con grupos.

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { Proyecto } from '@/types'
import type { Cliente } from '@/types/cliente'
import type { EmpresaConfig } from '@/types/empresa'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import { fmtCL, fechaLarga, IVA_PCT } from '../pdf-comunes'

const CORAL = '#E5502A'
const CORAL_BG = '#FCEAE3'
const INK = '#131C2B'
const MUTE = '#6b7a8d'
const LINE = '#e4e9f0'

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: INK },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: CORAL,
  },
  logo: { maxWidth: 130, maxHeight: 60, objectFit: 'contain' },
  logoFallback: { fontSize: 16, color: CORAL },
  hRight: { alignItems: 'flex-end' },
  hTag: { fontSize: 8, color: MUTE, letterSpacing: 1 },
  hNum: { fontSize: 12, color: INK },
  titulo: { fontSize: 15, marginBottom: 2, color: INK, fontFamily: 'Helvetica-Bold' },
  fecha: { fontSize: 9, color: MUTE, marginBottom: 14 },
  trio: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  bloque: { flex: 1, padding: 9, backgroundColor: '#f8f9fb', borderRadius: 4 },
  bTitulo: { fontSize: 7.5, color: MUTE, letterSpacing: 0.8, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  bLinea: { fontSize: 8.5, marginBottom: 2 },
  bVacio: { fontSize: 8.5, color: '#a0aab8' },
  th: { flexDirection: 'row', backgroundColor: INK, color: '#ffffff', paddingVertical: 5, paddingHorizontal: 6 },
  celda: { paddingVertical: 4, paddingHorizontal: 6 },
  cDesc: { flex: 5 }, cCant: { flex: 1, textAlign: 'right' },
  cUn: { flex: 0.9, textAlign: 'center' }, cPu: { flex: 1.5, textAlign: 'right' },
  cSub: { flex: 1.7, textAlign: 'right' },
  filaGrupo: {
    flexDirection: 'row', backgroundColor: CORAL_BG,
    borderLeftWidth: 3, borderLeftColor: CORAL, marginTop: 3,
  },
  grupoTexto: { color: '#C24019', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  totales: { marginTop: 14, alignItems: 'flex-end' },
  tBox: { width: 210 },
  tFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  tLabel: { fontSize: 9, color: MUTE },
  tValor: { fontSize: 9 },
  tTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 8, marginTop: 3,
    backgroundColor: CORAL, borderRadius: 4,
  },
  tTotalTexto: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  pie: {
    position: 'absolute', bottom: 24, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6,
  },
  pieTexto: { fontSize: 7.5, color: MUTE },
})

export function PresupuestoObraPDF({ proyecto, empresa, cliente, partidas, logoUrl }: {
  proyecto: Proyecto
  empresa?: EmpresaConfig | null
  cliente?: Cliente | null
  partidas: PartidaProyecto[]
  logoUrl?: string | null
}) {
  const hijosDe = (id: string) =>
    partidas.filter(p => p.parent_id === id).sort((a, b) => a.orden - b.orden)
  const valorNodo = (n: PartidaProyecto): number => {
    const h = hijosDe(n.id)
    if (h.length === 0) return Math.round((Number(n.cantidad) || 0) * (Number(n.precio_unitario) || 0))
    return h.reduce((acc, c) => acc + valorNodo(c), 0)
  }
  const raices = partidas.filter(p => !p.parent_id).sort((a, b) => a.orden - b.orden)
  const neto = raices.reduce((acc, r) => acc + valorNodo(r), 0)
  const iva = Math.round(neto * IVA_PCT)

  const filas: React.ReactElement[] = []
  const emitir = (nodo: PartidaProyecto, nivel: number) => {
    const h = hijosDe(nodo.id)
    if (h.length > 0 || nodo.es_grupo) {
      filas.push(
        <View key={nodo.id} style={s.filaGrupo} wrap={false}>
          <Text style={[s.celda, s.cDesc, s.grupoTexto, { paddingLeft: 6 + nivel * 10 }]}>
            {nodo.descripcion.toUpperCase()}
          </Text>
          <Text style={[s.celda, s.cCant]} />
          <Text style={[s.celda, s.cUn]} />
          <Text style={[s.celda, s.cPu]} />
          <Text style={[s.celda, s.cSub, s.grupoTexto]}>{fmtCL(valorNodo(nodo))}</Text>
        </View>
      )
      h.forEach(c => emitir(c, nivel + 1))
    } else {
      filas.push(
        <View key={nodo.id} style={s.fila} wrap={false}>
          <Text style={[s.celda, s.cDesc, { paddingLeft: 6 + nivel * 10 }]}>{nodo.descripcion}</Text>
          <Text style={[s.celda, s.cCant]}>{Number(nodo.cantidad) || 0}</Text>
          <Text style={[s.celda, s.cUn]}>{nodo.unidad}</Text>
          <Text style={[s.celda, s.cPu]}>{fmtCL(Number(nodo.precio_unitario) || 0)}</Text>
          <Text style={[s.celda, s.cSub]}>{fmtCL(valorNodo(nodo))}</Text>
        </View>
      )
    }
  }
  raices.forEach(r => emitir(r, 0))

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          {logoUrl
            ? <Image src={logoUrl} style={s.logo} />
            : <Text style={s.logoFallback}>{empresa?.razon_social ?? 'Mi Empresa'}</Text>}
          <View style={s.hRight}>
            <Text style={s.hTag}>PRESUPUESTO</Text>
            <Text style={s.hNum}>N° {proyecto.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={s.fecha}>{fechaLarga(new Date().toISOString())}</Text>
          </View>
        </View>

        <Text style={s.titulo}>Presupuesto {proyecto.nombre}</Text>
        <Text style={s.fecha}>{proyecto.descripcion ?? ''}</Text>

        {/* Trío empresa / cliente / ubicación */}
        <View style={s.trio}>
          <View style={s.bloque}>
            <Text style={s.bTitulo}>MI EMPRESA</Text>
            {empresa?.razon_social ? <Text style={s.bLinea}>{empresa.razon_social}</Text> : <Text style={s.bVacio}>Sin configurar</Text>}
            {empresa?.rut ? <Text style={s.bLinea}>RUT: {empresa.rut}</Text> : null}
            {empresa?.telefono ? <Text style={s.bLinea}>{empresa.telefono}</Text> : null}
            {empresa?.email ? <Text style={s.bLinea}>{empresa.email}</Text> : null}
          </View>
          <View style={s.bloque}>
            <Text style={s.bTitulo}>CLIENTE</Text>
            {cliente ? (
              <>
                <Text style={s.bLinea}>{cliente.razon_social}</Text>
                {cliente.rut ? <Text style={s.bLinea}>RUT: {cliente.rut}</Text> : null}
                {cliente.email ? <Text style={s.bLinea}>{cliente.email}</Text> : null}
                {cliente.telefono ? <Text style={s.bLinea}>{cliente.telefono}</Text> : null}
              </>
            ) : <Text style={s.bVacio}>Sin datos del cliente</Text>}
          </View>
          <View style={s.bloque}>
            <Text style={s.bTitulo}>UBICACIÓN DEL PROYECTO</Text>
            {cliente?.direccion ? <Text style={s.bLinea}>{cliente.direccion}</Text> : <Text style={s.bVacio}>Dirección pendiente</Text>}
            {(cliente?.comuna || cliente?.ciudad)
              ? <Text style={s.bLinea}>{[cliente?.comuna, cliente?.ciudad].filter(Boolean).join(' / ')}</Text>
              : null}
          </View>
        </View>

        {/* Tabla */}
        <View style={s.th}>
          <Text style={[s.celda, s.cDesc]}>Descripción</Text>
          <Text style={[s.celda, s.cCant]}>Cant.</Text>
          <Text style={[s.celda, s.cUn]}>Un.</Text>
          <Text style={[s.celda, s.cPu]}>P. Unit.</Text>
          <Text style={[s.celda, s.cSub]}>Subtotal</Text>
        </View>
        {filas}

        {/* Totales */}
        <View style={s.totales}>
          <View style={s.tBox}>
            <View style={s.tFila}>
              <Text style={s.tLabel}>Neto</Text>
              <Text style={s.tValor}>{fmtCL(neto)}</Text>
            </View>
            <View style={s.tFila}>
              <Text style={s.tLabel}>IVA 19%</Text>
              <Text style={s.tValor}>{fmtCL(iva)}</Text>
            </View>
            <View style={s.tTotal}>
              <Text style={s.tTotalTexto}>TOTAL</Text>
              <Text style={s.tTotalTexto}>{fmtCL(neto + iva)}</Text>
            </View>
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>{empresa?.razon_social ?? ''}</Text>
          <Text style={s.pieTexto}>Generado con CubicaManager · Copiloto de Obra</Text>
        </View>
      </Page>
    </Document>
  )
}

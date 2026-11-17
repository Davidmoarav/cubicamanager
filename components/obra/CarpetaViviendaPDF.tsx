'use client'
// components/obra/CarpetaViviendaPDF.tsx
// Carpeta de una vivienda para entregar a SERVIU o a la entidad patrocinante:
// ficha del beneficiario, avance por partida y fotos agrupadas en antes / durante / después.

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { PDF_INK, PDF_LINE, PDF_MUTE, PDF_NAVY, fechaCorta, fmtCL } from '../pdf-comunes'

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: PDF_INK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, marginBottom: 12, borderBottomWidth: 2, borderBottomColor: PDF_NAVY },
  logo: { maxWidth: 120, maxHeight: 50, objectFit: 'contain' },
  empresa: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PDF_NAVY },
  tag: { fontSize: 7.5, color: PDF_MUTE, letterSpacing: 1, textAlign: 'right' },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub: { fontSize: 9, color: PDF_MUTE, marginBottom: 12 },
  ficha: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f6f8fb', borderRadius: 4, padding: 8, marginBottom: 12 },
  dato: { width: '50%', marginBottom: 4 },
  etq: { fontSize: 7, color: PDF_MUTE, letterSpacing: 0.6 },
  val: { fontSize: 9 },
  seccion: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: PDF_NAVY, marginTop: 6, marginBottom: 6 },
  th: { flexDirection: 'row', backgroundColor: PDF_NAVY, color: '#fff', paddingVertical: 4, paddingHorizontal: 5 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PDF_LINE, paddingVertical: 3, paddingHorizontal: 5 },
  cDesc: { flex: 5 }, cNum: { flex: 1.2, textAlign: 'right' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foto: { width: 166, marginBottom: 6 },
  img: { width: 166, height: 125, objectFit: 'cover', borderRadius: 3 },
  pieFoto: { fontSize: 7, color: PDF_MUTE, marginTop: 2 },
  otros: { fontSize: 8.5, marginBottom: 2 },
  pie: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: PDF_MUTE },
})

const ETAPAS = [
  { id: 'antes', label: 'Antes' },
  { id: 'durante', label: 'Durante' },
  { id: 'despues', label: 'Después' },
  { id: '', label: 'Sin etapa' },
]
const ESTADO: Record<string, string> = { pendiente: 'Pendiente', en_ejecucion: 'En ejecución', terminada: 'Terminada', recepcionada: 'Recepcionada' }

export interface DocCarpeta { nombre: string; etapa?: string | null; tomada_en?: string | null; created_at?: string; imagen?: string | null }

export function CarpetaViviendaPDF({ proyecto, vivienda, partidas, docs, empresa, logoUrl }: {
  proyecto: any
  vivienda: any
  partidas: { descripcion: string; unidad?: string | null; cantidad?: number; avance: number }[]
  docs: DocCarpeta[]
  empresa?: any
  logoUrl?: string | null
}) {
  const fotos = docs.filter(d => d.imagen)
  const otros = docs.filter(d => !d.imagen)
  const fecha = (d: DocCarpeta) => fechaCorta(String(d.tomada_en || d.created_at || '').slice(0, 10))
  const dato = (etq: string, val?: any) => (
    <View style={s.dato}><Text style={s.etq}>{etq.toUpperCase()}</Text><Text style={s.val}>{val == null || val === '' ? '—' : String(val)}</Text></View>
  )

  return (
    <Document title={`Carpeta ${vivienda.beneficiario}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : <Text style={s.empresa}>{empresa?.nombre || empresa?.razon_social || ''}</Text>}
          <View>
            <Text style={s.tag}>CARPETA DE VIVIENDA</Text>
            <Text style={s.tag}>{[proyecto.programa, proyecto.codigo_grupo && `Grupo ${proyecto.codigo_grupo}`].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>

        <Text style={s.titulo}>{vivienda.beneficiario}</Text>
        <Text style={s.sub}>{proyecto.nombre}{proyecto.comuna ? ` · ${proyecto.comuna}` : ''}</Text>

        <View style={s.ficha}>
          {dato('RUT', vivienda.rut)}
          {dato('Dirección', vivienda.direccion)}
          {dato('Rol de avalúo', vivienda.rol_avaluo)}
          {dato('Teléfono', vivienda.telefono)}
          {dato('Subsidio', vivienda.subsidio_uf != null ? `${Number(vivienda.subsidio_uf).toLocaleString('es-CL')} UF` : null)}
          {dato('Ahorro', vivienda.ahorro_uf != null ? `${Number(vivienda.ahorro_uf).toLocaleString('es-CL')} UF` : null)}
          {dato('Estado', ESTADO[vivienda.estado] ?? vivienda.estado)}
          {dato('Avance', `${vivienda.avance ?? 0}%`)}
          {dato('Inicio / término', [fechaCorta(vivienda.fecha_inicio), fechaCorta(vivienda.fecha_termino)].join(' / '))}
          {dato('Recepción', fechaCorta(vivienda.fecha_recepcion))}
          {dato('Entidad patrocinante', proyecto.entidad_patrocinante)}
          {dato('Valor de obra (neto)', vivienda.valor ? fmtCL(vivienda.valor) : null)}
        </View>

        <Text style={s.seccion}>Partidas y avance</Text>
        <View style={s.th}><Text style={s.cDesc}>Partida</Text><Text style={s.cNum}>Cantidad</Text><Text style={s.cNum}>Avance</Text></View>
        {partidas.map((p, i) => (
          <View key={i} style={s.fila} wrap={false}>
            <Text style={s.cDesc}>{p.descripcion}</Text>
            <Text style={s.cNum}>{p.cantidad != null ? `${Number(p.cantidad).toLocaleString('es-CL')} ${p.unidad || ''}` : ''}</Text>
            <Text style={s.cNum}>{Math.round(Number(p.avance) || 0)}%</Text>
          </View>
        ))}

        {ETAPAS.map(e => {
          const lista = fotos.filter(d => (d.etapa || '') === e.id)
          if (lista.length === 0) return null
          return (
            <View key={e.id || 'sin'}>
              <Text style={s.seccion} minPresenceAhead={140}>Fotos · {e.label} ({lista.length})</Text>
              <View style={s.fotos}>
                {lista.map((d, i) => (
                  <View key={i} style={s.foto} wrap={false}>
                    <Image src={d.imagen!} style={s.img} />
                    <Text style={s.pieFoto}>{fecha(d)} · {d.nombre}</Text>
                  </View>
                ))}
              </View>
            </View>
          )
        })}

        {otros.length > 0 && (
          <View>
            <Text style={s.seccion}>Otros respaldos ({otros.length})</Text>
            {otros.map((d, i) => <Text key={i} style={s.otros}>• {d.nombre} · {fecha(d)}</Text>)}
          </View>
        )}

        <View style={s.pie} fixed>
          <Text>Generado el {new Date().toLocaleDateString('es-CL')}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

'use client'
// components/obra/GanttPDF.tsx — Carta Gantt en PDF (Fase 4): stats + barras.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Proyecto } from '@/types'
import type { GanttCalc } from '@/lib/gantt'
import { fechaCortaCL } from '@/lib/gantt'

const CORAL = '#E5502A'
const INK = '#131C2B'
const MUTE = '#6b7a8d'
const LINE = '#e4e9f0'

const COLOR_ESTADO: Record<string, string> = {
  completa: '#1a7a4a',
  encurso: CORAL,
  atrasada: '#b0401a',
  pendiente: '#d1d9e6',
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: INK },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub: { fontSize: 9, color: MUTE, marginBottom: 16 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  stat: { flex: 1, padding: 9, backgroundColor: '#f8f9fb', borderRadius: 4 },
  statLabel: { fontSize: 7, color: MUTE, letterSpacing: 0.8, marginBottom: 3, fontFamily: 'Helvetica-Bold' },
  statValor: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  statSub: { fontSize: 8, color: MUTE, marginTop: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  nombreCol: { width: 150, paddingRight: 8 },
  nombre: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  fechas: { fontSize: 7.5, color: MUTE },
  track: { flex: 1, height: 14, backgroundColor: '#f4f5f7', borderRadius: 3, position: 'relative' },
  barra: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, justifyContent: 'center', paddingLeft: 4 },
  barraTexto: { fontSize: 7, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  hoy: { position: 'absolute', top: -3, bottom: -3, width: 1.5, backgroundColor: CORAL },
  leyenda: { flexDirection: 'row', gap: 14, marginTop: 16 },
  leyItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyPunto: { width: 8, height: 8, borderRadius: 2 },
  leyTexto: { fontSize: 8, color: MUTE },
  pie: {
    position: 'absolute', bottom: 24, left: 40, right: 40,
    borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  pieTexto: { fontSize: 7.5, color: MUTE },
})

export function GanttPDF({ proyecto, calc }: { proyecto: Proyecto; calc: GanttCalc }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.titulo}>Carta Gantt · {proyecto.nombre}</Text>
        <Text style={s.sub}>
          {calc.desde ? `${fechaCortaCL(calc.desde)} → ${fechaCortaCL(calc.hasta)} · ${calc.totalDias} días` : 'Sin planificación'}
        </Text>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statLabel}>AVANCE GLOBAL</Text>
            <Text style={s.statValor}>{calc.avanceGlobal}%</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>FASE ACTUAL</Text>
            <Text style={s.statValor}>{calc.faseActual?.nombre ?? '—'}</Text>
            {calc.faseActual ? <Text style={s.statSub}>{calc.faseActual.avance}%</Text> : null}
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>DÍAS RESTANTES</Text>
            <Text style={s.statValor}>{calc.diasRestantes !== null ? `${calc.diasRestantes} días` : '—'}</Text>
            {calc.fechaEntrega ? <Text style={s.statSub}>entrega {fechaCortaCL(calc.fechaEntrega)}</Text> : null}
          </View>
        </View>

        {calc.etapas.map(e => (
          <View key={e.id} style={s.fila} wrap={false}>
            <View style={s.nombreCol}>
              <Text style={s.nombre}>{e.nombre}</Text>
              <Text style={s.fechas}>
                {e.fecha_inicio ? `${fechaCortaCL(e.fecha_inicio)} – ${fechaCortaCL(e.fecha_fin)}` : 'Sin fechas'}
                {e.responsable ? ` · ${e.responsable}` : ''}
              </Text>
            </View>
            <View style={s.track}>
              {calc.hoyPct !== null && <View style={[s.hoy, { left: `${calc.hoyPct}%` }]} />}
              {e.anchoPct > 0 && (
                <View style={[s.barra, {
                  left: `${e.iniPct}%`,
                  width: `${e.anchoPct}%`,
                  backgroundColor: COLOR_ESTADO[e.estado],
                }]}>
                  <Text style={s.barraTexto}>{Math.round(e.avance)}%</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        <View style={s.leyenda}>
          {Object.entries({ completa: 'Completa', encurso: 'En curso', atrasada: 'Atrasada', pendiente: 'Pendiente' }).map(([k, v]) => (
            <View key={k} style={s.leyItem}>
              <View style={[s.leyPunto, { backgroundColor: COLOR_ESTADO[k] }]} />
              <Text style={s.leyTexto}>{v}</Text>
            </View>
          ))}
          <View style={s.leyItem}>
            <View style={[s.leyPunto, { backgroundColor: CORAL, width: 2, height: 10 }]} />
            <Text style={s.leyTexto}>Hoy</Text>
          </View>
        </View>

        <View style={s.pie} fixed>
          <Text style={s.pieTexto}>{proyecto.nombre}</Text>
          <Text style={s.pieTexto}>Generado con CubicaManager · Copiloto de Obra</Text>
        </View>
      </Page>
    </Document>
  )
}

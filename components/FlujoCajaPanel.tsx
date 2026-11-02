'use client'
// components/FlujoCajaPanel.tsx
//
// Flujo de caja mensual de la obra: entradas y salidas en barras, saldo acumulado en
// línea, sobre un mismo eje en pesos. Lo proyectado va más claro y con línea punteada.

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { MetricCard, fmt, fmtM } from '@/components/ui'

interface Props {
  proyectoId: string
}

// Validada con la prueba de daltonismo: azul/coral separan bien entradas de salidas
const COLOR_ENTRADAS = '#2F6FB0'
const COLOR_SALIDAS = '#E5502A'
const COLOR_SALDO = '#1a2535'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaMes = (mes: string, conAnio = true) => {
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m}${conAnio ? ` ${y.slice(2)}` : ''}`
}

// Línea de división "redonda" (1, 2 o 5 × 10ⁿ)
function pasoEje(rango: number, divisiones = 4) {
  if (rango <= 0) return 1
  const bruto = rango / divisiones
  const base = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / base
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base
}

// Barra con la punta redondeada y la base recta, sobre la línea de referencia
function barra(x: number, y: number, ancho: number, base: number) {
  const alto = base - y
  if (alto <= 0) return ''
  const r = Math.min(4, alto, ancho / 2)
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${base}Z`
}

function Grafico({ filas }: { filas: any[] }) {
  const [activo, setActivo] = useState<number | null>(null)

  const W = 760, H = 300
  const m = { top: 16, right: 12, bottom: 28, left: 58 }
  const anchoPlot = W - m.left - m.right
  const altoPlot = H - m.top - m.bottom

  const valores = filas.flatMap(f => [f.entradas, f.salidas, f.saldo])
  const paso = pasoEje(Math.max(...valores, 0) - Math.min(...valores, 0))
  const yMax = Math.ceil(Math.max(...valores, 0) / paso) * paso || paso
  const yMin = Math.floor(Math.min(...valores, 0) / paso) * paso
  const y = (v: number) => m.top + (1 - (v - yMin) / (yMax - yMin)) * altoPlot
  const banda = anchoPlot / filas.length
  const cx = (i: number) => m.left + banda * (i + 0.5)
  const anchoBarra = Math.min(22, Math.max(4, banda * 0.32))
  const ticks: number[] = []
  for (let v = yMin; v <= yMax + paso / 2; v += paso) ticks.push(v)
  const saltoEtiqueta = Math.ceil(filas.length / 12)
  const primeroProyectado = filas.findIndex(f => f.proyectado)

  const puntos = filas.map((f, i) => `${cx(i)},${y(f.saldo)}`)
  const finReal = primeroProyectado === -1 ? filas.length : primeroProyectado
  const tramoReal = puntos.slice(0, finReal).join(' ')
  const tramoProyectado = primeroProyectado === -1 ? '' : puntos.slice(Math.max(0, finReal - 1)).join(' ')

  const f = activo !== null ? filas[activo] : null

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img"
          aria-label="Entradas, salidas y saldo acumulado de la obra, mes a mes. El detalle está en la tabla." onMouseLeave={() => setActivo(null)}>
          {ticks.map(v => (
            <g key={v}>
              <line x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#6b7a8d' : '#e4e9f0'} strokeWidth={1} />
              <text x={m.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize={11} fill="#6b7a8d">{fmtM(v)}</text>
            </g>
          ))}

          {primeroProyectado > 0 && (
            <g>
              <line x1={m.left + banda * primeroProyectado} x2={m.left + banda * primeroProyectado} y1={m.top} y2={H - m.bottom}
                stroke="#6b7a8d" strokeWidth={1} strokeDasharray="2 3" />
              <text x={m.left + banda * primeroProyectado + 6} y={m.top + 9} fontSize={11} fill="#6b7a8d">Proyección</text>
            </g>
          )}

          {filas.map((fila, i) => (
            <g key={fila.mes} opacity={fila.proyectado ? 0.45 : 1}>
              <path d={barra(cx(i) - anchoBarra - 1, y(fila.entradas), anchoBarra, y(0))} fill={COLOR_ENTRADAS} />
              <path d={barra(cx(i) + 1, y(fila.salidas), anchoBarra, y(0))} fill={COLOR_SALIDAS} />
            </g>
          ))}

          {tramoReal && <polyline points={tramoReal} fill="none" stroke={COLOR_SALDO} strokeWidth={2} strokeLinejoin="round" />}
          {tramoProyectado && <polyline points={tramoProyectado} fill="none" stroke={COLOR_SALDO} strokeWidth={2} strokeDasharray="5 4" />}
          {filas.map((fila, i) => (
            <circle key={fila.mes} cx={cx(i)} cy={y(fila.saldo)} r={activo === i ? 5 : 4}
              fill={fila.proyectado ? '#fff' : COLOR_SALDO} stroke={fila.proyectado ? COLOR_SALDO : '#fff'} strokeWidth={2} />
          ))}

          {filas.map((fila, i) => i % saltoEtiqueta === 0 && (
            <text key={fila.mes} x={cx(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#6b7a8d">{etiquetaMes(fila.mes)}</text>
          ))}

          {/* Zonas de hover, más anchas que las marcas */}
          {filas.map((fila, i) => (
            <rect key={fila.mes} x={m.left + banda * i} y={m.top} width={banda} height={altoPlot} fill="transparent"
              onMouseEnter={() => setActivo(i)} onClick={() => setActivo(i)} />
          ))}
        </svg>
      </div>

      {f && activo !== null && (
        <div className="absolute top-2 z-10 pointer-events-none bg-white border border-line rounded-lg shadow-pop px-3 py-2 text-[11.5px] min-w-[170px]"
          style={activo < filas.length / 2 ? { right: 12 } : { left: 70 }}>
          <div className="font-bold text-ink mb-1">{etiquetaMes(f.mes)}{f.proyectado ? ' · proyección' : ''}</div>
          {[
            ['Entradas', f.entradas, COLOR_ENTRADAS],
            ['Salidas', f.salidas, COLOR_SALIDAS],
            ['Saldo acumulado', f.saldo, COLOR_SALDO],
          ].map(([k, v, c]) => (
            <div key={k as string} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-sm" style={{ background: c as string }} />{k}
              </span>
              <span className="font-semibold text-ink tabular-nums">{fmt(v as number)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_ENTRADAS }} />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_SALIDAS }} />Salidas</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ background: COLOR_SALDO }} />Saldo acumulado</span>
        <span>Más claro y punteado: proyección</span>
      </div>
    </div>
  )
}

export default function FlujoCajaPanel({ proyectoId }: Props) {
  const { data, error, isLoading } = useSWR<any>(`/api/flujo-caja?proyecto_id=${proyectoId}`, fetcher)

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted text-[13px]">Calculando flujo de caja…</div>
  if (error || data?.error) {
    return <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">No se pudo calcular el flujo de caja{data?.error ? `: ${data.error}` : '.'}</div>
  }

  const filas: any[] = data?.filas ?? []
  const r = data?.resumen

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-[14px] font-bold text-ink">Flujo de caja de la obra</h4>
        <p className="text-[12px] text-muted mt-0.5 max-w-[620px]">
          Montos netos, sin IVA. Los gastos cuentan cuando se registran, no cuando se pagan, así que la caja real
          puede ir desfasada. La proyección reparte lo pendiente en partes iguales hasta el término de la obra.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="bg-canvas border border-dashed border-line2 rounded-lg p-6 text-center text-[12px] text-muted">
          Sin movimientos todavía. Aparecerán al registrar gastos o estados de pago.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <MetricCard label="Saldo a hoy" value={fmt(r.saldo_actual)} sub={`Entró ${fmtM(r.entradas_reales)} · salió ${fmtM(r.salidas_reales)}`} />
            <MetricCard label="Por entrar" value={fmt(r.entradas_proyectadas)} sub="Hasta el término" />
            <MetricCard label="Por salir" value={fmt(r.salidas_proyectadas)} sub="Hasta el término" />
            <MetricCard label="Peor saldo" value={fmt(r.saldo_minimo)}
              sub={r.saldo_minimo < 0 ? `Financiar en ${etiquetaMes(r.mes_saldo_minimo)}` : `En ${etiquetaMes(r.mes_saldo_minimo)}`}
              subColor={r.saldo_minimo < 0 ? '#b0401a' : undefined} />
          </div>

          {r.sin_horizonte && (
            <div className="mb-4 text-[12px] font-semibold text-warning bg-warning-bg rounded-lg px-3 py-2">
              Hay montos pendientes, pero la obra no tiene una fecha de término futura: agrégala para ver la proyección.
            </div>
          )}

          <Grafico filas={filas} />

          <details className="mt-4">
            <summary className="text-[12px] font-semibold text-brand cursor-pointer">Ver el detalle mes a mes</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b-2 border-line2 text-left">
                    <th className="py-2 pr-2 font-bold text-muted">Mes</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Entradas</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Salidas</th>
                    <th className="py-2 px-2 font-bold text-muted text-right">Neto</th>
                    <th className="py-2 pl-2 font-bold text-muted text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.mes} className="border-b border-canvas">
                      <td className="py-1.5 pr-2 font-semibold text-ink whitespace-nowrap">{etiquetaMes(f.mes)}{f.proyectado ? ' (proy.)' : ''}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.entradas)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.salidas)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.neto)}</td>
                      <td className="py-1.5 pl-2 text-right font-bold tabular-nums">{fmt(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  )
}

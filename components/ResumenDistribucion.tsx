'use client'
// components/ResumenDistribucion.tsx
// Vista de "proyecto general": muestra TODAS las partidas únicas del proyecto
// (filas) y cómo se distribuyen entre cada subproyecto / persona (columnas).
// Cada celda = cantidad que ese subproyecto aplica de esa partida.
// Sirve para ver, de un vistazo, qué trabajo existe y cuánto le toca a cada uno.

import { Fragment, useMemo, useState } from 'react'
import { fmt } from '@/lib/format'
import type { PartidaProyecto } from '@/types/partida-proyecto'

type Nodo = PartidaProyecto & { children?: Nodo[] }

// Recolecta las hojas (partidas reales) que cuelgan de un nodo, a cualquier prof.
function hojasDe(nodo: Nodo): Nodo[] {
  const hijos = nodo.children || []
  if (hijos.length === 0) return nodo.es_grupo ? [] : [nodo]
  return hijos.flatMap(hojasDe)
}

const valorHoja = (p: Nodo) => (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0)

export default function ResumenDistribucion({ raices }: { raices: Nodo[] }) {
  const [modo, setModo] = useState<'cantidad' | 'monto'>('cantidad')

  const { columnas, grupos, totalesCol, granTotal } = useMemo(() => {
    // Columnas = cada raíz (persona / subproyecto)
    const columnas = raices.map(r => ({ id: r.id, nombre: r.descripcion, hojas: hojasDe(r) }))

    // Filas = partidas únicas, agrupadas por categoría (notas: "M1 · etapa")
    // clave de fila: categoria ¦ descripcion ¦ unidad
    type Fila = {
      categoria: string; descripcion: string; unidad: string
      porCol: Record<string, { cantidad: number; valor: number }>
      totalCant: number; totalValor: number
    }
    const filasMap = new Map<string, Fila>()

    for (const col of columnas) {
      for (const h of col.hojas) {
        const categoria = (h.notas || '').trim() || 'Sin categoría'
        const descripcion = (h.descripcion || '').trim()
        const unidad = h.unidad || ''
        const key = `${categoria}¦${descripcion}¦${unidad}`
        let fila = filasMap.get(key)
        if (!fila) {
          fila = { categoria, descripcion, unidad, porCol: {}, totalCant: 0, totalValor: 0 }
          filasMap.set(key, fila)
        }
        const cant = Number(h.cantidad) || 0
        const valor = valorHoja(h)
        const prev = fila.porCol[col.id] || { cantidad: 0, valor: 0 }
        fila.porCol[col.id] = { cantidad: prev.cantidad + cant, valor: prev.valor + valor }
        fila.totalCant += cant
        fila.totalValor += valor
      }
    }

    // Agrupar filas por categoría, conservando el orden de aparición
    const grupos: { categoria: string; filas: Fila[] }[] = []
    const idxGrupo = new Map<string, number>()
    for (const fila of filasMap.values()) {
      let gi = idxGrupo.get(fila.categoria)
      if (gi === undefined) {
        gi = grupos.length
        idxGrupo.set(fila.categoria, gi)
        grupos.push({ categoria: fila.categoria, filas: [] })
      }
      grupos[gi].filas.push(fila)
    }

    // Totales por columna (monto) y gran total
    const totalesCol: Record<string, number> = {}
    let granTotal = 0
    for (const col of columnas) {
      const t = col.hojas.reduce((s, h) => s + valorHoja(h), 0)
      totalesCol[col.id] = t
      granTotal += t
    }

    return { columnas, grupos, totalesCol, granTotal }
  }, [raices])

  if (columnas.length === 0) {
    return (
      <div className="bg-canvas border border-dashed border-line2 rounded-lg p-7 text-center text-[12px] text-muted">
        Sin partidas que resumir. Importa un programa de beneficiarios o agrega subproyectos.
      </div>
    )
  }

  const totalPartidasUnicas = grupos.reduce((s, g) => s + g.filas.length, 0)
  const celda = (v: { cantidad: number; valor: number } | undefined, unidad: string) => {
    if (!v || (v.cantidad === 0 && v.valor === 0)) return <span className="text-[#cdd5e0]">–</span>
    return modo === 'cantidad'
      ? <span>{v.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 2 })} <span className="text-[10px] text-muted">{unidad}</span></span>
      : <span>{fmt(v.valor)}</span>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[12px] text-muted">
          <strong className="text-ink">{totalPartidasUnicas}</strong> partidas únicas ·{' '}
          <strong className="text-ink">{columnas.length}</strong> subproyecto{columnas.length !== 1 ? 's' : ''} ·{' '}
          costo total <strong className="text-ink">{fmt(granTotal)}</strong>
        </div>
        <div className="flex gap-1 bg-canvas rounded-lg p-0.5">
          <button onClick={() => setModo('cantidad')}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${modo === 'cantidad' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>
            Cantidad
          </button>
          <button onClick={() => setModo('monto')}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${modo === 'monto' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>
            Monto ($)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-line rounded-xl">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-canvas">
              <th className="text-left font-bold text-ink px-3 py-2 sticky left-0 bg-canvas z-10 min-w-[220px] border-b border-line">
                Partida
              </th>
              {columnas.map(c => (
                <th key={c.id} className="text-right font-bold text-ink px-3 py-2 whitespace-nowrap border-b border-line min-w-[110px]">
                  {c.nombre}
                </th>
              ))}
              <th className="text-right font-extrabold text-brand px-3 py-2 whitespace-nowrap border-b border-line bg-[#f4f8fd] min-w-[110px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, gi) => (
              <Fragment key={`g-${gi}`}>
                <tr className="bg-[#eef3f9]">
                  <td colSpan={columnas.length + 2}
                    className="px-3 py-1.5 text-[11px] font-bold text-[#0c447c] uppercase tracking-wide sticky left-0">
                    {g.categoria}
                  </td>
                </tr>
                {g.filas.map((f, fi) => (
                  <tr key={`f-${gi}-${fi}`} className="border-b border-line2 hover:bg-[#FBFAF9]">
                    <td className="px-3 py-2 text-[#1a2535] sticky left-0 bg-white z-10">
                      {f.descripcion}
                    </td>
                    {columnas.map(c => (
                      <td key={c.id} className="px-3 py-2 text-right text-ink whitespace-nowrap">
                        {celda(f.porCol[c.id], f.unidad)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold text-ink whitespace-nowrap bg-[#f4f8fd]">
                      {modo === 'cantidad'
                        ? <>{f.totalCant.toLocaleString('es-CL', { maximumFractionDigits: 2 })} <span className="text-[10px] text-muted">{f.unidad}</span></>
                        : fmt(f.totalValor)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-canvas border-t-2 border-line">
              <td className="px-3 py-2.5 font-extrabold text-ink sticky left-0 bg-canvas z-10">
                Total por subproyecto ($)
              </td>
              {columnas.map(c => (
                <td key={c.id} className="px-3 py-2.5 text-right font-bold text-ink whitespace-nowrap">
                  {fmt(totalesCol[c.id])}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-extrabold text-brand whitespace-nowrap bg-[#f4f8fd]">
                {fmt(granTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted mt-2">
        Las columnas son los subproyectos (personas). En modo <strong>Cantidad</strong> cada celda muestra cuánto aplica
        ese subproyecto de la partida; en modo <strong>Monto</strong>, su costo. El total suma todo el proyecto.
      </p>
    </div>
  )
}
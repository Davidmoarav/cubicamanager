// lib/minvu.ts
// Presupuesto itemizado formato MINVU/DOM: función PURA que arma las filas
// (testeable sin Excel). El botón de export la convierte a XLSX con SheetJS.

export interface PartidaMin {
  id: string
  parent_id?: string | null
  orden: number
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  es_grupo?: boolean
}

export const IVA_MINVU = 0.19

export type FilaMINVU = (string | number)[]

const ENCABEZADO: FilaMINVU = ['ITEM', 'PARTIDA', 'UNIDAD', 'CANTIDAD', 'P. UNITARIO ($)', 'TOTAL ($)']

// Anchos de columna sugeridos para SheetJS (wch = caracteres)
export const ANCHOS_MINVU = [{ wch: 8 }, { wch: 52 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]

export function filasMINVU(
  nombreProyecto: string,
  partidas: PartidaMin[],
  fecha: string = new Date().toLocaleDateString('es-CL')
): FilaMINVU[] {
  const hijosDe = (id: string) =>
    partidas.filter(p => p.parent_id === id).sort((a, b) => a.orden - b.orden)

  const valorNodo = (n: PartidaMin): number => {
    const h = hijosDe(n.id)
    if (h.length === 0) return Math.round((Number(n.cantidad) || 0) * (Number(n.precio_unitario) || 0))
    return h.reduce((s, c) => s + valorNodo(c), 0)
  }

  const filas: FilaMINVU[] = [
    ['PRESUPUESTO ITEMIZADO'],
    [nombreProyecto],
    [`Fecha: ${fecha}`],
    [],
    ENCABEZADO,
  ]

  const emitir = (nodo: PartidaMin, numero: string) => {
    const h = hijosDe(nodo.id)
    const esGrupo = h.length > 0 || nodo.es_grupo
    if (esGrupo) {
      filas.push([numero, nodo.descripcion.toUpperCase(), '', '', '', valorNodo(nodo)])
      h.forEach((c, i) => emitir(c, `${numero}.${i + 1}`))
    } else {
      filas.push([
        numero,
        nodo.descripcion,
        nodo.unidad,
        Number(nodo.cantidad) || 0,
        Math.round(Number(nodo.precio_unitario) || 0),
        valorNodo(nodo),
      ])
    }
  }

  const raices = partidas.filter(p => !p.parent_id).sort((a, b) => a.orden - b.orden)
  raices.forEach((r, i) => emitir(r, String(i + 1)))

  const neto = raices.reduce((s, r) => s + valorNodo(r), 0)
  const iva = Math.round(neto * IVA_MINVU)

  filas.push(
    [],
    ['', 'COSTO DIRECTO (NETO)', '', '', '', neto],
    ['', `IVA ${Math.round(IVA_MINVU * 100)}%`, '', '', '', iva],
    ['', 'TOTAL PRESUPUESTO', '', '', '', neto + iva],
  )

  return filas
}

// lib/consolidado.ts
// Filtro por obra y consolidado de empresa: funciones puras.
// Invariante: el total de la empresa es exactamente la suma de las obras más "Sin obra".
import { netoConSigno, resolverDocumentosCompra } from './costos'
import { calcularResumenIVA } from './iva'

export const SIN_OBRA = 'sin'

export interface ConObra {
  proyecto_id?: string | null
  proyecto?: string | null
}

// Enlace por id; los documentos antiguos solo tienen el nombre en texto.
export function obraDe(item: ConObra, proyectos: { id: string; nombre?: string }[]): string | null {
  if (item.proyecto_id) return item.proyecto_id
  if (!item.proyecto) return null
  return proyectos.find(p => p.nombre === item.proyecto)?.id ?? null
}

// filtro: '' = todas · 'sin' = sin obra · otro = id de la obra
export function filtrarPorObra<T extends ConObra>(items: T[], filtro: string, proyectos: { id: string; nombre?: string }[] = []): T[] {
  if (!filtro) return items
  return items.filter(i => {
    const obra = obraDe(i, proyectos)
    return filtro === SIN_OBRA ? !obra : obra === filtro
  })
}

export interface FilaConsolidado {
  proyecto_id: string | null
  nombre: string
  cobrado: number
  por_cobrar: number
  vencido: number
  compras: number
  gastos: number
  nomina: number
  costo_total: number
  iva_debito: number
  iva_credito: number
}

const CAMPOS = ['cobrado', 'por_cobrar', 'vencido', 'compras', 'gastos', 'nomina', 'costo_total', 'iva_debito', 'iva_credito'] as const

const mesDe = (d: any) => d.periodo || (d.emision ? String(d.emision).slice(0, 7) : '')

// periodo: 'YYYY-MM', o vacío para todo el historial
export function consolidarPorObra(e: {
  facturas: any[]
  gastos: { proyecto_id?: string | null; monto?: number | null; fecha?: string | null; liquidacion_id?: string | null }[]
  // Costo de cada liquidación que no llegó a ninguna obra
  nominaSinObra?: { periodo?: string; monto: number }[]
  proyectos: { id: string; nombre?: string }[]
  periodo?: string
}) {
  const enPeriodo = (mes: string) => !e.periodo || mes === e.periodo
  const filas = new Map<string, FilaConsolidado>()
  const fila = (id: string | null): FilaConsolidado => {
    const clave = id ?? SIN_OBRA
    const existente = filas.get(clave)
    if (existente) return existente
    const nueva: FilaConsolidado = {
      proyecto_id: id,
      nombre: id ? (e.proyectos.find(p => p.id === id)?.nombre ?? 'Obra eliminada') : 'Sin obra',
      cobrado: 0, por_cobrar: 0, vencido: 0, compras: 0, gastos: 0, nomina: 0, costo_total: 0, iva_debito: 0, iva_credito: 0,
    }
    filas.set(clave, nueva)
    return nueva
  }

  // Las notas siguen a la factura que modifican: venta y compra
  const docs = resolverDocumentosCompra(e.facturas).filter(d => enPeriodo(mesDe(d)))

  for (const d of docs) {
    const f = fila(obraDe(d, e.proyectos))
    if (d.tipo === 'compra') {
      f.compras += netoConSigno(d)
    } else {
      const monto = (d.doc_tipo === 'nota_credito' ? -1 : 1) * (Number(d.monto) || 0)
      if (d.estado === 'pagada') f.cobrado += monto
      else if (d.estado === 'vencida') f.vencido += monto
      else if (d.estado === 'pendiente') f.por_cobrar += monto
    }
  }

  // Mismo cálculo que el Control de IVA: sin remanente ni PPM, que son de la empresa
  const porObra = new Map<string | null, any[]>()
  for (const d of docs) {
    const id = obraDe(d, e.proyectos)
    porObra.set(id, [...(porObra.get(id) ?? []), d])
  }
  for (const [id, lista] of porObra) {
    for (const p of calcularResumenIVA(lista)) {
      const f = fila(id)
      f.iva_debito += p.iva_debito
      f.iva_credito += p.iva_credito
    }
  }

  for (const g of e.gastos) {
    if (!enPeriodo(String(g.fecha || '').slice(0, 7))) continue
    const f = fila(g.proyecto_id ?? null)
    if (g.liquidacion_id) f.nomina += Number(g.monto) || 0
    else f.gastos += Number(g.monto) || 0
  }
  for (const n of e.nominaSinObra ?? []) {
    if (enPeriodo(n.periodo ?? '')) fila(null).nomina += n.monto
  }

  const lista = [...filas.values()]
  for (const f of lista) f.costo_total = f.compras + f.gastos + f.nomina
  lista.sort((a, b) => {
    if (!a.proyecto_id) return 1
    if (!b.proyecto_id) return -1
    return a.nombre.localeCompare(b.nombre)
  })

  const totales = Object.fromEntries(CAMPOS.map(c => [c, lista.reduce((s, f) => s + f[c], 0)])) as Record<typeof CAMPOS[number], number>
  return { filas: lista, totales }
}

// lib/plancompra.ts
// Motor del PLAN DE COMPRA (Fase 3): función pura que cruza los materiales
// del presupuesto con los catálogos de productos por proveedor y arma la
// ruta de compra: qué comprar, a quién, a qué precio y cuánto se ahorra.

import { normalizar } from './copiloto/schema'

export interface PartidaPlan {
  id: string
  parent_id?: string | null
  orden: number
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  es_grupo?: boolean
}

export interface ProductoProv {
  id: string
  proveedor_id: string
  descripcion: string
  unidad?: string
  precio: number
  codigo?: string | null
}

export interface ProveedorMin {
  id: string
  nombre: string
}

export interface ItemPlan {
  partida_id: string
  material: string          // descripción de la partida
  producto: string          // descripción del producto del proveedor
  producto_id: string
  unidad: string
  cantidad: number
  precio_proveedor: number
  precio_presupuesto: number
  subtotal: number          // cantidad × precio_proveedor
  ahorro: number            // (presupuesto − proveedor) × cantidad, mínimo 0
}

export interface GrupoProveedor {
  proveedor_id: string
  proveedor: string
  items: ItemPlan[]
  neto: number
  ahorro: number
}

export interface PlanCompra {
  porProveedor: GrupoProveedor[]
  sinOferta: { partida_id: string; material: string; unidad: string; cantidad: number }[]
  noComprables: number      // servicios / mano de obra excluidos
  resumen: {
    materiales: number      // materiales detectados (comprables)
    conOferta: number
    netoPlan: number        // total a pagar a proveedores
    ahorro: number          // vs precios del presupuesto
  }
}

// Unidades que denotan servicios / jornadas (no se compran a proveedor)
const UNIDADES_SERVICIO = new Set(['día', 'dia', 'hh', 'jornada', 'mes'])
const GRUPO_NO_COMPRA = /mano de obra|honorarios|servicios profesionales/

function esComprable(p: PartidaPlan, nombreGrupo: string): boolean {
  if (GRUPO_NO_COMPRA.test(normalizar(nombreGrupo))) return false
  if (UNIDADES_SERVICIO.has(normalizar(p.unidad))) return false
  return true
}

// Limpieza para matching: minúsculas, sin tildes, × → x, solo alfanumérico
const limpiar = (s: string) =>
  normalizar(s).replace(/×/g, 'x').replace(/[^a-z0-9]+/g, ' ').trim()

// Score de similitud descripción-partida ↔ descripción-producto
export function puntajeMatch(a: string, b: string): number {
  const na = limpiar(a)
  const nb = limpiar(b)
  if (!na || !nb) return 0
  if (na === nb) return 100
  let score = 0
  if (na.includes(nb) || nb.includes(na)) score += 3
  const pa = na.split(' ').filter(w => w.length > 3)
  for (const w of pa) if (nb.includes(w)) score += 1
  return score
}

const UMBRAL = 2

export function mejorOferta(material: string, productos: ProductoProv[]): ProductoProv | undefined {
  let mejor: ProductoProv | undefined
  let mejorScore = 0
  for (const prod of productos) {
    const s = puntajeMatch(material, prod.descripcion)
    if (s < UMBRAL) continue
    // Mayor score gana; a igual score, el más barato
    if (s > mejorScore || (s === mejorScore && mejor && Number(prod.precio) < Number(mejor.precio))) {
      mejor = prod
      mejorScore = s
    }
  }
  return mejor
}

export function generarPlanCompra(
  partidas: PartidaPlan[],
  productos: ProductoProv[],
  proveedores: ProveedorMin[]
): PlanCompra {
  const hijosDe = (id: string) => partidas.filter(p => p.parent_id === id)
  const nombreProv = new Map(proveedores.map(p => [p.id, p.nombre]))
  const grupoDe = (p: PartidaPlan): string =>
    p.parent_id ? partidas.find(x => x.id === p.parent_id)?.descripcion ?? '' : ''

  // Hojas del presupuesto
  const hojas = partidas.filter(p => !p.es_grupo && hijosDe(p.id).length === 0)

  const comprables: PartidaPlan[] = []
  let noComprables = 0
  for (const h of hojas) {
    if (esComprable(h, grupoDe(h))) comprables.push(h)
    else noComprables++
  }

  const grupos = new Map<string, GrupoProveedor>()
  const sinOferta: PlanCompra['sinOferta'] = []
  let netoPlan = 0
  let ahorro = 0

  for (const mat of comprables) {
    const oferta = mejorOferta(mat.descripcion, productos)
    if (!oferta) {
      sinOferta.push({
        partida_id: mat.id, material: mat.descripcion,
        unidad: mat.unidad, cantidad: Number(mat.cantidad) || 0,
      })
      continue
    }

    const cantidad = Number(mat.cantidad) || 0
    const precioProv = Number(oferta.precio) || 0
    const precioPres = Number(mat.precio_unitario) || 0
    const subtotal = Math.round(cantidad * precioProv)
    const ahorroItem = Math.max(0, Math.round((precioPres - precioProv) * cantidad))

    let g = grupos.get(oferta.proveedor_id)
    if (!g) {
      g = {
        proveedor_id: oferta.proveedor_id,
        proveedor: nombreProv.get(oferta.proveedor_id) ?? 'Proveedor',
        items: [], neto: 0, ahorro: 0,
      }
      grupos.set(oferta.proveedor_id, g)
    }
    g.items.push({
      partida_id: mat.id,
      material: mat.descripcion,
      producto: oferta.descripcion,
      producto_id: oferta.id,
      unidad: oferta.unidad || mat.unidad,
      cantidad,
      precio_proveedor: precioProv,
      precio_presupuesto: precioPres,
      subtotal,
      ahorro: ahorroItem,
    })
    g.neto += subtotal
    g.ahorro += ahorroItem
    netoPlan += subtotal
    ahorro += ahorroItem
  }

  const porProveedor = [...grupos.values()].sort((a, b) => b.neto - a.neto)

  return {
    porProveedor,
    sinOferta,
    noComprables,
    resumen: {
      materiales: comprables.length,
      conOferta: comprables.length - sinOferta.length,
      netoPlan,
      ahorro,
    },
  }
}

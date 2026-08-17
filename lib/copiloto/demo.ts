// lib/copiloto/demo.ts
// Modo DEMO del Copiloto: genera y edita presupuestos SIN API key,
// con reglas deterministas + precios del catálogo real del usuario.
// Cuando se configura un proveedor IA real, este módulo queda de fallback.

import {
  type PresupuestoIA, type EdicionIA, type OpIA, normalizar,
} from './schema'

export interface CatItem {
  descripcion: string
  unidad: string
  precio_unitario_ref: number
}

export interface PartidaActual {
  id: string
  parent_id?: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  es_grupo?: boolean
}

// ─── Matching contra catálogo ─────────────────────────────
function buscarCatalogo(cat: CatItem[], q: string): CatItem | undefined {
  const nq = normalizar(q)
  const palabras = nq.split(/\s+/).filter(w => w.length > 3)
  let mejor: CatItem | undefined
  let mejorScore = 0
  for (const c of cat) {
    const nc = normalizar(c.descripcion)
    if (nc === nq) return c
    let score = 0
    if (nc.includes(nq) || nq.includes(nc)) score += 3
    for (const w of palabras) if (nc.includes(w)) score += 1
    if (score > mejorScore) { mejorScore = score; mejor = c }
  }
  return mejorScore >= 2 ? mejor : undefined
}

// ─── Plantillas de referencia (precios CLP orientativos) ──
type ItemTpl = { d: string; u: string; p: number; n?: number; porM2?: number }
type GrupoTpl = { nombre: string; items: ItemTpl[] }
type Plantilla = { claves: string[]; nombre: (m2: number) => string; grupos: GrupoTpl[] }

const PLANTILLAS: Plantilla[] = [
  {
    claves: ['bano', 'ducha', 'vanitorio', 'wc', 'tina'],
    nombre: () => 'Remodelación Baño',
    grupos: [
      { nombre: 'DEMOLICIÓN Y PREPARACIÓN', items: [
        { d: 'Demolición de revestimientos y artefactos', u: 'm²', p: 8000, porM2: 1 },
        { d: 'Retiro y transporte de escombros', u: 'm³', p: 50000, n: 1 },
      ]},
      { nombre: 'INSTALACIONES', items: [
        { d: 'Reubicación de puntos de agua fría/caliente', u: 'un', p: 45000, n: 2 },
        { d: 'Llave de paso esférica 1/2"', u: 'un', p: 8000, n: 1 },
      ]},
      { nombre: 'IMPERMEABILIZACIÓN', items: [
        { d: 'Impermeabilizante flexible para zona de ducha', u: 'm²', p: 38990, n: 4 },
      ]},
      { nombre: 'REVESTIMIENTOS', items: [
        { d: 'Porcelanato piso/muro 60×60cm', u: 'm²', p: 25990, porM2: 2.6 },
        { d: 'Adhesivo flexible para porcelanato, saco 25kg', u: 'saco', p: 14600, porM2: 0.5 },
        { d: 'Fragua para porcelanato, saco 5kg', u: 'saco', p: 7000, porM2: 0.15 },
      ]},
      { nombre: 'ARTEFACTOS', items: [
        { d: 'Vanitorio con cubierta y espejo', u: 'un', p: 120000, n: 1 },
        { d: 'WC completo con estanque', u: 'un', p: 90000, n: 1 },
        { d: 'Grifería de ducha monomando', u: 'un', p: 60000, n: 1 },
      ]},
      { nombre: 'MANO DE OBRA', items: [
        { d: 'Maestro especialista', u: 'día', p: 65000, porM2: 1.2 },
        { d: 'Ayudante', u: 'día', p: 40000, porM2: 1 },
      ]},
    ],
  },
  {
    claves: ['cocina', 'mueble', 'encimera', 'campana'],
    nombre: () => 'Remodelación Cocina',
    grupos: [
      { nombre: 'DEMOLICIÓN Y PREPARACIÓN', items: [
        { d: 'Retiro de muebles y cubierta existente', u: 'gl', p: 80000, n: 1 },
        { d: 'Retiro y transporte de escombros', u: 'm³', p: 50000, n: 1 },
      ]},
      { nombre: 'INSTALACIONES', items: [
        { d: 'Modificación red de agua y desagüe', u: 'un', p: 55000, n: 2 },
        { d: 'Punto eléctrico adicional', u: 'un', p: 35000, n: 3 },
      ]},
      { nombre: 'REVESTIMIENTOS', items: [
        { d: 'Cerámico muro entre muebles', u: 'm²', p: 18990, porM2: 0.8 },
        { d: 'Adhesivo cerámico, saco 25kg', u: 'saco', p: 9500, porM2: 0.3 },
      ]},
      { nombre: 'MUEBLES Y CUBIERTAS', items: [
        { d: 'Mueble base con cubierta postformada, ml', u: 'ml', p: 185000, n: 3 },
        { d: 'Mueble aéreo, ml', u: 'ml', p: 120000, n: 2.5 },
        { d: 'Lavaplatos con grifería', u: 'un', p: 95000, n: 1 },
      ]},
      { nombre: 'MANO DE OBRA', items: [
        { d: 'Maestro especialista', u: 'día', p: 65000, porM2: 1 },
        { d: 'Ayudante', u: 'día', p: 40000, porM2: 0.8 },
      ]},
    ],
  },
  {
    claves: ['pintura', 'pintar', 'latex', 'esmalte', 'empaste'],
    nombre: m2 => `Pintura interior ${m2}m²`,
    grupos: [
      { nombre: 'PREPARACIÓN DE SUPERFICIES', items: [
        { d: 'Empaste y lijado de muros', u: 'm²', p: 3500, porM2: 1 },
        { d: 'Cinta, plástico y protección', u: 'gl', p: 25000, n: 1 },
      ]},
      { nombre: 'PINTURA', items: [
        { d: 'Látex extracubriente, 2 manos aplicado', u: 'm²', p: 4800, porM2: 1 },
        { d: 'Esmalte al agua puertas y marcos', u: 'un', p: 28000, n: 3 },
      ]},
      { nombre: 'MANO DE OBRA', items: [
        { d: 'Maestro pintor', u: 'día', p: 55000, porM2: 0.12 },
      ]},
    ],
  },
]

const PLANTILLA_GENERICA: Plantilla = {
  claves: [],
  nombre: () => 'Proyecto de obra',
  grupos: [
    { nombre: 'LEVANTAMIENTO', items: [
      { d: 'Visita técnica y levantamiento en terreno', u: 'gl', p: 45000, n: 1 },
    ]},
    { nombre: 'MATERIALES', items: [
      { d: 'Materiales según especificación (por detallar)', u: 'gl', p: 250000, n: 1 },
    ]},
    { nombre: 'MANO DE OBRA', items: [
      { d: 'Maestro especialista', u: 'día', p: 65000, n: 5 },
      { d: 'Ayudante', u: 'día', p: 40000, n: 5 },
    ]},
  ],
}

// ─── Parse de números CLP ("15.000" → 15000) ──────────────
export const parseNumCL = (s: string): number =>
  Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

function extraerM2(texto: string): number {
  const m = texto.match(/(\d+[.,]?\d*)\s*(m2|m²|mts2|metros cuadrados)/i)
  return m ? Math.max(1, parseNumCL(m[1])) : 10
}

// ─── GENERAR presupuesto ──────────────────────────────────
export function generarDemo(descripcion: string, catalogo: CatItem[]): PresupuestoIA {
  const nd = normalizar(descripcion)
  const m2 = extraerM2(descripcion)
  const tpl = PLANTILLAS.find(t => t.claves.some(k => nd.includes(k))) ?? PLANTILLA_GENERICA

  const grupos = tpl.grupos.map(g => ({
    nombre: g.nombre,
    partidas: g.items.map(it => {
      const enCat = buscarCatalogo(catalogo, it.d)
      const cantidad = it.porM2
        ? Math.max(1, Math.round(m2 * it.porM2 * 10) / 10)
        : (it.n ?? 1)
      return {
        descripcion: enCat?.descripcion ?? it.d,
        unidad: enCat?.unidad ?? it.u,
        cantidad,
        precio_unitario: enCat ? Number(enCat.precio_unitario_ref) || it.p : it.p,
        origen_precio: (enCat ? 'catalogo' : 'referencia') as 'catalogo' | 'referencia',
      }
    }),
  }))

  return { nombre_proyecto: tpl.nombre(m2), grupos }
}

// ─── EDITAR: instrucción → operaciones ────────────────────
function buscarPartida(partidas: PartidaActual[], q: string): PartidaActual | undefined {
  const nq = normalizar(q)
  const hojas = partidas.filter(p => !p.es_grupo)
  return (
    hojas.find(p => normalizar(p.descripcion) === nq) ??
    hojas.find(p => normalizar(p.descripcion).includes(nq)) ??
    hojas.find(p => nq.includes(normalizar(p.descripcion)))
  )
}

export function editarDemo(
  instruccion: string,
  partidas: PartidaActual[],
  catalogo: CatItem[]
): EdicionIA {
  const t = instruccion.trim()
  const nt = normalizar(t)
  const ops: OpIA[] = []

  // "sube/baja X 15%"
  let m = t.match(/(sube|aumenta|incrementa|baja|reduce|descuenta)\s+(.*?)\s*(?:en|un|a)?\s*(\d+[.,]?\d*)\s*%/i)
  if (m) {
    const signo = /baja|reduce|descuenta/i.test(m[1]) ? -1 : 1
    const filtro = m[2].replace(/^(el|la|los|las|precio de|precios de)\s+/i, '').trim()
    ops.push({ accion: 'ajustar_pct', filtro: filtro || undefined, pct: signo * parseNumCL(m[3]) })
    const donde = filtro ? `"${filtro}"` : 'todo el presupuesto'
    return { resumen: `${signo > 0 ? 'Subí' : 'Bajé'} ${donde} en ${parseNumCL(m[3])}%.`, ops }
  }

  // "cambia el precio de X a $N"
  m = t.match(/(?:cambia|deja|pon|ajusta)\s+(?:el\s+)?precio\s+de\s+(.+?)\s+(?:a|en)\s+\$?\s*([\d.,]+)/i)
  if (m) {
    const p = buscarPartida(partidas, m[1])
    if (!p) return { resumen: `No encontré la partida "${m[1]}" en el presupuesto.`, ops: [] }
    ops.push({ accion: 'modificar', id: p.id, precio_unitario: parseNumCL(m[2]) })
    return { resumen: `Precio de "${p.descripcion}" → $${parseNumCL(m[2]).toLocaleString('es-CL')}.`, ops }
  }

  // "cambia la cantidad de X a N"
  m = t.match(/(?:cambia|deja|pon|ajusta)\s+(?:la\s+)?cantidad\s+de\s+(.+?)\s+(?:a|en)\s+([\d.,]+)/i)
  if (m) {
    const p = buscarPartida(partidas, m[1])
    if (!p) return { resumen: `No encontré la partida "${m[1]}".`, ops: [] }
    ops.push({ accion: 'modificar', id: p.id, cantidad: parseNumCL(m[2]) })
    return { resumen: `Cantidad de "${p.descripcion}" → ${parseNumCL(m[2])}.`, ops }
  }

  // "elimina/quita/borra X"
  m = t.match(/^(?:elimina|quita|borra|saca)\s+(?:el|la|los|las)?\s*(.+)/i)
  if (m) {
    const p = buscarPartida(partidas, m[1])
    if (!p) return { resumen: `No encontré la partida "${m[1]}" para eliminar.`, ops: [] }
    ops.push({ accion: 'eliminar', id: p.id })
    return { resumen: `Eliminé "${p.descripcion}".`, ops }
  }

  // "agrega [N unidad de] X [a $P]"
  m = t.match(/^(?:agrega|anade|añade|suma|incluye)\s+(.+)/i)
  if (m) {
    let resto = m[1].trim()
    let cantidad = 1
    let unidad = 'un'
    let precio = 0

    const conPrecio = resto.match(/(.+?)\s+(?:a|por|en)\s+\$?\s*([\d.,]+)\s*$/)
    if (conPrecio) { resto = conPrecio[1].trim(); precio = parseNumCL(conPrecio[2]) }

    const conCant = resto.match(/^([\d.,]+)\s*(m2|m²|un|und|gl|ml|dia|día|saco|sacos|kg|lt|m3|m³)?\s*(?:de\s+)?(.+)/i)
    if (conCant) {
      cantidad = Math.max(0.1, parseNumCL(conCant[1]))
      if (conCant[2]) unidad = normalizar(conCant[2]).replace('dias', 'día').replace('sacos', 'saco')
      resto = conCant[3].trim()
    }

    const enCat = buscarCatalogo(catalogo, resto)
    if (enCat) {
      if (!precio) precio = Number(enCat.precio_unitario_ref) || 0
      if (!conCant?.[2]) unidad = enCat.unidad
      resto = enCat.descripcion
    }

    ops.push({
      accion: 'agregar', grupo: 'OTROS',
      descripcion: resto.charAt(0).toUpperCase() + resto.slice(1),
      unidad, cantidad, precio_unitario: precio,
    })
    const origen = enCat ? ' (precio de tu catálogo)' : precio === 0 ? ' — precio pendiente' : ''
    return { resumen: `Agregué ${cantidad} ${unidad} de "${resto}"${origen}.`, ops }
  }

  // No entendido
  return {
    resumen: 'En modo demo entiendo: "agrega …", "elimina …", "sube/baja … 10%", "cambia el precio de … a …". Con API key configurada entenderé lenguaje libre.',
    ops: [],
  }
}

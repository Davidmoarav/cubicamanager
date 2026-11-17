// app/api/partidas-proyecto/aplicar-matriz/route.ts
// Aplica una MATRIZ de distribución partida × beneficiario en un solo lote.
// Cada fila es una partida (categoría + descripción + costos maestros) y sus
// "celdas" indican la cantidad que aplica a cada beneficiario (subproyecto).
//   cantidad > 0  → crea la partida bajo ese beneficiario, o la actualiza si ya existe.
//   cantidad = 0  → si existía, la elimina (deja de aplicar a ese beneficiario).
// Al final recalcula el avance de grupos y del proyecto.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { recalcTodo, traerPartidas } from '@/lib/avance-server'
import { NextResponse } from 'next/server'

interface Fila {
  categoria?: string
  descripcion: string
  unidad?: string
  costo_material_unit?: number
  costo_mo_unit?: number
  markup_pct?: number | null
  celdas: Record<string, number>   // benefId -> cantidad
}

const norm = (s: any) => String(s ?? '').trim()

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  const { proyecto_id, filas, markup = 20 } = body as { proyecto_id: string; filas: Fila[]; markup: number }
  if (!proyecto_id || !Array.isArray(filas)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // Estado actual del proyecto (por páginas: puede pasar de 1000 partidas)
  let todas: any[]
  try {
    todas = await traerPartidas(supabase, proyecto_id, ownerId, '*')
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo las partidas' }, { status: 500 })
  }
  const rootIds = new Set(todas.filter((p: any) => !p.parent_id).map((p: any) => p.id))
  // Índice beneficiario + partida + categoría → hoja existente (evita recorrer todo por cada celda)
  const clave = (benefId: string, desc: string, cat: string) => `${benefId}\u0000${desc}\u0000${cat}`
  const existentes = new Map<string, any>()
  const ordenBase: Record<string, number> = {}
  for (const id of rootIds) ordenBase[id as string] = 0
  for (const p of todas) {
    if (!p.parent_id || p.es_grupo || !rootIds.has(p.parent_id)) continue
    ordenBase[p.parent_id]++
    const k = clave(p.parent_id, norm(p.descripcion), norm(p.notas))
    if (!existentes.has(k)) existentes.set(k, p)
  }

  const aInsertar: any[] = []
  const aActualizar: { id: string; cambios: any }[] = []
  const aBorrar: string[] = []
  let updates = 0, inserts = 0, borrados = 0

  try {
    for (const fila of filas) {
      const desc = norm(fila.descripcion)
      if (!desc) continue
      const categoria = norm(fila.categoria)
      const unidad = norm(fila.unidad) || 'm2'
      const mat = Math.round(Number(fila.costo_material_unit) || 0)
      const mo  = Math.round(Number(fila.costo_mo_unit) || 0)
      const costo = mat + mo
      const mk = fila.markup_pct == null ? Number(markup) : Number(fila.markup_pct)
      const precio = Math.round(costo * (1 + mk / 100))

      for (const [benefId, cantRaw] of Object.entries(fila.celdas || {})) {
        if (!rootIds.has(benefId)) continue   // seguridad: solo beneficiarios reales
        const cant = Number(cantRaw) || 0
        const existente = existentes.get(clave(benefId, desc, categoria))
        if (cant > 0) {
          if (existente) {
            const cambios = {
              cantidad: cant, unidad,
              costo_material_unit: mat, costo_mo_unit: mo, costo_unitario: costo,
              markup_pct: mk, precio_unitario: precio,
            }
            // Solo se escribe lo que cambió de verdad
            const igual = Object.entries(cambios).every(([k, v]) =>
              typeof v === 'number' ? Number(existente[k]) === v : (existente[k] ?? '') === v)
            if (!igual) aActualizar.push({ id: existente.id, cambios })
          } else {
            aInsertar.push({
              proyecto_id, parent_id: benefId, nivel: 2, es_grupo: false,
              descripcion: desc.slice(0, 200), unidad: unidad.slice(0, 20),
              cantidad: cant, costo_material_unit: mat, costo_mo_unit: mo, costo_unitario: costo,
              markup_pct: mk, precio_unitario: precio, avance: 0,
              orden: ordenBase[benefId]++, notas: categoria.slice(0, 200) || null,
              user_id: ownerId,
            })
          }
        } else if (existente) {
          aBorrar.push(existente.id)
        }
      }
    }

    // Actualizaciones en paralelo, de a 25
    for (let i = 0; i < aActualizar.length; i += 25) {
      const res = await Promise.all(aActualizar.slice(i, i + 25).map(u =>
        supabase.from('partidas_proyecto').update(u.cambios).eq('id', u.id).eq('user_id', ownerId)))
      const fallo = res.find(r => r.error)
      if (fallo) throw fallo.error
      updates += res.length
    }
    // Inserciones por lote
    for (let i = 0; i < aInsertar.length; i += 500) {
      const lote = aInsertar.slice(i, i + 500)
      const { error } = await supabase.from('partidas_proyecto').insert(lote)
      if (error) throw error
      inserts += lote.length
    }
    // Borrados en bloque
    if (aBorrar.length > 0) {
      const { error } = await supabase.from('partidas_proyecto')
        .delete().in('id', aBorrar).eq('user_id', ownerId)
      if (error) throw error
      borrados = aBorrar.length
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al aplicar la distribución: ' + (err.message || 'desconocido') }, { status: 500 })
  }

  await recalcTodo(supabase, proyecto_id, ownerId)
  return NextResponse.json({ ok: true, inserts, updates, borrados })
}
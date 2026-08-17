// app/api/copiloto/editar/route.ts
// POST { proyecto_id, instruccion } → traduce la instrucción a operaciones
// (IA o demo), las aplica sobre partidas_proyecto y actualiza el valor del proyecto.

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EdicionIASchema, normalizar, type EdicionIA, type OpIA } from '@/lib/copiloto/schema'
import { editarDemo, type CatItem, type PartidaActual } from '@/lib/copiloto/demo'
import { proveedorActivo, completarJSON, extraerJSON } from '@/lib/copiloto/ia'
import { promptEdicion } from '@/lib/copiloto/prompt'

const BodySchema = z.object({
  proyecto_id: z.string().min(1),
  instruccion: z.string().min(3).max(1000),
})

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Faltan datos de la instrucción.' }, { status: 400 })
  const { proyecto_id, instruccion } = body.data

  // Partidas actuales + catálogo
  const [{ data: partRows }, { data: catRows }] = await Promise.all([
    supabase.from('partidas_proyecto').select('*')
      .eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
      .order('orden', { ascending: true }),
    supabase.from('catalogo_partidas').select('descripcion, unidad, precio_unitario_ref')
      .eq('user_id', ownerId),
  ])
  const partidas = (partRows ?? []) as PartidaActual[]
  const catalogo = (catRows ?? []) as CatItem[]
  if (partidas.length === 0 && !/^(agrega|anade|añade|suma|incluye)/i.test(instruccion.trim())) {
    return NextResponse.json({ resumen: 'Este proyecto aún no tiene partidas: parte con "agrega …".', aplicadas: 0 })
  }

  // ─── Instrucción → operaciones ───
  const prov = proveedorActivo()
  let edicion: EdicionIA
  let provUsado: string = prov

  if (prov === 'demo') {
    edicion = editarDemo(instruccion, partidas, catalogo)
  } else {
    try {
      const raw = await completarJSON(promptEdicion(partidas, catalogo), instruccion, 1500)
      const parsed = EdicionIASchema.safeParse(extraerJSON(raw))
      if (!parsed.success) throw new Error('Edición IA inválida')
      edicion = parsed.data
    } catch (e) {
      console.error('[copiloto] edición IA falló, fallback demo:', e)
      edicion = editarDemo(instruccion, partidas, catalogo)
      provUsado = 'demo (fallback)'
    }
  }

  // ─── Aplicar operaciones ───
  const hijosDe = (id: string) => partidas.filter(p => p.parent_id === id)
  let aplicadas = 0
  let maxOrden = partidas.reduce((m, p: any) => Math.max(m, Number(p.orden) || 0), 0)

  for (const op of edicion.ops) {
    if (op.accion === 'agregar') {
      // Grupo destino: match por nombre, o crear "OTROS"
      const raicesGrupo = partidas.filter(p => !p.parent_id && p.es_grupo)
      let padre = raicesGrupo.find(g => normalizar(g.descripcion).includes(normalizar(op.grupo)) ||
                                        normalizar(op.grupo).includes(normalizar(g.descripcion)))
      if (!padre) {
        padre = raicesGrupo.find(g => normalizar(g.descripcion) === 'otros')
        if (!padre) {
          const { data: nuevo } = await supabase.from('partidas_proyecto').insert({
            proyecto_id, parent_id: null, orden: ++maxOrden,
            descripcion: 'OTROS', unidad: 'gl', cantidad: 0, precio_unitario: 0,
            avance: 0, es_grupo: true, user_id: ownerId,
          }).select('*').single()
          if (nuevo) { padre = nuevo as PartidaActual; partidas.push(padre) }
        }
      }
      if (!padre) continue
      const { error } = await supabase.from('partidas_proyecto').insert({
        proyecto_id, parent_id: padre.id, orden: ++maxOrden,
        descripcion: op.descripcion, unidad: op.unidad,
        cantidad: op.cantidad, precio_unitario: Math.round(op.precio_unitario),
        avance: 0, es_grupo: false, user_id: ownerId,
      })
      if (!error) aplicadas++
    }

    if (op.accion === 'modificar') {
      const cambios: Record<string, unknown> = {}
      if (op.cantidad !== undefined) cambios.cantidad = op.cantidad
      if (op.precio_unitario !== undefined) cambios.precio_unitario = Math.round(op.precio_unitario)
      if (op.descripcion !== undefined) cambios.descripcion = op.descripcion
      if (Object.keys(cambios).length === 0) continue
      const { error } = await supabase.from('partidas_proyecto').update(cambios)
        .eq('id', op.id).eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
      if (!error) aplicadas++
    }

    if (op.accion === 'eliminar') {
      await supabase.from('partidas_proyecto').delete()
        .eq('parent_id', op.id).eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
      const { error } = await supabase.from('partidas_proyecto').delete()
        .eq('id', op.id).eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
      if (!error) aplicadas++
    }

    if (op.accion === 'ajustar_pct') {
      const factor = 1 + op.pct / 100
      const nf = op.filtro ? normalizar(op.filtro) : ''
      const grupoDe = (p: PartidaActual) =>
        p.parent_id ? partidas.find(x => x.id === p.parent_id)?.descripcion ?? '' : ''
      const objetivo = partidas.filter(p => {
        if (p.es_grupo || hijosDe(p.id).length > 0) return false
        if (!nf) return true
        return normalizar(p.descripcion).includes(nf) || normalizar(grupoDe(p)).includes(nf)
      })
      for (const p of objetivo) {
        const { error } = await supabase.from('partidas_proyecto')
          .update({ precio_unitario: Math.round((Number(p.precio_unitario) || 0) * factor) })
          .eq('id', p.id).eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
        if (!error) aplicadas++
      }
      if (objetivo.length === 0 && nf) {
        edicion.resumen += ' (ninguna partida calzó con el filtro)'
      }
    }
  }

  // ─── Recalcular valor del proyecto (neto = suma de hojas) ───
  const { data: despues } = await supabase
    .from('partidas_proyecto').select('id, parent_id, cantidad, precio_unitario')
    .eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
  const todas = despues ?? []
  const tieneHijos = new Set(todas.filter(p => p.parent_id).map(p => p.parent_id))
  const neto = todas
    .filter(p => !tieneHijos.has(p.id))
    .reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0), 0)
  await supabase.from('proyectos').update({ valor: Math.round(neto) })
    .eq('id', proyecto_id).eq('user_id', ownerId)

  return NextResponse.json({
    resumen: edicion.resumen,
    aplicadas,
    neto: Math.round(neto),
    proveedor: provUsado,
  })
}

// app/api/copiloto/presupuesto/route.ts
// POST { descripcion } → genera presupuesto (IA o demo), crea proyecto +
// partidas jerárquicas en las tablas EXISTENTES y devuelve { proyecto_id }.

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PresupuestoIASchema, netoDe, type PresupuestoIA } from '@/lib/copiloto/schema'
import { generarDemo, type CatItem } from '@/lib/copiloto/demo'
import { proveedorActivo, completarJSON, extraerJSON } from '@/lib/copiloto/ia'
import { promptPresupuesto, reintentoInvalido } from '@/lib/copiloto/prompt'

const BodySchema = z.object({ descripcion: z.string().min(8).max(4000) })

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: 'Describe el trabajo con al menos una frase (mín. 8 caracteres).' }, { status: 400 })
  }
  const descripcion = body.data.descripcion.trim()

  // Catálogo real del usuario → contexto de precios
  const { data: catRows } = await supabase
    .from('catalogo_partidas')
    .select('descripcion, unidad, precio_unitario_ref')
    .eq('user_id', ownerId)
    .order('orden', { ascending: true })
  const catalogo: CatItem[] = (catRows ?? []) as CatItem[]

  // ─── Generación: IA real con validación + fallback demo ───
  const prov = proveedorActivo()
  let pres: PresupuestoIA
  let provUsado: string = prov

  if (prov === 'demo') {
    pres = generarDemo(descripcion, catalogo)
  } else {
    try {
      const system = promptPresupuesto(catalogo)
      let raw = await completarJSON(system, descripcion, 4000)
      let parsed = PresupuestoIASchema.safeParse(extraerJSON(raw))
      if (!parsed.success) {
        // Un reintento con el error de validación
        raw = await completarJSON(system, `${descripcion}\n\n${reintentoInvalido(parsed.error.message.slice(0, 500))}`, 4000)
        parsed = PresupuestoIASchema.safeParse(extraerJSON(raw))
      }
      if (!parsed.success) throw new Error('Respuesta IA inválida tras reintento')
      pres = parsed.data
    } catch (e) {
      console.error('[copiloto] IA falló, fallback a demo:', e)
      pres = generarDemo(descripcion, catalogo)
      provUsado = 'demo (fallback)'
    }
  }

  const neto = netoDe(pres)

  // ─── Persistir: proyecto + partidas jerárquicas ───
  const { data: proy, error: errProy } = await supabase
    .from('proyectos')
    .insert({
      nombre: pres.nombre_proyecto,
      cliente: '',
      descripcion,
      valor: neto,
      avance: 0,
      estado: 'cotizacion',
      user_id: ownerId,
    })
    .select()
    .single()
  if (errProy || !proy) {
    return NextResponse.json({ error: errProy?.message ?? 'No se pudo crear el proyecto' }, { status: 500 })
  }

  let orden = 0
  for (const grupo of pres.grupos) {
    const { data: padre, error: errPadre } = await supabase
      .from('partidas_proyecto')
      .insert({
        proyecto_id: proy.id, parent_id: null, orden: orden++,
        descripcion: grupo.nombre, unidad: 'gl', cantidad: 0,
        precio_unitario: 0, avance: 0, es_grupo: true, user_id: ownerId,
      })
      .select('id')
      .single()
    if (errPadre || !padre) continue

    const hijos = grupo.partidas.map(p => ({
      proyecto_id: proy.id, parent_id: padre.id, orden: orden++,
      descripcion: p.descripcion, unidad: p.unidad,
      cantidad: p.cantidad, precio_unitario: Math.round(p.precio_unitario),
      avance: 0, es_grupo: false, user_id: ownerId,
      notas: p.origen_precio === 'catalogo' ? 'precio: catálogo' : 'precio: referencia IA',
    }))
    await supabase.from('partidas_proyecto').insert(hijos)
  }

  return NextResponse.json({
    proyecto_id: proy.id,
    nombre: pres.nombre_proyecto,
    grupos: pres.grupos.length,
    partidas: pres.grupos.reduce((s, g) => s + g.partidas.length, 0),
    neto,
    proveedor: provUsado,
  })
}

// app/api/recepciones-oc/route.ts
// Recepción por línea de una orden de compra: ingresa a bodega y genera el gasto.
//   POST { orden_id, fecha, documento, items: [{ linea_id, cantidad, a_bodega }] }
//   DELETE { id }  → revierte una recepción (y su entrada a bodega)
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { RecepcionSchema, validar } from '@/lib/validar'
import { cargarOC, registrarRecepcion, sincronizarOC } from '@/lib/compras-server'
import { traerTodo } from '@/lib/costos-server'
import { materialQueQuedaNegativo } from '@/lib/bodega'
import { validarRecepcion } from '@/lib/recepciones'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(RecepcionSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { orden_id, items, fecha, documento, notas } = v.data

  try {
    const { oc, lineas, recepciones } = await cargarOC(supabase, ownerId, orden_id)
    if (!oc) return NextResponse.json({ error: 'Orden de compra no encontrada' }, { status: 404 })
    if (oc.estado === 'anulada') return NextResponse.json({ error: 'La orden está anulada' }, { status: 400 })
    const error = validarRecepcion(lineas, recepciones, items)
    if (error) return NextResponse.json({ error }, { status: 400 })

    await registrarRecepcion(supabase, ownerId, oc, lineas, items, { fecha, documento, notas })
    return NextResponse.json(await sincronizarOC(supabase, ownerId, orden_id))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error registrando la recepción' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  try {
    const { data: rec } = await supabase
      .from('recepciones_oc').select('id, orden_id').eq('id', id).eq('user_id', ownerId).maybeSingle()
    if (!rec) return NextResponse.json({ error: 'Recepción no encontrada' }, { status: 404 })

    // El material ya pudo consumirse o traspasarse
    const { data: entradas } = await supabase
      .from('bodega_movimientos').select('id, proyecto_id').eq('recepcion_id', id).eq('user_id', ownerId)
    const proyectoId = entradas?.[0]?.proyecto_id
    if (proyectoId) {
      const movs = await traerTodo<any>((d, h) => supabase.from('bodega_movimientos')
        .select('id, material, unidad, cantidad, costo_unitario, fecha, created_at')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('id').range(d, h))
      const material = materialQueQuedaNegativo(movs, entradas.map((e: any) => e.id))
      if (material) {
        return NextResponse.json({ error: `No se puede revertir: "${material}" ya se consumió o traspasó de la bodega` }, { status: 400 })
      }
      const { error: eB } = await supabase.from('bodega_movimientos').delete().eq('recepcion_id', id).eq('user_id', ownerId)
      if (eB) return NextResponse.json({ error: eB.message }, { status: 500 })
    }

    const { error } = await supabase.from('recepciones_oc').delete().eq('id', id).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(await sincronizarOC(supabase, ownerId, rec.orden_id))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error revirtiendo la recepción' }, { status: 500 })
  }
}

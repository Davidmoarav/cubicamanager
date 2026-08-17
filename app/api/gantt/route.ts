// app/api/gantt/route.ts
// PUT: actualizar fechas/responsable de una etapa (partidas_proyecto).
// Requiere sql/37_gantt_comentarios.sql ejecutado en Supabase.

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')

const BodySchema = z.object({
  etapa_id: z.string().min(1),
  fecha_inicio: fechaISO.nullish().or(z.literal('')),
  fecha_fin: fechaISO.nullish().or(z.literal('')),
  responsable: z.string().max(80).nullish(),
})

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!v.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { etapa_id, fecha_inicio, fecha_fin, responsable } = v.data

  if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) {
    return NextResponse.json({ error: 'La fecha de término no puede ser anterior al inicio.' }, { status: 400 })
  }

  const cambios: Record<string, unknown> = {}
  if (fecha_inicio !== undefined) cambios.fecha_inicio = fecha_inicio || null
  if (fecha_fin !== undefined) cambios.fecha_fin = fecha_fin || null
  if (responsable !== undefined) cambios.responsable = responsable || null

  const { data, error } = await supabase
    .from('partidas_proyecto')
    .update(cambios)
    .eq('id', etapa_id)
    .eq('user_id', ownerId)
    .select('id, fecha_inicio, fecha_fin, responsable')
    .single()

  if (error) {
    // Columna inexistente o schema cache desactualizado → falta correr la migración
    const msg = /column .* does not exist|could not find .* column|schema cache/i.test(error.message)
      ? '⚠ Falta ejecutar sql/37_gantt_comentarios.sql en Supabase (SQL Editor → Run). Si ya lo hiciste, espera unos segundos y reintenta.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

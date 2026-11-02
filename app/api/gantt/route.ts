// app/api/gantt/route.ts
// PUT: actualizar fechas/responsable de una etapa o partida (partidas_proyecto).
// Requiere sql/37_gantt_comentarios.sql ejecutado en Supabase.
//   GET ?proyecto_id=X  → dependencias de la obra
//   POST / DELETE       → agregar o quitar una dependencia (sql/43)

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { DependenciaSchema, validar } from '@/lib/validar'
import { creaCiclo } from '@/lib/gantt'
import { NextResponse, type NextRequest } from 'next/server'
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
      ? 'Esta función aún no está activada. Avisa al administrador.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('partida_dependencias').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(DependenciaSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { partida_id, depende_de_id, desfase_dias } = v.data

  // Ambas partidas deben ser de la misma obra
  const { data: partidas } = await supabase
    .from('partidas_proyecto').select('id, proyecto_id').eq('user_id', ownerId).in('id', [partida_id, depende_de_id])
  const proyectos = new Set((partidas ?? []).map((p: any) => p.proyecto_id))
  if ((partidas ?? []).length !== 2 || proyectos.size !== 1) {
    return NextResponse.json({ error: 'Las partidas deben ser de la misma obra' }, { status: 400 })
  }
  const proyecto_id = [...proyectos][0] as string

  const { data: actuales, error: eD } = await supabase
    .from('partida_dependencias').select('partida_id, depende_de_id').eq('proyecto_id', proyecto_id).eq('user_id', ownerId)
  if (eD) return NextResponse.json({ error: eD.message }, { status: 500 })
  if (creaCiclo(actuales ?? [], partida_id, depende_de_id)) {
    return NextResponse.json({ error: 'Esa dependencia cierra un ciclo: una tarea terminaría esperándose a sí misma' }, { status: 400 })
  }

  const { data, error } = await supabase.from('partida_dependencias')
    .insert({ proyecto_id, partida_id, depende_de_id, desfase_dias: desfase_dias ?? 0, user_id: ownerId })
    .select().single()
  if (error) {
    const repetida = /duplicate key|unique/i.test(error.message)
    return NextResponse.json({ error: repetida ? 'Esa dependencia ya existe' : error.message }, { status: repetida ? 400 : 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { error } = await supabase.from('partida_dependencias').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

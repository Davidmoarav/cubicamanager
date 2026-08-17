// app/api/comentarios-proyecto/route.ts
// Bitácora / comentarios del proyecto (Fase 4).
// Requiere sql/37_gantt_comentarios.sql ejecutado en Supabase.

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const faltaMigracion = (msg: string) =>
  /relation .* does not exist|could not find|schema cache/i.test(msg)
    ? '⚠ Falta ejecutar sql/37_gantt_comentarios.sql en Supabase (SQL Editor → Run). Si ya lo hiciste, espera unos segundos y reintenta.'
    : msg

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('proyecto_comentarios')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: faltaMigracion(error.message) }, { status: 500 })
  return NextResponse.json(data ?? [])
}

const PostSchema = z.object({
  proyecto_id: z.string().min(1),
  texto: z.string().min(1).max(2000),
})

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = PostSchema.safeParse(await req.json().catch(() => ({})))
  if (!v.success) return NextResponse.json({ error: 'Escribe un comentario.' }, { status: 400 })

  // El proyecto debe ser de esta organización
  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('proyecto_comentarios')
    .insert({
      proyecto_id: v.data.proyecto_id,
      texto: v.data.texto.trim(),
      autor: user.email ?? 'usuario',
      user_id: ownerId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: faltaMigracion(error.message) }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabase
    .from('proyecto_comentarios')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

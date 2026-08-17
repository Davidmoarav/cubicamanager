// app/api/share/route.ts
// Gestión del link público del proyecto (Fase 5).
// POST crea/actualiza el snapshot · GET consulta · DELETE desactiva.
// Requiere sql/38_portal_cliente.sql ejecutado en Supabase.

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { armarSnapshot } from '@/lib/portal'

const faltaMigracion = (msg: string) =>
  /relation .* does not exist|could not find|schema cache/i.test(msg)
    ? '⚠ Falta ejecutar sql/38_portal_cliente.sql en Supabase (SQL Editor → Run). Si ya lo hiciste, espera unos segundos y reintenta.'
    : msg

const urlBase = (req: NextRequest) =>
  process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('proyecto_share')
    .select('token, activo, actualizado_en')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', ownerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: faltaMigracion(error.message) }, { status: 500 })
  if (!data) return NextResponse.json(null)
  return NextResponse.json({ ...data, url: `${urlBase(req)}/portal/${data.token}` })
}

const PostSchema = z.object({ proyecto_id: z.string().min(1) })

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = PostSchema.safeParse(await req.json().catch(() => ({})))
  if (!v.success) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })
  const proyectoId = v.data.proyecto_id

  // ─── Datos del proyecto (todo scoped al owner) ───
  const [{ data: proyecto }, { data: partidas }, { data: eps }, { data: empresa }] = await Promise.all([
    supabase.from('proyectos').select('*').eq('id', proyectoId).eq('user_id', ownerId).maybeSingle(),
    supabase.from('partidas_proyecto').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('orden', { ascending: true }),
    supabase.from('estados_pago').select('numero, fecha, periodo, estado, total').eq('proyecto_id', proyectoId).eq('user_id', ownerId),
    supabase.from('empresa_config').select('razon_social, telefono, email').eq('user_id', ownerId).maybeSingle(),
  ])
  if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  let cliente: { razon_social?: string } | null = null
  if (proyecto.cliente_id) {
    const { data: c } = await supabase
      .from('clientes').select('razon_social').eq('id', proyecto.cliente_id).eq('user_id', ownerId).maybeSingle()
    cliente = c
  }

  const datos = armarSnapshot({
    proyecto,
    partidas: (partidas ?? []) as any,
    eps: (eps ?? []) as any,
    empresa,
    cliente,
  })

  // ─── Upsert conservando el token si ya existe ───
  const { data: existente } = await supabase
    .from('proyecto_share').select('token').eq('proyecto_id', proyectoId).eq('user_id', ownerId).maybeSingle()

  const token = existente?.token ?? crypto.randomUUID().replace(/-/g, '')

  const { error } = await supabase
    .from('proyecto_share')
    .upsert({
      proyecto_id: proyectoId,
      token,
      activo: true,
      datos,
      actualizado_en: new Date().toISOString(),
      user_id: ownerId,
    }, { onConflict: 'proyecto_id' })

  if (error) return NextResponse.json({ error: faltaMigracion(error.message) }, { status: 500 })
  return NextResponse.json({ token, activo: true, url: `${urlBase(req)}/portal/${token}` })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { proyecto_id } = await req.json().catch(() => ({}))
  if (!proyecto_id) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { error } = await supabase
    .from('proyecto_share')
    .update({ activo: false })
    .eq('proyecto_id', proyecto_id)
    .eq('user_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

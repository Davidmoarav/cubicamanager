// app/api/gastos-obra/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId, getRolActual } from '@/lib/roles'
import { ocultarSueldos } from '@/lib/imputacion-sueldos'
import { NextResponse, type NextRequest } from 'next/server'

// ─── GET: gastos de un proyecto ───────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('gastos_obra')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', ownerId)
    .order('fecha', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const info = await getRolActual(supabase)
  return NextResponse.json(info?.rol === 'jefe_obra' ? ocultarSueldos(data ?? []) : data ?? [])
}

// ─── POST: crear gasto ────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  if (!body.proyecto_id || !(body.descripcion || '').trim()) {
    return NextResponse.json({ error: 'Faltan proyecto y descripción' }, { status: 400 })
  }

  // FK: el proyecto debe pertenecer a ESTA organización
  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', body.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('gastos_obra')
    .insert({
      proyecto_id: body.proyecto_id,
      partida_id:  body.partida_id || null,
      fecha:       body.fecha || new Date().toISOString().split('T')[0],
      categoria:   body.categoria || 'materiales',
      descripcion: body.descripcion,
      monto:       Number(body.monto) || 0,
      proveedor:   body.proveedor || null,
      documento:   body.documento || null,
      user_id:     user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { error } = await supabase
    .from('gastos_obra')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
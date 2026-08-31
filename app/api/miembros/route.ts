// app/api/miembros/route.ts
// Gestión de usuarios de la organización. Solo el administrador.
import { createServerSupabase } from '@/lib/supabase-server'
import { getRolActual } from '@/lib/roles'
import { NextResponse } from 'next/server'

const ROLES_VALIDOS = ['admin', 'contador', 'jefe_obra']

// Solo el dueño/admin de la organización puede gestionar miembros
async function soloAdmin(supabase: any) {
  const info = await getRolActual(supabase)
  if (!info) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (info.rol !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo el administrador puede gestionar usuarios' }, { status: 403 }) }
  }
  return { info }
}

export async function GET() {
  const supabase = await createServerSupabase()
  const { error: denied, info } = await soloAdmin(supabase)
  if (denied) return denied

  const { data, error } = await supabase
    .from('miembros')
    .select('id, member_email, member_user_id, rol, estado, created_at')
    .eq('owner_id', info!.ownerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Invitar a un usuario (queda pendiente hasta que se registre con ese email)
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const { error: denied, info } = await soloAdmin(supabase)
  if (denied) return denied

  const body = await req.json()
  const email = String(body.email || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const rol = String(body.rol || 'jefe_obra')

  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (!ROLES_VALIDOS.includes(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (email === (info!.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'Ese es tu propio email' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('miembros')
    .insert({ owner_id: info!.ownerId, member_email: email, rol, estado: 'pendiente' })
    .select('id, member_email, member_user_id, rol, estado, created_at')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese email ya fue invitado' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// Cambiar rol o estado (activo / suspendido)
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const { error: denied, info } = await soloAdmin(supabase)
  if (denied) return denied

  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const update: any = {}
  if (body.rol !== undefined) {
    if (!ROLES_VALIDOS.includes(body.rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    update.rol = body.rol
  }
  if (body.estado !== undefined) {
    if (!['pendiente', 'activo', 'suspendido'].includes(body.estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }
    update.estado = body.estado
  }

  const { data, error } = await supabase
    .from('miembros').update(update)
    .eq('id', body.id).eq('owner_id', info!.ownerId)
    .select('id, member_email, member_user_id, rol, estado, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Quitar el acceso de un usuario
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const { error: denied, info } = await soloAdmin(supabase)
  if (denied) return denied

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabase
    .from('miembros').delete().eq('id', id).eq('owner_id', info!.ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
// app/api/prevencion/route.ts
// Prevención de riesgos por obra: charlas, entrega de EPP, inspecciones e incidentes.
// Los respaldos son documentos de la obra (documentos.prevencion_id).
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { PrevencionSchema, validar, validarParcial } from '@/lib/validar'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const [{ data, error }, { data: docs }] = await Promise.all([
    supabase.from('prevencion_registros').select('*')
      .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('fecha', { ascending: false }),
    supabase.from('documentos').select('id, nombre, prevencion_id')
      .eq('proyecto_id', proyectoId).eq('user_id', ownerId).not('prevencion_id', 'is', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []).map((r: any) => ({
    ...r,
    adjuntos: (docs ?? []).filter((d: any) => d.prevencion_id === r.id).length,
  })))
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(PrevencionSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // La gravedad y los días perdidos solo aplican a incidentes, que parten abiertos
  const esIncidente = v.data.tipo === 'incidente'
  const { data, error } = await supabase.from('prevencion_registros').insert({
    ...v.data,
    gravedad: esIncidente ? (v.data.gravedad ?? 'leve') : null,
    dias_perdidos: esIncidente ? (v.data.dias_perdidos ?? 0) : 0,
    estado: v.data.estado ?? (esIncidente ? 'abierto' : 'cerrado'),
    user_id: ownerId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const v = validarParcial(PrevencionSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id, ...cambios } = v.data   // un registro no cambia de obra

  const { data, error } = await supabase.from('prevencion_registros')
    .update(cambios).eq('id', body.id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  const { error } = await supabase.from('prevencion_registros').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

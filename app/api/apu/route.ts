// app/api/apu/route.ts
// Análisis de precio unitario de una partida (cálculo en lib/apu.ts). Los materiales
// están en partida_materiales; aquí se manejan la cuadrilla, los equipos y el rendimiento.
//   GET ?partida_id=X                     → partida, materiales, recursos y cálculo
//   POST                                  → agrega un recurso
//   PUT { partida_id, rendimiento_dia }   → guarda el rendimiento
//   PUT { partida_id, aplicar: true }     → lleva el APU a los costos y precio de la partida
//   DELETE { id }                         → quita un recurso
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { RecursoAPUSchema, validar } from '@/lib/validar'
import { calcularAPU } from '@/lib/apu'
import { NextResponse, type NextRequest } from 'next/server'

async function cargarAPU(supabase: any, ownerId: string, partidaId: string) {
  const { data: partida } = await supabase
    .from('partidas_proyecto').select('*').eq('id', partidaId).eq('user_id', ownerId).maybeSingle()
  if (!partida) return null

  const [materiales, recursos, proyecto, hijos] = await Promise.all([
    supabase.from('partida_materiales').select('*').eq('partida_id', partidaId).eq('user_id', ownerId).order('created_at'),
    supabase.from('partida_apu_recursos').select('*').eq('partida_id', partidaId).eq('user_id', ownerId).order('created_at'),
    supabase.from('proyectos').select('markup_global').eq('id', partida.proyecto_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('partidas_proyecto').select('id').eq('parent_id', partidaId).eq('user_id', ownerId).limit(1),
  ])
  const error = materiales.error || recursos.error
  if (error) throw new Error(error.message)

  const markup = Number(partida.markup_pct ?? proyecto.data?.markup_global ?? 20)
  return {
    partida,
    materiales: materiales.data ?? [],
    recursos: recursos.data ?? [],
    markup,
    es_grupo: !!partida.es_grupo || (hijos.data ?? []).length > 0,
    calculo: calcularAPU(partida, materiales.data ?? [], recursos.data ?? [], markup),
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const partidaId = req.nextUrl.searchParams.get('partida_id')
  if (!partidaId) return NextResponse.json({ error: 'Falta partida_id' }, { status: 400 })

  try {
    const apu = await cargarAPU(supabase, ownerId, partidaId)
    if (!apu) return NextResponse.json({ error: 'Partida no encontrada' }, { status: 404 })
    return NextResponse.json(apu)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error cargando el APU' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(RecursoAPUSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: partida } = await supabase
    .from('partidas_proyecto').select('id').eq('id', v.data.partida_id).eq('user_id', ownerId).maybeSingle()
  if (!partida) return NextResponse.json({ error: 'Partida no encontrada' }, { status: 404 })

  const { data, error } = await supabase.from('partida_apu_recursos').insert({ ...v.data, user_id: ownerId }).select().single()
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

  const { partida_id, rendimiento_dia, aplicar } = await req.json()
  if (!partida_id) return NextResponse.json({ error: 'Falta partida_id' }, { status: 400 })

  if (rendimiento_dia !== undefined) {
    const valor = rendimiento_dia === null || rendimiento_dia === '' ? null : Number(rendimiento_dia)
    if (valor !== null && !(valor > 0)) {
      return NextResponse.json({ error: 'El rendimiento debe ser mayor que 0' }, { status: 400 })
    }
    const { error } = await supabase.from('partidas_proyecto')
      .update({ rendimiento_dia: valor }).eq('id', partida_id).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    const apu = await cargarAPU(supabase, ownerId, partida_id)
    if (!apu) return NextResponse.json({ error: 'Partida no encontrada' }, { status: 404 })
    if (!aplicar) return NextResponse.json(apu)

    if (apu.es_grupo) {
      return NextResponse.json({ error: 'Un grupo no lleva costos propios: aplica el APU a sus partidas' }, { status: 400 })
    }
    if (apu.calculo.falta_rendimiento) {
      return NextResponse.json({ error: 'Falta el rendimiento: sin él no se puede llevar la cuadrilla a la unidad' }, { status: 400 })
    }
    if (apu.calculo.costo_unitario <= 0) {
      return NextResponse.json({ error: 'El APU no tiene costos para aplicar' }, { status: 400 })
    }

    const { costo_material_unit, costo_mo_unit, costo_unitario, precio_unitario } = apu.calculo
    const { error } = await supabase.from('partidas_proyecto')
      .update({ costo_material_unit, costo_mo_unit, costo_unitario, precio_unitario })
      .eq('id', partida_id).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(await cargarAPU(supabase, ownerId, partida_id))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error aplicando el APU' }, { status: 500 })
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
  const { error } = await supabase.from('partida_apu_recursos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

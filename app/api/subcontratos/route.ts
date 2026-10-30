// app/api/subcontratos/route.ts
// Subcontratos por obra, con sus estados de pago y resumen (lib/subcontratos.ts).
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { SubcontratoSchema, validar, validarParcial } from '@/lib/validar'
import { partidaEsDeProyecto } from '@/lib/costos-server'
import { resumenSubcontrato } from '@/lib/subcontratos'
import { NextResponse, type NextRequest } from 'next/server'

const CAMPOS_FIJOS = ['monto_contrato', 'retencion_pct', 'anticipo'] as const

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data: subs, error } = await supabase
    .from('subcontratos').select('*').eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (subs ?? []).map((s: any) => s.id)
  const { data: eps, error: eE } = ids.length
    ? await supabase.from('subcontrato_eps').select('*').eq('user_id', ownerId).in('subcontrato_id', ids).order('numero')
    : { data: [], error: null }
  if (eE) return NextResponse.json({ error: eE.message }, { status: 500 })

  return NextResponse.json((subs ?? []).map((s: any) => {
    const propios = (eps ?? []).filter((e: any) => e.subcontrato_id === s.id)
    return { ...s, eps: propios, resumen: resumenSubcontrato(s, propios) }
  }))
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(SubcontratoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  if (v.data.partida_id && !(await partidaEsDeProyecto(supabase, ownerId, v.data.partida_id, v.data.proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
  }

  const { data, error } = await supabase.from('subcontratos').insert({ ...v.data, user_id: ownerId }).select().single()
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
  const v = validarParcial(SubcontratoSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id, ...cambios } = v.data   // un subcontrato no cambia de obra

  const { data: actual } = await supabase
    .from('subcontratos').select('*').eq('id', body.id).eq('user_id', ownerId).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Subcontrato no encontrado' }, { status: 404 })
  const { data: eps } = await supabase
    .from('subcontrato_eps').select('*').eq('subcontrato_id', body.id).eq('user_id', ownerId)

  // Los EP ya calculados dependen de estos valores
  if ((eps ?? []).length > 0 && CAMPOS_FIJOS.some(c => cambios[c] !== undefined && Number(cambios[c]) !== Number(actual[c]))) {
    return NextResponse.json({ error: 'Ya hay estados de pago: no se puede cambiar el monto, la retención ni el anticipo' }, { status: 400 })
  }
  if (cambios.partida_id && !(await partidaEsDeProyecto(supabase, ownerId, cambios.partida_id, actual.proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
  }
  const resumen = resumenSubcontrato(actual, eps ?? [])
  if (cambios.retencion_devuelta !== undefined && cambios.retencion_devuelta > resumen.retenido) {
    return NextResponse.json({ error: 'No se puede devolver más de lo retenido' }, { status: 400 })
  }
  if (cambios.estado === 'anulado' && resumen.ejecutado > 0) {
    return NextResponse.json({ error: 'Tiene estados de pago aprobados: revísalos antes de anularlo' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('subcontratos').update(cambios).eq('id', body.id).eq('user_id', ownerId).select().single()
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
  const { data: eps } = await supabase
    .from('subcontrato_eps').select('estado').eq('subcontrato_id', id).eq('user_id', ownerId)
  if ((eps ?? []).some((e: any) => e.estado !== 'borrador')) {
    return NextResponse.json({ error: 'Tiene estados de pago aprobados o pagados: no se puede eliminar' }, { status: 400 })
  }
  const { error } = await supabase.from('subcontratos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

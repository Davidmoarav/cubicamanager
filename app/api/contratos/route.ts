// app/api/contratos/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { ContratoSchema, validar, validarParcial } from '@/lib/validar'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id
  const { data, error } = await supabase.from('contratos').select('*').eq('user_id', ownerId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contratos = data ?? []
  // Ejecutado (facturado) de cada contrato enlazado, desde los estados de pago del proyecto
  const proyectoIds = [...new Set(contratos.filter((c: any) => c.proyecto_id).map((c: any) => c.proyecto_id))]
  const ejecutado: Record<string, number> = {}
  if (proyectoIds.length) {
    const { data: eps } = await supabase
      .from('estados_pago').select('proyecto_id, bruto').eq('user_id', ownerId).in('proyecto_id', proyectoIds as string[])
    for (const ep of eps ?? []) ejecutado[ep.proyecto_id] = (ejecutado[ep.proyecto_id] || 0) + (Number(ep.bruto) || 0)
  }

  const result = contratos.map((c: any) => ({
    ...c,
    ejecutado: c.proyecto_id ? (ejecutado[c.proyecto_id] || 0) : null,
  }))
  return NextResponse.json(result)
}

// El tipo del contrato con el mandante define cómo se cobra la obra enlazada (sql/56).
// Solo si la obra aún no tiene estados de pago; si falla (sin la migración), no impide guardar.
const MODALIDAD_POR_TIPO: Record<string, string> = {
  'Suma alzada': 'suma_alzada', 'Serie de precios': 'serie_precios', 'Administración delegada': 'administracion',
}
async function pasarModalidad(supabase: any, ownerId: string, contrato: any) {
  const modalidad = MODALIDAD_POR_TIPO[contrato?.tipo]
  if (!contrato?.proyecto_id || !modalidad) return
  const { data: eps } = await supabase.from('estados_pago').select('id')
    .eq('proyecto_id', contrato.proyecto_id).eq('user_id', ownerId).neq('estado', 'rechazado').limit(1)
  if ((eps ?? []).length > 0) return
  await supabase.from('proyectos').update({ modalidad_contrato: modalidad })
    .eq('id', contrato.proyecto_id).eq('user_id', ownerId)
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id
  const v = validar(ContratoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabase.from('contratos').insert({ ...v.data, user_id: ownerId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pasarModalidad(supabase, ownerId, data).catch(() => {})
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
  const v = validarParcial(ContratoSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabase.from('contratos').update(v.data).eq('id', body.id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pasarModalidad(supabase, ownerId, data).catch(() => {})
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
  const { error } = await supabase.from('contratos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
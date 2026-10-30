// app/api/subcontratos/ep/route.ts
// Estados de pago de un subcontrato. Aprobados o pagados, su bruto es gasto de obra.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { EPSubcontratoSchema, validar } from '@/lib/validar'
import { atribuirFactura, sincronizarGastoEP } from '@/lib/gastos-server'
import { calcularEP } from '@/lib/subcontratos'
import { NextResponse } from 'next/server'

const ESTADOS = ['borrador', 'aprobado', 'pagado']

async function cargarSubcontrato(supabase: any, ownerId: string, id: string) {
  const { data } = await supabase.from('subcontratos').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
  return data
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(EPSubcontratoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { subcontrato_id, avance_acumulado, fecha, notas } = v.data

  const sub = await cargarSubcontrato(supabase, ownerId, subcontrato_id)
  if (!sub) return NextResponse.json({ error: 'Subcontrato no encontrado' }, { status: 404 })
  if (sub.estado !== 'vigente') return NextResponse.json({ error: 'El subcontrato no está vigente' }, { status: 400 })

  const { data: previos, error: eP } = await supabase
    .from('subcontrato_eps').select('*').eq('subcontrato_id', subcontrato_id).eq('user_id', ownerId).order('numero')
  if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })

  const calc = calcularEP(sub, previos ?? [], avance_acumulado)
  if ('error' in calc) return NextResponse.json({ error: calc.error }, { status: 400 })

  const numero = (previos ?? []).reduce((m: number, e: any) => Math.max(m, e.numero), 0) + 1
  const { data, error } = await supabase.from('subcontrato_eps').insert({
    ...calc, subcontrato_id, numero, fecha, notas: notas || null, estado: 'borrador', user_id: ownerId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Cambia el estado o la factura asociada
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id, estado, factura_id } = await req.json()
  const { data: ep } = await supabase.from('subcontrato_eps').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!ep) return NextResponse.json({ error: 'Estado de pago no encontrado' }, { status: 404 })
  const sub = await cargarSubcontrato(supabase, ownerId, ep.subcontrato_id)
  if (!sub) return NextResponse.json({ error: 'Subcontrato no encontrado' }, { status: 404 })

  const update: any = {}
  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    update.estado = estado
  }
  if (factura_id !== undefined) update.factura_id = factura_id || null

  const { data, error } = await supabase
    .from('subcontrato_eps').update(update).eq('id', id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    if (ep.factura_id && ep.factura_id !== data.factura_id) {
      await supabase.from('facturas').update({ proyecto: null, proyecto_id: null, partida_id: null })
        .eq('id', ep.factura_id).eq('user_id', ownerId)
    }
    if (data.factura_id) {
      const { data: proy } = await supabase
        .from('proyectos').select('nombre').eq('id', sub.proyecto_id).eq('user_id', ownerId).maybeSingle()
      await atribuirFactura(supabase, ownerId, data.factura_id, {
        proyecto_id: sub.proyecto_id, proyecto: proy?.nombre, partida_id: sub.partida_id,
      })
    }
    await sincronizarGastoEP(supabase, ownerId, data, sub)
  } catch (e: any) {
    return NextResponse.json({ ...data, aviso: `El estado de pago quedó guardado, pero no se pudo actualizar el gasto: ${e?.message ?? 'error'}` })
  }
  return NextResponse.json(data)
}

// Solo el último: los siguientes se calculan sobre él
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { data: ep } = await supabase.from('subcontrato_eps').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!ep) return NextResponse.json({ error: 'Estado de pago no encontrado' }, { status: 404 })
  if (ep.estado === 'pagado') return NextResponse.json({ error: 'Un estado de pago pagado no se puede eliminar' }, { status: 400 })

  const { data: todos } = await supabase
    .from('subcontrato_eps').select('numero').eq('subcontrato_id', ep.subcontrato_id).eq('user_id', ownerId)
  if ((todos ?? []).some((e: any) => e.numero > ep.numero)) {
    return NextResponse.json({ error: 'Solo se puede eliminar el último estado de pago' }, { status: 400 })
  }

  await supabase.from('gastos_obra').delete().eq('subcontrato_ep_id', id).eq('user_id', ownerId)
  const { error } = await supabase.from('subcontrato_eps').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

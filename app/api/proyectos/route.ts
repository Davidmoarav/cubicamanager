// app/api/proyectos/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { ProyectoSchema, validar, validarParcial } from '@/lib/validar'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { data, error } = await supabase.from('proyectos').select('*').eq('user_id', ownerId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(ProyectoSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabase.from('proyectos').insert({ ...v.data, user_id: ownerId }).select().single()
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
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const v = validarParcial(ProyectoSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const rest = v.data
  // La modalidad define cómo se descuenta lo cobrado: no se cambia con estados de pago vigentes
  if (rest.modalidad_contrato) {
    const { data: actual } = await supabase.from('proyectos').select('modalidad_contrato').eq('id', id).eq('user_id', ownerId).maybeSingle()
    if (actual && (actual.modalidad_contrato ?? 'suma_alzada') !== rest.modalidad_contrato) {
      const { data: eps } = await supabase.from('estados_pago').select('id')
        .eq('proyecto_id', id).eq('user_id', ownerId).neq('estado', 'rechazado').limit(1)
      if ((eps ?? []).length > 0) {
        return NextResponse.json({ error: 'La obra ya tiene estados de pago: no se puede cambiar la modalidad del contrato' }, { status: 400 })
      }
    }
  }
  const { data, error } = await supabase.from('proyectos').update(rest).eq('id', id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se renombró la obra, actualizar el nombre en sus facturas y OC
  // (el enlace real es por id, pero el texto se mantiene coherente)
  if (rest.nombre && data?.nombre) {
    await supabase.from('facturas')
      .update({ proyecto: data.nombre })
      .eq('proyecto_id', id).eq('user_id', ownerId)
    await supabase.from('ordenes_compra')
      .update({ proyecto: data.nombre })
      .eq('proyecto_id', id).eq('user_id', ownerId)
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

  // Archivos de la obra: la base los borra en cascada, pero el Storage no. Se juntan antes de borrar.
  const rutas = new Set<string>()
  const [docs, gastos] = await Promise.all([
    supabase.from('documentos').select('archivo_path').eq('proyecto_id', id).eq('user_id', ownerId),
    supabase.from('gastos_obra').select('archivo_path').eq('proyecto_id', id).eq('user_id', ownerId).not('archivo_path', 'is', null),
  ])
  for (const r of [...(docs.data ?? []), ...(gastos.data ?? [])]) if (r?.archivo_path) rutas.add(r.archivo_path)
  // Y lo que haya quedado suelto en la carpeta de la obra
  for (const sub of ['', 'gastos', 'evidencias']) {
    const carpeta = `${ownerId}/${id}${sub ? '/' + sub : ''}`
    const { data: lista } = await supabase.storage.from('proyecto-docs').list(carpeta, { limit: 1000 })
    for (const f of lista ?? []) if (f.id) rutas.add(`${carpeta}/${f.name}`)
  }

  const { error } = await supabase.from('proyectos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // La obra ya no existe: si algún archivo no se puede borrar, no se revierte, solo se avisa
  const todas = [...rutas]
  let fallidos = 0
  for (let i = 0; i < todas.length; i += 100) {
    const { error: eS } = await supabase.storage.from('proyecto-docs').remove(todas.slice(i, i + 100))
    if (eS) fallidos += Math.min(100, todas.length - i)
  }
  return NextResponse.json({ ok: true, archivos: todas.length - fallidos, ...(fallidos ? { aviso: `${fallidos} archivos no se pudieron borrar del almacenamiento` } : {}) })
}
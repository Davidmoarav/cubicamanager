// app/api/cotizaciones/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// ─── GET ──────────────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams

  // ── Resumen para métricas (suma partidas en el servidor, columnas mínimas) ──
  if (sp.get('resumen')) {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('estado, partidas:partidas_cotizacion(cantidad, precio_unitario)')
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = data ?? []
    const montoDe = (c: any) => (c.partidas ?? []).reduce((s: number, p: any) => s + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0), 0)
    return NextResponse.json({
      total_count: rows.length,
      aprobadas:   rows.filter((c: any) => c.estado === 'aprobada').length,
      convertidas: rows.filter((c: any) => c.estado === 'convertida').length,
      monto:       rows.filter((c: any) => c.estado !== 'rechazada').reduce((s: number, c: any) => s + montoDe(c), 0),
    })
  }

  // ── Lista paginada / búsqueda / filtro por estado (con partidas para total y edición) ──
  const buscar = sp.get('buscar')
  const estado = sp.get('estado')
  const limit  = Math.min(Number(sp.get('limit')) || 60, 500)

  let q = supabase
    .from('cotizaciones')
    .select('*, partidas:partidas_cotizacion(*)')
    .eq('user_id', user.id)

  if (buscar) {
    const term = buscar.trim().replace(/[,()%*\\]/g, '')
    if (term) q = q.or(`numero.ilike.%${term}%,cliente.ilike.%${term}%,proyecto_nombre.ilike.%${term}%`)
  } else if (estado && estado !== 'todos') {
    q = q.eq('estado', estado)
  }

  q = q.order('created_at', { ascending: false }).limit(buscar ? 40 : limit)
  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map((c) => ({
    ...c,
    partidas: (c.partidas ?? []).sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden),
  }))
  return NextResponse.json(result)
}

function filasPartidas(cotizacionId: string, partidas: Record<string, unknown>[]) {
  return partidas.map((p: Record<string, unknown>, i: number) => ({
    cotizacion_id:   cotizacionId,
    orden:           p.orden ?? i,
    descripcion:     p.descripcion,
    unidad:          p.unidad || 'un',
    cantidad:        Number(p.cantidad) || 0,
    precio_unitario: Number(p.precio_unitario) || 0,
    catalogo_id:     p.catalogo_id || null,
  }))
}

// ─── POST ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { partidas = [], ...cabecera } = body

  const { data: cot, error: e1 } = await supabase
    .from('cotizaciones')
    .insert({ ...cabecera, user_id: user.id })
    .select()
    .single()

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  if (partidas.length > 0) {
    const { error: e2 } = await supabase.from('partidas_cotizacion').insert(filasPartidas(cot.id, partidas))
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  }

  return NextResponse.json(cot)
}

// ─── PUT ──────────────────────────────────────────────────
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, partidas = [], created_at, user_id, ...cabecera } = body

  const { error: e1 } = await supabase
    .from('cotizaciones')
    .update(cabecera)
    .eq('id', id)
    .eq('user_id', user.id)

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  const { error: e2 } = await supabase.from('partidas_cotizacion').delete().eq('cotizacion_id', id)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  if (partidas.length > 0) {
    const { error: e3 } = await supabase.from('partidas_cotizacion').insert(filasPartidas(id, partidas))
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ─── DELETE ───────────────────────────────────────────────
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase
    .from('cotizaciones')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
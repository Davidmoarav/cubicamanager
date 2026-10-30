// app/api/facturas/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { AsignarFacturasSchema, FacturaSchema, validar, validarParcial } from '@/lib/validar'
import { partidaEsDeProyecto } from '@/lib/costos-server'
import { sincronizarOC } from '@/lib/compras-server'
import { sincronizarGastoEP, sincronizarGastoUso } from '@/lib/gastos-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const sp = new URL(req.url).searchParams
  const resumen = sp.get('resumen')
  const periodo = sp.get('periodo')
  const tipo    = sp.get('tipo')
  const buscar  = sp.get('buscar')
  const docTipo = sp.get('doc_tipo')
  const folios  = sp.get('folios')   // lista de folios a resolver (numero -> id)

  // ── Resumen agregado, calculado en el servidor (no trae filas al cliente) ──
  if (resumen) {
    let q = supabase.from('facturas').select('tipo, doc_tipo, estado, monto').eq('user_id', ownerId)
    if (periodo) q = q.eq('periodo', periodo)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = data ?? []
    const ventas  = rows.filter((r: any) => (r.tipo || 'venta') !== 'compra')
    const compras = rows.filter((r: any) => r.tipo === 'compra')
    // Con signo: notas de crédito restan, notas de débito suman
    const sum = (arr: any[]) => arr.reduce((s, r) =>
      s + ((r.doc_tipo === 'nota_credito' ? -1 : 1) * (Number(r.monto) || 0)), 0)
    return NextResponse.json({
      ventas: {
        cobrado:   sum(ventas.filter((r: any) => r.estado === 'pagada')),
        pendiente: sum(ventas.filter((r: any) => r.estado === 'pendiente')),
        vencido:   sum(ventas.filter((r: any) => r.estado === 'vencida')),
        total:     sum(ventas),
        count:     ventas.length,
      },
      compras: { total: sum(compras), count: compras.length },
    })
  }

  // Columnas específicas (evita traer '*')
  const COLS = 'id, numero, cliente, proyecto, proyecto_id, partida_id, tipo, doc_tipo, factura_ref, neto, iva, monto, emision, periodo, estado, created_at'

  // ── Resolver folios a facturas (para pre-llenar la asociación de notas) ──
  if (folios !== null) {
    const lista = folios.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)
    if (lista.length === 0) return NextResponse.json([])
    let q = supabase.from('facturas').select('id, numero, cliente, tipo').eq('user_id', ownerId).in('numero', lista)
    if (tipo) q = q.eq('tipo', tipo)
    if (docTipo) q = q.eq('doc_tipo', docTipo)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // ── Búsqueda server-side (para asociar notas a su factura) ──
  if (buscar !== null) {
    let q = supabase.from('facturas').select(COLS).eq('user_id', ownerId)
    if (tipo) q = q.eq('tipo', tipo)
    if (docTipo) q = q.eq('doc_tipo', docTipo)
    const term = buscar.trim().replace(/[,()%*\\]/g, '')   // sanitizar para el filtro PostgREST
    if (term) q = q.or(`numero.ilike.%${term}%,cliente.ilike.%${term}%`)
    const { data, error } = await q.order('emision', { ascending: false }).limit(40)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // ── Lista: por período (mes) o, sin período, solo las recientes con tope ──
  let q = supabase.from('facturas').select(COLS).eq('user_id', ownerId)
  if (periodo) q = q.eq('periodo', periodo)
  if (tipo) q = q.eq('tipo', tipo)
  q = q.order('emision', { ascending: false })
  if (!periodo) q = q.limit(300)   // sin período no cargamos todo el histórico
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id
  const v = validar(FacturaSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (v.data.partida_id && !(await partidaEsDeProyecto(supabase, ownerId, v.data.partida_id, v.data.proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece al proyecto elegido' }, { status: 400 })
  }
  const { data, error } = await supabase.from('facturas').insert({ ...v.data, user_id: ownerId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id
  const body = await req.json()

  // ── Asignar obra y partida a varios documentos de compra ──
  if (Array.isArray(body.ids)) {
    const a = validar(AsignarFacturasSchema, body)
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 400 })
    const { ids, proyecto_id, partida_id } = a.data

    let proyecto: string | null = null
    if (proyecto_id) {
      const { data: proy } = await supabase
        .from('proyectos').select('nombre').eq('id', proyecto_id).eq('user_id', ownerId).maybeSingle()
      if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
      proyecto = proy.nombre
    }
    if (partida_id && !(await partidaEsDeProyecto(supabase, ownerId, partida_id, proyecto_id))) {
      return NextResponse.json({ error: 'La partida no pertenece al proyecto elegido' }, { status: 400 })
    }

    const { data, error } = await supabase.from('facturas')
      .update({ proyecto, proyecto_id, partida_id: partida_id || null })
      .in('id', ids).eq('user_id', ownerId).eq('tipo', 'compra').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ actualizadas: data?.length ?? 0 })
  }

  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const v = validarParcial(FacturaSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabase.from('facturas').update(v.data).eq('id', body.id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id
  const { id } = await req.json()

  // Lo que dejaba de contar por esta factura debe volver a contar
  const [ordenes, eps, usos] = await Promise.all([
    supabase.from('ordenes_compra').select('id').eq('factura_id', id).eq('user_id', ownerId),
    supabase.from('subcontrato_eps').select('*, subcontrato:subcontratos(*)').eq('factura_id', id).eq('user_id', ownerId),
    supabase.from('equipo_usos').select('*, equipo:equipos(nombre)').eq('factura_id', id).eq('user_id', ownerId),
  ])

  const { error } = await supabase.from('facturas').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    for (const o of ordenes.data ?? []) await sincronizarOC(supabase, ownerId, o.id)
    for (const ep of eps.data ?? []) await sincronizarGastoEP(supabase, ownerId, { ...ep, factura_id: null }, ep.subcontrato)
    for (const u of usos.data ?? []) await sincronizarGastoUso(supabase, ownerId, { ...u, factura_id: null }, u.equipo?.nombre ?? 'Equipo')
  } catch (e: any) {
    return NextResponse.json({ ok: true, aviso: `La factura se eliminó, pero no se pudo actualizar el gasto: ${e?.message ?? 'error'}` })
  }
  return NextResponse.json({ ok: true })
}
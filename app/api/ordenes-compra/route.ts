// app/api/ordenes-compra/route.ts
// Órdenes de compra: cabecera + líneas.
//   ?sugerir=1&proyecto_id=X  → agrega materiales del proyecto (cantidad x rendimiento)
//                               con precio desde los rendimientos, para pre-llenar la OC.
//   ?id=X                     → una OC con sus líneas
//   (sin params)              → lista de OCs
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { partidaEsDeProyecto, partidasSonDeProyecto } from '@/lib/costos-server'
import { cargarOC, conciliacionDeOC, registrarRecepcion, sincronizarOC } from '@/lib/compras-server'
import { atribuirFactura } from '@/lib/gastos-server'
import { pendientes, validarEdicionLineas } from '@/lib/recepciones'
import { NextResponse, type NextRequest } from 'next/server'

const IVA = 0.19

// ─── GET ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const sp = req.nextUrl.searchParams
  const sugerir = sp.get('sugerir')
  const proyectoId = sp.get('proyecto_id')
  const id = sp.get('id')
  const obra = sp.get('obra')   // id de la obra, o 'sin' para las que no tienen

  // ── Sugerencia: materiales agregados del proyecto ──
  if (sugerir && proyectoId) {
    const { data: partidas } = await supabase
      .from('partidas_proyecto').select('id, cantidad').eq('proyecto_id', proyectoId).eq('user_id', ownerId)
    const cantPorPartida: Record<string, number> = {}
    for (const p of partidas ?? []) cantPorPartida[p.id] = Number(p.cantidad) || 0
    const partIds = Object.keys(cantPorPartida)

    // Solo los materiales de las partidas de este proyecto (no todos los del usuario).
    // Por lotes de 100 ids para no exceder el largo de la URL con muchas partidas.
    const mats: any[] = []
    for (let i = 0; i < partIds.length; i += 100) {
      const lote = partIds.slice(i, i + 100)
      const { data } = await supabase.from('partida_materiales')
        .select('material, unidad, rendimiento, precio_unitario, partida_id')
        .in('partida_id', lote).eq('user_id', ownerId)
      if (data) mats.push(...data)
    }

    // Agrupar por material + unidad
    const grupos: Record<string, { material: string; unidad: string; cantidad: number; precio_unitario: number; partidas: Set<string> }> = {}
    for (const m of mats) {
      const necesario = (cantPorPartida[m.partida_id] || 0) * (Number(m.rendimiento) || 0)
      if (necesario <= 0) continue
      const key = `${(m.material || '').trim().toLowerCase()}|${m.unidad || 'un'}`
      if (!grupos[key]) {
        grupos[key] = { material: m.material, unidad: m.unidad || 'un', cantidad: 0, precio_unitario: 0, partidas: new Set() }
      }
      grupos[key].partidas.add(m.partida_id)
      grupos[key].cantidad += necesario
      // precio: el mayor no-cero visto (deberían coincidir entre partidas)
      grupos[key].precio_unitario = Math.max(grupos[key].precio_unitario, Number(m.precio_unitario) || 0)
    }

    const lineas = Object.values(grupos).map(g => ({
      material: g.material,
      unidad: g.unidad,
      cantidad: Math.round(g.cantidad * 100) / 100,
      precio_unitario: g.precio_unitario,
      subtotal: Math.round(g.cantidad * g.precio_unitario),
      // Un material usado en varias partidas queda para imputarlo a mano
      partida_id: g.partidas.size === 1 ? [...g.partidas][0] : null,
    }))
    return NextResponse.json({ lineas })
  }

  // ── Una OC con sus líneas, recepciones y conciliación ──
  if (id) {
    try {
      const { oc, lineas, recepciones } = await cargarOC(supabase, ownerId, id)
      if (!oc) return NextResponse.json({ error: 'Orden de compra no encontrada' }, { status: 404 })
      const conciliacion = await conciliacionDeOC(supabase, ownerId, oc, lineas, recepciones)
      return NextResponse.json({ ...oc, lineas, recepciones, conciliacion })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Error cargando la orden' }, { status: 500 })
    }
  }

  // ── Resumen agregado para las métricas (usa el total guardado) ──
  if (sp.get('resumen')) {
    let qr = supabase.from('ordenes_compra').select('estado, total').eq('user_id', ownerId)
    if (obra === 'sin') qr = qr.is('proyecto_id', null)
    else if (obra) qr = qr.eq('proyecto_id', obra)
    const { data, error } = await qr
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = data ?? []
    return NextResponse.json({
      total_count: rows.length,
      borrador:    rows.filter((o: any) => o.estado === 'borrador').length,
      recibidas:   rows.filter((o: any) => o.estado === 'recibida').length,
      parciales:   rows.filter((o: any) => o.estado === 'parcial').length,
      monto_total: rows.filter((o: any) => o.estado !== 'anulada').reduce((s: number, o: any) => s + (Number(o.total) || 0), 0),
    })
  }

  // ── Lista de OCs (paginada / con búsqueda server-side) ──
  const buscar = sp.get('buscar')
  const limit = Math.min(Number(sp.get('limit')) || 60, 500)
  let q = supabase.from('ordenes_compra').select('*').eq('user_id', ownerId)
  if (obra === 'sin') q = q.is('proyecto_id', null)
  else if (obra) q = q.eq('proyecto_id', obra)
  if (buscar) {
    const term = buscar.trim().replace(/[,()%*\\]/g, '')
    if (term) q = q.or(`proveedor.ilike.%${term}%,proyecto.ilike.%${term}%`)
  }
  q = q.order('numero', { ascending: false }).limit(buscar ? 40 : limit)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── Helper: calcula subtotales + totales desde las líneas ──
function calcTotales(lineasIn: any[]) {
  const lineas = (lineasIn ?? []).map(l => {
    const cantidad = Number(l.cantidad) || 0
    const precio = Number(l.precio_unitario) || 0
    return {
      ...(l.id ? { id: l.id } : {}),
      partida_id: l.partida_id || null,
      material: l.material,
      unidad: l.unidad || 'un',
      cantidad,
      precio_unitario: precio,
      subtotal: Math.round(cantidad * precio),
    }
  })
  const neto = lineas.reduce((s, l) => s + l.subtotal, 0)
  const iva = Math.round(neto * IVA)
  const total = neto + iva
  return { lineas, neto, iva, total }
}

// ─── POST: crear OC ───────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  const { lineas, neto, iva, total } = calcTotales(body.lineas)

  if (body.partida_id && !(await partidaEsDeProyecto(supabase, ownerId, body.partida_id, body.proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece al proyecto elegido' }, { status: 400 })
  }
  if (!(await partidasSonDeProyecto(supabase, ownerId, lineas.map(l => l.partida_id), body.proyecto_id))) {
    return NextResponse.json({ error: 'Una línea tiene una partida de otro proyecto' }, { status: 400 })
  }
  if (body.estado === 'parcial') {
    return NextResponse.json({ error: 'El estado parcial se calcula según lo recibido' }, { status: 400 })
  }

  // Correlativo por usuario
  const { data: ultima } = await supabase
    .from('ordenes_compra').select('numero').eq('user_id', ownerId).order('numero', { ascending: false }).limit(1).maybeSingle()
  const numero = (ultima?.numero || 0) + 1

  const { data: oc, error } = await supabase
    .from('ordenes_compra')
    .insert({
      numero,
      proveedor_id: body.proveedor_id || null,
      proveedor:    body.proveedor || null,
      proyecto_id:  body.proyecto_id || null,
      proyecto:     body.proyecto || null,
      partida_id:   body.partida_id || null,
      fecha:        body.fecha || new Date().toISOString().split('T')[0],
      // "Recibida" se registra como recepción de todas las líneas, más abajo
      estado:       body.estado === 'recibida' ? 'enviada' : (body.estado || 'borrador'),
      neto, iva, total,
      notas:        body.notas || null,
      user_id:      ownerId,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (lineas.length > 0) {
    const rows = lineas.map(l => ({ ...l, orden_id: oc.id, user_id: ownerId }))
    const { error: eL } = await supabase.from('orden_compra_lineas').insert(rows)
    if (eL) return NextResponse.json({ error: eL.message }, { status: 500 })
  }

  try {
    if (body.estado === 'recibida') {
      const { lineas: guardadas } = await cargarOC(supabase, ownerId, oc.id)
      await registrarRecepcion(supabase, ownerId, oc, guardadas, pendientes(guardadas, []), {
        fecha: oc.fecha || new Date().toISOString().split('T')[0],
      })
    }
    const actual = await sincronizarOC(supabase, ownerId, oc.id)
    return NextResponse.json({ ...actual, lineas })
  } catch (e: any) {
    return NextResponse.json({ ...oc, lineas, aviso: `La orden quedó guardada, pero no se pudo actualizar su gasto: ${e?.message ?? 'error'}` })
  }
}

// ─── PUT: actualizar OC (estado, datos y/o líneas) ────────
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  let actualOC: any, lineasActuales: any[], recepciones: any[]
  try {
    const cargada = await cargarOC(supabase, ownerId, body.id)
    actualOC = cargada.oc; lineasActuales = cargada.lineas; recepciones = cargada.recepciones
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error cargando la orden' }, { status: 500 })
  }
  if (!actualOC) return NextResponse.json({ error: 'Orden de compra no encontrada' }, { status: 404 })
  const conRecepciones = recepciones.length > 0

  const update: any = {}
  if (body.proveedor_id !== undefined) update.proveedor_id = body.proveedor_id || null
  if (body.proveedor    !== undefined) update.proveedor    = body.proveedor || null
  if (body.proyecto_id  !== undefined) update.proyecto_id  = body.proyecto_id || null
  if (body.proyecto     !== undefined) update.proyecto     = body.proyecto || null
  if (body.fecha        !== undefined) update.fecha        = body.fecha
  if (body.notas        !== undefined) update.notas        = body.notas ?? null
  if (body.factura_id   !== undefined) update.factura_id   = body.factura_id || null

  const proyectoFinal = body.proyecto_id !== undefined ? (body.proyecto_id || null) : actualOC.proyecto_id

  // Lo recibido ya entró a la bodega y al gasto de esa obra
  if (conRecepciones && proyectoFinal !== actualOC.proyecto_id) {
    return NextResponse.json({ error: 'La orden ya tiene recepciones: revierte la recepción antes de cambiar el proyecto' }, { status: 400 })
  }

  // ── Estado: parcial y recibida se derivan de las recepciones ──
  let recibirTodo = false
  if (body.estado !== undefined && body.estado !== actualOC.estado) {
    if (body.estado === 'parcial') {
      return NextResponse.json({ error: 'El estado parcial se calcula según lo recibido' }, { status: 400 })
    }
    if (body.estado === 'recibida') {
      recibirTodo = true
    } else if (conRecepciones) {
      return NextResponse.json({ error: 'La orden ya tiene recepciones: reviértelas antes de cambiar su estado' }, { status: 400 })
    } else {
      update.estado = body.estado
    }
  }

  // La partida debe ser del proyecto; al cambiar de proyecto sin indicarla, se limpia
  if (body.partida_id) {
    if (!(await partidaEsDeProyecto(supabase, ownerId, body.partida_id, proyectoFinal))) {
      return NextResponse.json({ error: 'La partida no pertenece al proyecto elegido' }, { status: 400 })
    }
    update.partida_id = body.partida_id
  } else if (body.partida_id !== undefined || body.proyecto_id !== undefined) {
    update.partida_id = null
  }

  // ── Líneas: se comparan por id, porque las recepciones apuntan a ellas ──
  if (Array.isArray(body.lineas)) {
    const { lineas, neto, iva, total } = calcTotales(body.lineas)
    const error = validarEdicionLineas(lineasActuales, recepciones, lineas)
    if (error) return NextResponse.json({ error }, { status: 400 })
    if (!(await partidasSonDeProyecto(supabase, ownerId, lineas.map(l => l.partida_id), proyectoFinal))) {
      return NextResponse.json({ error: 'Una línea tiene una partida de otro proyecto' }, { status: 400 })
    }
    update.neto = neto; update.iva = iva; update.total = total

    const idsNuevos = new Set(lineas.map(l => l.id).filter(Boolean))
    const quitadas = lineasActuales.filter(l => !idsNuevos.has(l.id)).map(l => l.id)
    const idsActuales = new Set(lineasActuales.map(l => l.id))
    for (const { id, ...l } of lineas) {
      const { error: eL } = id && idsActuales.has(id)
        ? await supabase.from('orden_compra_lineas').update(l).eq('id', id).eq('user_id', ownerId)
        : await supabase.from('orden_compra_lineas').insert({ ...l, orden_id: body.id, user_id: ownerId })
      if (eL) return NextResponse.json({ error: eL.message }, { status: 500 })
    }
    if (quitadas.length > 0) {
      const { error: eD } = await supabase.from('orden_compra_lineas').delete().in('id', quitadas).eq('user_id', ownerId)
      if (eD) return NextResponse.json({ error: eD.message }, { status: 500 })
    }
  }

  const { data, error } = await supabase
    .from('ordenes_compra').update(update).eq('id', body.id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    // Al quitar o cambiar la factura, deja de contar en la obra: vuelve a contar lo recibido
    if (actualOC.factura_id && actualOC.factura_id !== data.factura_id) {
      await supabase.from('facturas').update({ proyecto: null, proyecto_id: null, partida_id: null })
        .eq('id', actualOC.factura_id).eq('user_id', ownerId)
    }
    // Al asociar una factura, atribuirla al proyecto de la OC (así cuenta en su gasto)
    if (data.factura_id && (data.proyecto_id || data.proyecto)) {
      await atribuirFactura(supabase, ownerId, data.factura_id, data)
    }
    if (recibirTodo) {
      const { lineas: guardadas, recepciones: recibidas } = await cargarOC(supabase, ownerId, body.id)
      const faltan = pendientes(guardadas, recibidas)
      if (faltan.length > 0) {
        await registrarRecepcion(supabase, ownerId, data, guardadas, faltan, {
          fecha: new Date().toISOString().split('T')[0],
        })
      }
    }
    return NextResponse.json(await sincronizarOC(supabase, ownerId, body.id))
  } catch (e: any) {
    return NextResponse.json({ ...data, aviso: `La orden quedó guardada, pero no se pudo actualizar su gasto: ${e?.message ?? 'error'}` })
  }
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
  const { data: recibidas } = await supabase
    .from('recepciones_oc').select('id').eq('orden_id', id).eq('user_id', ownerId).limit(1)
  if ((recibidas ?? []).length > 0) {
    return NextResponse.json({ error: 'La orden tiene recepciones: reviértelas antes de eliminarla' }, { status: 400 })
  }
  // Quita el gasto asociado (si la OC tenía uno) antes de borrarla
  await supabase.from('gastos_obra').delete().eq('orden_compra_id', id).eq('user_id', ownerId)
  const { error } = await supabase.from('ordenes_compra').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
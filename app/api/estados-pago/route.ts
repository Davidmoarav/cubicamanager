// app/api/estados-pago/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId, getRolActual } from '@/lib/roles'
import { traerPartidas } from '@/lib/avance-server'
import { cargarCostosObras } from '@/lib/costos-server'
import { aplicarEdicion, cascadaEP, lineasSeriePrecios, lineasSumaAlzada, type LineaEP, type ModalidadContrato } from '@/lib/estado-pago'
import { NextResponse, type NextRequest } from 'next/server'

class ErrorPermiso extends Error {}


// ─── GET: lista EPs de un proyecto, o el "borrador sugerido" ──
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  const sugerir    = req.nextUrl.searchParams.get('sugerir')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  // Modo "beneficiarios": lista los subproyectos nivel 1 (para el selector de alcance del EP)
  if (req.nextUrl.searchParams.get('beneficiarios')) {
    const { data } = await supabase
      .from('partidas_proyecto')
      .select('id, descripcion')
      .eq('proyecto_id', proyectoId).eq('user_id', ownerId)
      .is('parent_id', null).eq('es_grupo', true)
      .order('orden', { ascending: true })
    return NextResponse.json(data ?? [])
  }

  // Modo "sugerir": calcula cuánto se cobraría en un EP nuevo según avance actual
  if (sugerir) {
    return await sugerirEP(supabase, proyectoId, ownerId, req.nextUrl.searchParams.get('beneficiario_id'))
  }

  const { data, error } = await supabase
    .from('estados_pago')
    .select('*, detalle:estado_pago_detalle(*)')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', ownerId)
    .order('numero', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── Base del EP: líneas calculadas en el servidor según la modalidad del contrato ──
// La usan la sugerencia (GET) y la creación (POST): lo que se guarda nunca sale del navegador.
async function baseEP(supabase: any, proyectoId: string, userId: string, alcanceTxt?: string | null) {
  const { data: proy, error: eP } = await supabase
    .from('proyectos').select('*').eq('id', proyectoId).eq('user_id', userId).maybeSingle()
  if (eP) throw new Error(eP.message)
  if (!proy) return null
  const modalidad: ModalidadContrato = proy.modalidad_contrato ?? 'suma_alzada'
  const alcance = (alcanceTxt ?? '').split(',').map(s => s.trim()).filter(Boolean)

  // Lo ya comprometido: todo estado de pago que no fue rechazado. Un borrador también cuenta,
  // para que dos borradores no cobren el mismo avance; si sobra, se elimina.
  const { data: eps, error: eE } = await supabase
    .from('estados_pago').select('id, numero, estado, costo_rendido')
    .eq('proyecto_id', proyectoId).eq('user_id', userId)
  if (eE) throw new Error(eE.message)
  const vigentes = (eps ?? []).filter((e: any) => e.estado !== 'rechazado')
  const numero = (eps ?? []).reduce((m: number, e: any) => Math.max(m, Number(e.numero) || 0), 0) + 1

  let previos: any[] = []
  if (vigentes.length > 0) {
    const ids = vigentes.map((e: any) => e.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('estado_pago_detalle').select('*')
        .eq('user_id', userId).in('estado_pago_id', ids.slice(i, i + 200))
      if (error) throw new Error(error.message)
      previos.push(...(data ?? []))
    }
  }

  let lineas: LineaEP[]
  if (modalidad === 'administracion') {
    // El costo real incluye sueldos que el jefe de obra no ve agrupados: rendiría de menos
    const info = await getRolActual(supabase)
    if (info?.rol !== 'admin') throw new ErrorPermiso('El estado de pago por administración lo emite el administrador: incluye costos que tu rol no ve')
    // Costo real de la obra aún no rendido en estados de pago anteriores
    const [costos] = await cargarCostosObras(supabase, userId, [proy])
    const rendido = vigentes.reduce((s: number, e: any) => s + (Number(e.costo_rendido) || 0), 0)
    const pendiente = Math.max(0, Math.round(Number(costos?.gasto_real) || 0) - rendido)
    lineas = [{
      partida_id: null, descripcion: 'Costo real de la obra del período',
      valor_partida: pendiente, avance_anterior: 0, avance_actual: 0, avance_periodo: 0,
      monto: pendiente, maximo: pendiente,
    }]
  } else {
    const todas = await traerPartidas<any>(supabase, proyectoId, userId,
      'id, parent_id, descripcion, unidad, cantidad, precio_unitario, avance')
    lineas = modalidad === 'serie_precios'
      ? lineasSeriePrecios(todas, previos, alcance)
      : lineasSumaAlzada(todas, previos, alcance)
  }
  return { proy, modalidad, alcance, lineas, numero }
}

async function sugerirEP(supabase: any, proyectoId: string, userId: string, alcanceTxt?: string | null) {
  try {
    const base = await baseEP(supabase, proyectoId, userId, alcanceTxt)
    if (!base) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    const { proy, modalidad, lineas, numero } = base
    const honorarioPct = modalidad === 'administracion' ? Number(proy.honorario_admin_pct) || 0 : 0
    const detalle = lineas.filter(l => l.monto > 0 || (modalidad === 'serie_precios' && Number(l.cantidad_presupuestada) > 0))
    const c = cascadaEP(detalle.reduce((s, l) => s + l.monto, 0), {
      honorario_pct: honorarioPct, anticipo_pct: proy.anticipo_pct, retencion_pct: proy.retencion_pct,
    })
    return NextResponse.json({
      sugerencia: true, numero, modalidad,
      honorario_pct: honorarioPct,
      utilidad_pct: 0, utilidad_monto: 0, gg_pct: 0, gg_monto: 0,
      anticipo_pct: Number(proy.anticipo_pct) || 0, retencion_pct: Number(proy.retencion_pct) || 0,
      descuentos: 0, multas: 0,
      ...c, monto_neto: c.avance_obra,
      // Infinity no viaja en JSON: sin tope, null
      detalle: detalle.map(l => ({ ...l, maximo: Number.isFinite(l.maximo) ? l.maximo : null })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error calculando el estado de pago' }, { status: e instanceof ErrorPermiso ? 403 : 500 })
  }
}

// ─── POST: crear un EP. Las líneas y la cascada se recalculan aquí ──
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json().catch(() => null)
  if (!body?.proyecto_id) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })
  const num = (v: any) => Math.max(0, Number(v) || 0)
  const pct = (v: any) => Math.min(100, num(v))
  const descuentos = Math.round(num(body.descuentos)), multas = Math.round(num(body.multas))
  const alcanceTxt = Array.isArray(body.alcance) ? body.alcance.join(',') : (body.alcance ?? '')

  let base: Awaited<ReturnType<typeof baseEP>>
  try {
    base = await baseEP(supabase, body.proyecto_id, ownerId, alcanceTxt)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error calculando el estado de pago' }, { status: e instanceof ErrorPermiso ? 403 : 500 })
  }
  if (!base) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  const { proy, modalidad, alcance, lineas, numero } = base

  const editadas = Array.isArray(body.detalle) ? body.detalle : []
  const r = aplicarEdicion(modalidad, lineas, editadas.map((d: any) => ({
    partida_id: d.partida_id ?? null, monto: d.monto, cantidad_actual: d.cantidad_actual,
  })))
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
  if (r.lineas.length === 0) return NextResponse.json({ error: 'No hay nada que cobrar en este estado de pago' }, { status: 400 })

  const honorario_pct = modalidad === 'administracion' ? Number(proy.honorario_admin_pct) || 0 : 0
  const anticipo_pct = pct(body.anticipo_pct), retencion_pct = pct(body.retencion_pct)
  const c = cascadaEP(r.lineas.reduce((s, l) => s + l.monto, 0), { honorario_pct, anticipo_pct, retencion_pct, descuentos, multas })
  if (c.total_neto < 0) return NextResponse.json({ error: 'Los descuentos y multas superan el valor del estado de pago' }, { status: 400 })

  const fila: Record<string, any> = {
    proyecto_id: body.proyecto_id, numero,
    periodo: /^\d{4}-\d{2}$/.test(body.periodo ?? '') ? body.periodo : new Date().toISOString().slice(0, 7),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(body.fecha ?? '') ? body.fecha : new Date().toISOString().split('T')[0],
    monto_neto: c.avance_obra, avance_obra: c.avance_obra,
    utilidad_pct: 0, utilidad_monto: 0, gg_pct: 0, gg_monto: 0,
    bruto: c.bruto, descuentos, anticipo_pct, anticipo_desc: c.anticipo_desc, multas,
    retencion_pct, retencion_monto: c.retencion_monto,
    monto_pagar: c.total_neto, iva: c.iva, total: c.total,
    estado: 'borrador', notas: typeof body.notas === 'string' ? body.notas.slice(0, 2000) || null : null,
    user_id: ownerId,
  }
  // Columnas de sql/56: solo viajan si aportan algo (así la obra en suma alzada funciona sin la migración)
  if (modalidad !== 'suma_alzada' || alcance.length > 0) {
    Object.assign(fila, {
      modalidad, alcance: alcance.length > 0 ? alcance : null,
      costo_rendido: modalidad === 'administracion' ? c.avance_obra : 0,
      honorario_pct, honorario_monto: c.honorario_monto,
    })
  }

  const { data: ep, error: e1 } = await supabase.from('estados_pago').insert(fila).select().single()
  if (e1) {
    const falta = /modalidad|alcance|costo_rendido|honorario|cantidad_|precio_unitario/.test(e1.message)
    return NextResponse.json({ error: falta ? 'Falta activar las modalidades de contrato en la base de datos (sql/56_contratos_y_parametros.sql).' : e1.message }, { status: 500 })
  }

  const conCantidad = modalidad === 'serie_precios'
  const { error: e2 } = await supabase.from('estado_pago_detalle').insert(r.lineas.map(l => ({
    estado_pago_id: ep.id, partida_id: l.partida_id, descripcion: l.descripcion,
    valor_partida: l.valor_partida,
    // Columnas enteras hasta sql/56: se redondean para no fallar antes de ejecutarla
    avance_anterior: conCantidad ? l.avance_anterior : Math.round(l.avance_anterior),
    avance_actual: conCantidad ? l.avance_actual : Math.round(l.avance_actual),
    avance_periodo: conCantidad ? l.avance_periodo : Math.round(l.avance_periodo),
    monto: l.monto, user_id: ownerId,
    ...(conCantidad ? {
      unidad: l.unidad ?? null, precio_unitario: l.precio_unitario,
      cantidad_anterior: l.cantidad_anterior, cantidad_actual: l.cantidad_actual,
    } : {}),
  })))
  if (e2) {
    // Sin detalle, el estado de pago no descontaría lo cobrado la próxima vez: no se deja a medias
    await supabase.from('estados_pago').delete().eq('id', ep.id).eq('user_id', ownerId)
    return NextResponse.json({ error: 'No se pudo guardar el detalle: ' + e2.message }, { status: 500 })
  }

  return NextResponse.json(ep)
}

// ─── PUT: cambiar estado del EP ──
export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id, estado, generar_factura } = await req.json()

  // Cargar el EP
  const { data: ep } = await supabase
    .from('estados_pago')
    .select('*')
    .eq('id', id)
    .eq('user_id', ownerId)
    .single()

  if (!ep) return NextResponse.json({ error: 'EP no encontrado' }, { status: 404 })

  // Pasos válidos: el estado de pago no salta de borrador a pagado, ni vuelve atrás sin pasar por su paso previo
  const PASOS: Record<string, string[]> = {
    borrador: ['presentado', 'rechazado'],
    presentado: ['aprobado', 'rechazado', 'borrador'],
    aprobado: ['pagado', 'presentado'],
    pagado: ['aprobado'],
    rechazado: ['borrador'],
  }
  if (estado && estado !== ep.estado && !(PASOS[ep.estado] ?? []).includes(estado)) {
    return NextResponse.json({ error: `Un estado de pago ${ep.estado} no puede pasar a ${estado}` }, { status: 400 })
  }
  if (generar_factura && !['aprobado', 'pagado'].includes(estado || ep.estado)) {
    return NextResponse.json({ error: 'Solo se factura un estado de pago aprobado' }, { status: 400 })
  }

  let facturaId = ep.factura_id

  // Si se pide generar factura y no existe aún
  if (generar_factura && !ep.factura_id) {
    // Datos del proyecto para la factura
    const { data: proy } = await supabase
      .from('proyectos').select('nombre, cliente').eq('id', ep.proyecto_id).eq('user_id', ownerId).single()

    const { data: factura } = await supabase
      .from('facturas')
      .insert({
        numero: `EP-${ep.numero}`,
        cliente: proy?.cliente || 'Cliente',
        proyecto: proy?.nombre || '',
        proyecto_id: ep.proyecto_id,
        tipo: 'venta',
        neto: ep.monto_pagar,
        iva: ep.iva,
        monto: ep.total,
        emision: new Date().toISOString().split('T')[0],
        periodo: ep.periodo || new Date().toISOString().slice(0, 7),
        estado: 'pendiente',
        estado_pago_id: ep.id,
        user_id: ownerId,
      })
      .select()
      .single()

    facturaId = factura?.id || null
  }

  const { data, error } = await supabase
    .from('estados_pago')
    .update({ estado: estado || ep.estado, factura_id: facturaId })
    .eq('id', id)
    .eq('user_id', ownerId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // El cobro es uno solo: la factura del estado de pago queda igual que él
  if (facturaId && estado && (estado === 'pagado') !== (ep.estado === 'pagado')) {
    await supabase.from('facturas').update({ estado: estado === 'pagado' ? 'pagada' : 'pendiente' })
      .eq('id', facturaId).eq('user_id', ownerId)
  }
  return NextResponse.json({ ...data, factura_generada: facturaId && !ep.factura_id })
}

// ─── DELETE ──
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { data: ep } = await supabase.from('estados_pago').select('estado, factura_id').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!ep) return NextResponse.json({ error: 'EP no encontrado' }, { status: 404 })
  if (ep.estado === 'pagado') return NextResponse.json({ error: 'Un estado de pago pagado no se puede eliminar' }, { status: 400 })
  if (ep.factura_id) return NextResponse.json({ error: 'El estado de pago ya tiene factura: anula la factura antes de eliminarlo' }, { status: 400 })
  const { error } = await supabase
    .from('estados_pago')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
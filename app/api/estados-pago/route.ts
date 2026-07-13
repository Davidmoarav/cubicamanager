// app/api/estados-pago/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura } from '@/lib/roles'
import { NextResponse, type NextRequest } from 'next/server'

const IVA = 0.19

// Avance ponderado por valor de subpartida (fallback: promedio simple)
function avancePartida(padre: any, hijosPadre: any[]): number {
  if (hijosPadre.length === 0) return Number(padre.avance) || 0
  const pesos = hijosPadre.map(h => (Number(h.cantidad) || 0) * (Number(h.precio_unitario) || 0))
  const totalPeso = pesos.reduce((a, b) => a + b, 0)
  if (totalPeso > 0) {
    return hijosPadre.reduce((s, h, i) => s + (Number(h.avance) || 0) * (pesos[i] / totalPeso), 0)
  }
  return hijosPadre.reduce((s, h) => s + (Number(h.avance) || 0), 0) / hijosPadre.length
}

// ─── GET: lista EPs de un proyecto, o el "borrador sugerido" ──
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  const sugerir    = req.nextUrl.searchParams.get('sugerir')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  // Modo "sugerir": calcula cuánto se cobraría en un EP nuevo según avance actual
  if (sugerir) {
    return await sugerirEP(supabase, proyectoId, user.id)
  }

  const { data, error } = await supabase
    .from('estados_pago')
    .select('*, detalle:estado_pago_detalle(*)')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', user.id)
    .order('numero', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── Sugerir EP: avance actual menos lo ya cobrado en EPs previos ──
async function sugerirEP(supabase: any, proyectoId: string, userId: string) {
  // 0. Config de % del proyecto (utilidad, GG, anticipo, retención)
  const { data: proy } = await supabase
    .from('proyectos')
    .select('utilidad_pct, gg_pct, anticipo_pct, retencion_pct')
    .eq('id', proyectoId)
    .eq('user_id', userId)
    .maybeSingle()

  const utilidadPct = Number(proy?.utilidad_pct) || 0
  const ggPct       = Number(proy?.gg_pct) || 0
  const anticipoPct = Number(proy?.anticipo_pct) || 0
  const retencionPct = Number(proy?.retencion_pct) || 0

  // 1. Partidas padre del proyecto (con su avance actual)
  const { data: partidas } = await supabase
    .from('partidas_proyecto')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', userId)

  const todas  = partidas ?? []
  const padres = todas.filter((p: any) => !p.parent_id)
  const hijos  = todas.filter((p: any) => p.parent_id)

  // 2. EPs anteriores DE ESTE PROYECTO para saber cuánto ya se cobró de cada partida.
  //    Solo cuentan los EP realmente presentados/aprobados/pagados: un borrador
  //    no debe bloquear el cobro de ese avance.
  const { data: epsProyecto } = await supabase
    .from('estados_pago')
    .select('id, estado')
    .eq('user_id', userId)
    .eq('proyecto_id', proyectoId)

  const idsComprometidos = (epsProyecto ?? [])
    .filter((e: any) => e.estado !== 'borrador')
    .map((e: any) => e.id)

  const yaCobrado: Record<string, number> = {}
  if (idsComprometidos.length > 0) {
    const { data: epsPrevios } = await supabase
      .from('estado_pago_detalle')
      .select('partida_id, avance_actual')
      .eq('user_id', userId)
      .in('estado_pago_id', idsComprometidos)

    // avance ya cobrado por partida (el máximo avance_actual registrado)
    for (const d of (epsPrevios ?? [])) {
      if (!yaCobrado[d.partida_id] || d.avance_actual > yaCobrado[d.partida_id]) {
        yaCobrado[d.partida_id] = d.avance_actual
      }
    }
  }

  // 3. Para cada partida padre, calcular avance actual real y lo nuevo a cobrar
  const detalle = padres.map((padre: any) => {
    const valor = (Number(padre.cantidad) || 0) * (Number(padre.precio_unitario) || 0)
    const hijosPadre = hijos.filter((h: any) => h.parent_id === padre.id)
    const avanceActual = Math.round(avancePartida(padre, hijosPadre))
    const avanceAnterior = yaCobrado[padre.id] || 0
    const avancePeriodo = Math.max(0, avanceActual - avanceAnterior)
    const monto = Math.round(valor * avancePeriodo / 100)
    return {
      partida_id: padre.id,
      descripcion: padre.descripcion,
      valor_partida: valor,
      avance_anterior: avanceAnterior,
      avance_actual: avanceActual,
      avance_periodo: avancePeriodo,
      monto,
    }
  })

  const montoNeto = detalle.reduce((s: number, d: any) => s + d.monto, 0)

  // ─── Cascada (suma alzada) ─────────────────────────────
  // El avance ya viene a precio de contrato (con margen incluido en la partida).
  // NO se re-suma utilidad/GG: eso duplicaría el margen. Solo se descuentan
  // amortización de anticipo, retención y (en edición) multas/descuentos.
  const avanceObra     = montoNeto
  const bruto          = avanceObra                                // Valor EEPP
  const anticipoDesc   = Math.round(bruto * anticipoPct / 100)     // amortización de anticipo
  const retencionMonto = Math.round(bruto * retencionPct / 100)    // retención de garantía
  const totalNeto      = bruto - anticipoDesc - retencionMonto     // multas/descuentos se restan al editar
  const iva            = Math.round(totalNeto * IVA)
  const total          = totalNeto + iva

  // Número del próximo EP
  const { data: ultimoEp } = await supabase
    .from('estados_pago')
    .select('numero')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', userId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  const numero = (ultimoEp?.numero || 0) + 1

  return NextResponse.json({
    sugerencia: true,
    numero,
    // cascada
    avance_obra: avanceObra,
    utilidad_pct: 0, utilidad_monto: 0,
    gg_pct: 0, gg_monto: 0,
    bruto,
    anticipo_pct: anticipoPct, anticipo_desc: anticipoDesc,
    retencion_pct: retencionPct, retencion_monto: retencionMonto,
    descuentos: 0, multas: 0,
    total_neto: totalNeto, iva, total,
    monto_neto: montoNeto,
    detalle: detalle.filter((d: any) => d.avance_periodo > 0),
  })
}

// ─── POST: crear un EP con cascada completa ──
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    proyecto_id, numero, periodo, fecha,
    avance_obra = 0,
    utilidad_pct = 0, gg_pct = 0,
    descuentos = 0, anticipo_pct = 0, multas = 0, retencion_pct = 0,
    notas, detalle = [],
  } = body

  // Recalcular la cascada en el servidor (no confiar en montos del cliente)
  const utilidadMonto  = Math.round(avance_obra * utilidad_pct / 100)
  const ggMonto        = Math.round(avance_obra * gg_pct / 100)
  const bruto          = avance_obra + utilidadMonto + ggMonto
  const anticipoDesc   = Math.round(bruto * anticipo_pct / 100)
  const retencionMonto = Math.round(bruto * retencion_pct / 100)
  const totalNeto      = bruto - descuentos - anticipoDesc - multas - retencionMonto
  const iva            = Math.round(totalNeto * IVA)
  const total          = totalNeto + iva

  const { data: ep, error: e1 } = await supabase
    .from('estados_pago')
    .insert({
      proyecto_id, numero, periodo,
      fecha: fecha || new Date().toISOString().split('T')[0],
      monto_neto: avance_obra,          // compat: avance de obra del período
      avance_obra,
      utilidad_pct, utilidad_monto: utilidadMonto,
      gg_pct, gg_monto: ggMonto,
      bruto,
      descuentos,
      anticipo_pct, anticipo_desc: anticipoDesc,
      multas,
      retencion_pct, retencion_monto: retencionMonto,
      monto_pagar: totalNeto,           // compat: total neto pre-IVA
      iva, total,
      estado: 'borrador',
      notas: notas || null,
      user_id: user.id,
    })
    .select()
    .single()

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // Guardar detalle de avance por partida
  if (detalle.length > 0) {
    const filas = detalle.map((d: any) => ({
      estado_pago_id: ep.id,
      partida_id: d.partida_id,
      descripcion: d.descripcion,
      valor_partida: d.valor_partida,
      avance_anterior: d.avance_anterior,
      avance_actual: d.avance_actual,
      avance_periodo: d.avance_periodo,
      monto: d.monto,
      user_id: user.id,
    }))
    await supabase.from('estado_pago_detalle').insert(filas)
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

  const { id, estado, generar_factura } = await req.json()

  // Cargar el EP
  const { data: ep } = await supabase
    .from('estados_pago')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ep) return NextResponse.json({ error: 'EP no encontrado' }, { status: 404 })

  let facturaId = ep.factura_id

  // Si se pide generar factura y no existe aún
  if (generar_factura && !ep.factura_id) {
    // Datos del proyecto para la factura
    const { data: proy } = await supabase
      .from('proyectos').select('nombre, cliente').eq('id', ep.proyecto_id).eq('user_id', user.id).single()

    const { data: factura } = await supabase
      .from('facturas')
      .insert({
        numero: `EP-${ep.numero}`,
        cliente: proy?.cliente || 'Cliente',
        proyecto: proy?.nombre || '',
        tipo: 'venta',
        neto: ep.monto_pagar,
        iva: ep.iva,
        monto: ep.total,
        emision: new Date().toISOString().split('T')[0],
        periodo: ep.periodo || new Date().toISOString().slice(0, 7),
        estado: 'pendiente',
        estado_pago_id: ep.id,
        user_id: user.id,
      })
      .select()
      .single()

    facturaId = factura?.id || null
  }

  const { data, error } = await supabase
    .from('estados_pago')
    .update({ estado: estado || ep.estado, factura_id: facturaId })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, factura_generada: facturaId && !ep.factura_id })
}

// ─── DELETE ──
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase
    .from('estados_pago')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
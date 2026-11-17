// app/api/tratos/route.ts
// Tratos de mano de obra de una obra: lo pactado con un trabajador, una cuadrilla o un tercero.
// Los avances (lo ejecutado y su aprobación) están en /api/tratos/avances.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { ParticipantesTratoSchema, TratoSchema, validar, validarParcial } from '@/lib/validar'
import { traerTodo } from '@/lib/costos-server'
import { lectorSueldos } from '@/lib/supabase-admin'
import { resumenTrato } from '@/lib/tratos'
import { AVISO_55, faltaTratos } from '@/lib/tratos-server'
import { NextResponse, type NextRequest } from 'next/server'

async function sesion() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, ownerId: (await getOwnerId(supabase)) || user.id }
}
const error55 = (msg: string) => NextResponse.json({ error: faltaTratos(msg) ? AVISO_55 : msg }, { status: 500 })

// Coherencia de lo pactado según tipo y ejecutor
function revisar(t: any, participantes: any[] | null): string | null {
  const enPct = t.tipo === 'suma_alzada' || t.tipo === 'vivienda'
  if (enPct && !(Number(t.monto_fijo) > 0)) return 'Falta el monto del trato'
  if (!enPct && !(Number(t.precio_unitario) > 0)) return 'Falta el precio por unidad, hora o día'
  if (t.ejecutor === 'tercero') {
    if (!t.tercero_nombre && !t.proveedor_id) return 'Falta el nombre del tercero o el proveedor'
  } else if (participantes) {
    if (participantes.length === 0) return 'Falta indicar quién ejecuta el trato'
    if (t.ejecutor === 'trabajador' && participantes.length !== 1) return 'Un trato individual lleva un solo trabajador'
    if (t.reparto === 'porcentaje') {
      const suma = participantes.reduce((s, p) => s + (Number(p.porcentaje) || 0), 0)
      if (Math.abs(suma - 100) > 0.01) return `Los porcentajes de la cuadrilla suman ${suma}%, deben sumar 100%`
    }
  }
  return null
}

// ─── GET: tratos de la obra con cuadrilla, avances, reparto y resumen ──
export async function GET(req: NextRequest) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  try {
    const [tratos, avances, emps] = await Promise.all([
      traerTodo<any>((d, h) => supabase.from('tratos').select('*, participantes:trato_participantes(empleado_id, porcentaje)')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('created_at', { ascending: false }).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('trato_avances').select('*, reparto:trato_avance_reparto(empleado_id, monto)')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('fecha').order('id').range(d, h)),
      // Solo nombre y cargo: el jefe de obra arma cuadrillas, pero no lee la tabla de trabajadores
      lectorSueldos(supabase).from('empleados').select('id, nombre, cargo, estado').eq('user_id', ownerId).order('nombre'),
    ])
    if (emps.error) throw new Error(emps.error.message)

    const avancesDe = new Map<string, any[]>()
    for (const a of avances) { const l = avancesDe.get(a.trato_id); if (l) l.push(a); else avancesDe.set(a.trato_id, [a]) }

    return NextResponse.json({
      tratos: tratos.map(t => {
        const propios = avancesDe.get(t.id) ?? []
        return { ...t, avances: propios, resumen: resumenTrato(t, propios) }
      }),
      empleados: (emps.data ?? []).filter((e: any) => e.estado !== 'inactivo'),
    })
  } catch (e: any) {
    if (faltaTratos(e?.message)) return NextResponse.json({ tratos: [], empleados: [], falta_migracion: AVISO_55 })
    return NextResponse.json({ error: e?.message ?? 'Error leyendo los tratos' }, { status: 500 })
  }
}

async function guardarParticipantes(supabase: any, ownerId: string, tratoId: string, participantes: any[]) {
  const { error: eDel } = await supabase.from('trato_participantes').delete().eq('trato_id', tratoId).eq('user_id', ownerId)
  if (eDel) throw new Error(eDel.message)
  if (participantes.length === 0) return
  const { error } = await supabase.from('trato_participantes').insert(
    participantes.map(p => ({ trato_id: tratoId, empleado_id: p.empleado_id, porcentaje: Number(p.porcentaje) || 0, user_id: ownerId })))
  if (error) throw new Error(error.message)
}

// Los trabajadores deben ser de esta organización
async function empleadosPropios(supabase: any, ownerId: string, ids: string[]) {
  if (ids.length === 0) return true
  const { data } = await lectorSueldos(supabase).from('empleados').select('id').eq('user_id', ownerId).in('id', ids)
  return (data ?? []).length === new Set(ids).size
}

// ─── POST: nuevo trato ──
export async function POST(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const body = await req.json().catch(() => null)
  const v = validar(TratoSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const vp = validar(ParticipantesTratoSchema, body?.participantes ?? [])
  if (!vp.ok) return NextResponse.json({ error: vp.error }, { status: 400 })
  const participantes = v.data.ejecutor === 'tercero' ? [] : vp.data

  const falla = revisar(v.data, participantes)
  if (falla) return NextResponse.json({ error: falla }, { status: 400 })

  const [proy, partida, empsOk] = await Promise.all([
    supabase.from('proyectos').select('id').eq('id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle(),
    v.data.partida_id
      ? supabase.from('partidas_proyecto').select('id').eq('id', v.data.partida_id)
          .eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).maybeSingle()
      : null,
    empleadosPropios(supabase, ownerId, participantes.map(p => p.empleado_id)),
  ])
  if (!proy.data) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  if (partida && !partida.data) return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
  if (!empsOk) return NextResponse.json({ error: 'Hay trabajadores que no son de esta empresa' }, { status: 400 })

  const { data, error } = await supabase.from('tratos').insert({ ...v.data, user_id: ownerId }).select().single()
  if (error) return error55(error.message)
  try {
    await guardarParticipantes(supabase, ownerId, data.id, participantes)
  } catch (e: any) {
    await supabase.from('tratos').delete().eq('id', data.id).eq('user_id', ownerId)
    return NextResponse.json({ error: e?.message ?? 'No se pudo guardar la cuadrilla' }, { status: 500 })
  }
  return NextResponse.json(data)
}

// ─── PUT: editar lo pactado, la cuadrilla o el estado ──
export async function PUT(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const v = validarParcial(TratoSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id: _obra, ...cambios } = v.data

  const { data: actual, error: eA } = await supabase.from('tratos').select('*').eq('id', body.id).eq('user_id', ownerId).maybeSingle()
  if (eA) return error55(eA.message)
  if (!actual) return NextResponse.json({ error: 'Trato no encontrado' }, { status: 404 })

  let participantes: any[] | null = null
  if (Array.isArray(body.participantes)) {
    const vp = validar(ParticipantesTratoSchema, body.participantes)
    if (!vp.ok) return NextResponse.json({ error: vp.error }, { status: 400 })
    participantes = vp.data
  }
  const nuevo = { ...actual, ...cambios }
  if (nuevo.ejecutor === 'tercero') participantes = participantes ? [] : null

  // Solo cambiar el estado no revisa lo pactado
  const soloEstado = Object.keys(cambios).every(k => k === 'estado' || k === 'notas') && !participantes
  if (!soloEstado) {
    const falla = revisar(nuevo, participantes)
    if (falla) return NextResponse.json({ error: falla }, { status: 400 })
    // Con avances ya aprobados no se cambia la forma de medir: descuadraría lo pagado
    if (cambios.tipo && cambios.tipo !== actual.tipo) {
      const { data: firmes } = await supabase.from('trato_avances').select('id')
        .eq('trato_id', body.id).eq('user_id', ownerId).in('estado', ['aprobado', 'pagado']).limit(1)
      if ((firmes ?? []).length > 0) return NextResponse.json({ error: 'El trato ya tiene avances aprobados: no se puede cambiar su tipo' }, { status: 400 })
    }
    if (cambios.partida_id) {
      const { data: p } = await supabase.from('partidas_proyecto').select('id').eq('id', cambios.partida_id)
        .eq('proyecto_id', actual.proyecto_id).eq('user_id', ownerId).maybeSingle()
      if (!p) return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
    }
    if (participantes && !(await empleadosPropios(supabase, ownerId, participantes.map(p => p.empleado_id)))) {
      return NextResponse.json({ error: 'Hay trabajadores que no son de esta empresa' }, { status: 400 })
    }
  }

  if (Object.keys(cambios).length > 0) {
    const { error } = await supabase.from('tratos').update(cambios).eq('id', body.id).eq('user_id', ownerId)
    if (error) return error55(error.message)
  }
  try {
    if (participantes) await guardarParticipantes(supabase, ownerId, body.id, participantes)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudo guardar la cuadrilla' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// ─── DELETE: solo si nada fue aprobado (para lo demás, anular) ──
export async function DELETE(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { data: firmes } = await supabase.from('trato_avances').select('id')
    .eq('trato_id', id).eq('user_id', ownerId).in('estado', ['aprobado', 'pagado']).limit(1)
  if ((firmes ?? []).length > 0) {
    return NextResponse.json({ error: 'El trato tiene avances aprobados: anúlalo en vez de eliminarlo' }, { status: 400 })
  }
  const { error } = await supabase.from('tratos').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return error55(error.message)
  return NextResponse.json({ ok: true })
}

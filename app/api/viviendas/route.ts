// app/api/viviendas/route.ts
// Viviendas de un programa: la ficha del beneficiario (sql/54) sobre su grupo raíz de partidas,
// que es el que lleva el costo y el avance. Una obra única no tiene viviendas.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { ViviendaSchema, validar, validarParcial } from '@/lib/validar'
import { armarArbol } from '@/lib/avance'
import { recalcTodo, traerPartidas } from '@/lib/avance-server'
import { traerTodo } from '@/lib/costos-server'
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

// La tabla llega con sql/54: si falta, se dice cuál ejecutar
const faltaMigracion = (msg?: string) => /does not exist|could not find the table|schema cache/i.test(msg ?? '')
const AVISO_54 = 'Falta activar las viviendas en la base de datos (sql/54_viviendas.sql).'
const hoy = () => new Date().toISOString().split('T')[0]

async function sesion() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, ownerId: (await getOwnerId(supabase)) || user.id }
}

async function obraPropia(supabase: any, ownerId: string, proyectoId: string) {
  const { data } = await supabase.from('proyectos').select('id').eq('id', proyectoId).eq('user_id', ownerId).maybeSingle()
  return !!data
}

// ─── GET: viviendas de la obra con valor y avance, y los grupos raíz que aún no tienen ficha ──
export async function GET(req: NextRequest) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  try {
    const partidas = await traerPartidas<any>(supabase, proyectoId, ownerId,
      'id, parent_id, descripcion, es_grupo, orden, cantidad, precio_unitario, avance')
    const arbol = armarArbol(partidas)

    let fichas: any[] = []
    let falta = false
    try {
      fichas = await traerTodo<any>((d, h) => supabase.from('viviendas').select('*')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('id').range(d, h))
    } catch (e: any) {
      if (!faltaMigracion(e?.message)) throw e
      falta = true
    }

    const orden = new Map(arbol.raices.map((r: any) => [r.id, Number(r.orden) || 0]))
    const conFicha = new Set(fichas.map(f => f.partida_id))
    const viviendas = fichas
      .map(f => ({
        ...f,
        valor: Math.round(arbol.valor(f.partida_id)),
        avance: Math.round(arbol.avance(f.partida_id)),
        partidas: arbol.subarbol(f.partida_id).length - 1,
      }))
      .sort((a, b) => (orden.get(a.partida_id) ?? 0) - (orden.get(b.partida_id) ?? 0))

    // Partidas que se repiten en las viviendas: para el avance masivo
    const tipos = new Set<string>()
    for (const f of fichas) for (const p of arbol.subarbol(f.partida_id)) {
      if (p.id !== f.partida_id && arbol.hijosDe(p.id).length === 0) tipos.add(String(p.descripcion ?? '').trim())
    }

    // Grupos raíz sin ficha: candidatos a convertirse en vivienda (el usuario decide)
    const sin_ficha = arbol.raices
      .filter((r: any) => (r.es_grupo || arbol.hijosDe(r.id).length > 0) && !conFicha.has(r.id))
      .map((r: any) => ({ id: r.id, descripcion: r.descripcion }))

    return NextResponse.json({
      viviendas, sin_ficha,
      tipos_partida: [...tipos].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
      ...(falta ? { falta_migracion: AVISO_54 } : {}),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo las viviendas' }, { status: 500 })
  }
}

// ─── POST: nueva vivienda, o convertir en viviendas los grupos raíz de la obra ──
export async function POST(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const body = await req.json().catch(() => null)
  if (!body?.proyecto_id) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })
  if (!(await obraPropia(supabase, ownerId, body.proyecto_id))) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  }
  const marcarPrograma = () =>
    supabase.from('proyectos').update({ tipo: 'programa' }).eq('id', body.proyecto_id).eq('user_id', ownerId)

  // Convertir: cada grupo raíz indicado (o todos los que no tienen ficha) pasa a ser una vivienda
  if (body.desde_grupos) {
    const [{ data: raices, error: e1 }, { data: fichas, error: e2 }] = await Promise.all([
      supabase.from('partidas_proyecto').select('id, descripcion, avance')
        .eq('proyecto_id', body.proyecto_id).eq('user_id', ownerId).is('parent_id', null).eq('es_grupo', true),
      supabase.from('viviendas').select('partida_id').eq('proyecto_id', body.proyecto_id).eq('user_id', ownerId),
    ])
    if (e2) return NextResponse.json({ error: faltaMigracion(e2.message) ? AVISO_54 : e2.message }, { status: 500 })
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    const pedidos: Set<string> | null = Array.isArray(body.partida_ids) ? new Set(body.partida_ids) : null
    const conFicha = new Set((fichas ?? []).map((f: any) => f.partida_id))
    const nuevas = (raices ?? [])
      .filter((r: any) => !conFicha.has(r.id) && (!pedidos || pedidos.has(r.id)))
      .map((r: any) => ({
        proyecto_id: body.proyecto_id, partida_id: r.id,
        beneficiario: String(r.descripcion || 'Vivienda').slice(0, 200),
        estado: Number(r.avance) >= 100 ? 'terminada' : Number(r.avance) > 0 ? 'en_ejecucion' : 'pendiente',
        user_id: ownerId,
      }))
    if (nuevas.length > 0) {
      const { error } = await supabase.from('viviendas').insert(nuevas)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await marcarPrograma()
    return NextResponse.json({ ok: true, creadas: nuevas.length })
  }

  const v = validar(ViviendaSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // El grupo raíz de la vivienda, al final de la lista
  const { data: ultimo } = await supabase.from('partidas_proyecto').select('orden')
    .eq('proyecto_id', v.data.proyecto_id).eq('user_id', ownerId).is('parent_id', null)
    .order('orden', { ascending: false }).limit(1).maybeSingle()
  const partidaId = randomUUID()
  const { error: eP } = await supabase.from('partidas_proyecto').insert({
    id: partidaId, proyecto_id: v.data.proyecto_id, parent_id: null, nivel: 1, es_grupo: true,
    orden: ultimo ? (Number(ultimo.orden) || 0) + 1 : 0,
    descripcion: v.data.beneficiario.slice(0, 200), unidad: 'gl',
    cantidad: 0, precio_unitario: 0, costo_unitario: 0, avance: 0, user_id: ownerId,
  })
  if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })

  const { data, error } = await supabase.from('viviendas')
    .insert({ ...v.data, partida_id: partidaId, user_id: ownerId }).select().single()
  if (error) {
    await supabase.from('partidas_proyecto').delete().eq('id', partidaId).eq('user_id', ownerId)
    return NextResponse.json({ error: faltaMigracion(error.message) ? AVISO_54 : error.message }, { status: 500 })
  }
  await marcarPrograma()
  return NextResponse.json({ ...data, valor: 0, avance: 0, partidas: 0 })
}

// ─── PUT: ficha y estado. `ids` + `estado` cambia varias a la vez ──
export async function PUT(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : []
  if (ids.length === 0) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const v = validarParcial(ViviendaSchema, body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id: _obra, ...cambios } = v.data
  // Varias a la vez: solo estado y fechas, nunca los datos de una persona
  if (ids.length > 1) for (const k of ['beneficiario', 'rut', 'direccion', 'rol_avaluo', 'telefono', 'subsidio_uf', 'ahorro_uf', 'notas']) delete cambios[k]

  // Las fechas acompañan al estado si no vienen escritas
  const aGuardar: Record<string, any> = { ...cambios }
  const ponerInicio = cambios.estado === 'en_ejecucion' && !cambios.fecha_inicio
  if (cambios.estado === 'terminada' && !aGuardar.fecha_termino) aGuardar.fecha_termino = hoy()
  if (cambios.estado === 'recepcionada' && !aGuardar.fecha_recepcion) aGuardar.fecha_recepcion = hoy()
  if (Object.keys(aGuardar).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })

  const { data, error } = await supabase.from('viviendas').update(aGuardar)
    .in('id', ids).eq('user_id', ownerId).select()
  if (error) return NextResponse.json({ error: faltaMigracion(error.message) ? AVISO_54 : error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Vivienda no encontrada' }, { status: 404 })

  // Solo si no tenía fecha de inicio
  if (ponerInicio) {
    await supabase.from('viviendas').update({ fecha_inicio: hoy() })
      .in('id', ids).eq('user_id', ownerId).is('fecha_inicio', null)
  }
  // El nombre del grupo de partidas sigue al del beneficiario
  if (ids.length === 1 && aGuardar.beneficiario) {
    await supabase.from('partidas_proyecto').update({ descripcion: String(aGuardar.beneficiario).slice(0, 200) })
      .eq('id', data[0].partida_id).eq('user_id', ownerId)
  }
  return NextResponse.json(ids.length === 1 ? data[0] : { ok: true, cambiadas: data.length })
}

// ─── DELETE: quita la ficha; con borrar_partidas, también el grupo y sus partidas ──
export async function DELETE(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const { id, borrar_partidas } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { data: viv } = await supabase.from('viviendas').select('id, proyecto_id, partida_id')
    .eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!viv) return NextResponse.json({ error: 'Vivienda no encontrada' }, { status: 404 })

  if (borrar_partidas) {
    // El grupo arrastra sus partidas y la ficha (cascade)
    const { error } = await supabase.from('partidas_proyecto').delete().eq('id', viv.partida_id).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recalcTodo(supabase, viv.proyecto_id, ownerId).catch(() => {})
  } else {
    const { error } = await supabase.from('viviendas').delete().eq('id', id).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// ─── PATCH: avance masivo. Deja en `avance`% una partida (por su nombre) o todas,
//     en las viviendas indicadas. Ej.: "Instalación EIFS al 100% en estas 12 casas".
export async function PATCH(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const body = await req.json().catch(() => null)
  const proyectoId = body?.proyecto_id
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
  const avance = Number(body?.avance)
  const partida = typeof body?.partida === 'string' ? body.partida.trim() : ''
  if (!proyectoId || ids.length === 0) return NextResponse.json({ error: 'Faltan la obra y las viviendas' }, { status: 400 })
  if (!(avance >= 0 && avance <= 100)) return NextResponse.json({ error: 'El avance debe estar entre 0 y 100' }, { status: 400 })

  try {
    const { data: fichas, error: eF } = await supabase.from('viviendas').select('id, partida_id')
      .eq('proyecto_id', proyectoId).eq('user_id', ownerId).in('id', ids)
    if (eF) throw new Error(eF.message)
    if ((fichas ?? []).length !== new Set(ids).size) return NextResponse.json({ error: 'Hay viviendas que no son de esta obra' }, { status: 400 })

    const todas = await traerPartidas<any>(supabase, proyectoId, ownerId, 'id, parent_id, descripcion, avance')
    const arbol = armarArbol(todas)
    const norm = (t: any) => String(t ?? '').trim().toLowerCase()
    const hojas: string[] = []
    for (const f of fichas ?? []) {
      for (const p of arbol.subarbol(f.partida_id)) {
        if (p.id === f.partida_id || arbol.hijosDe(p.id).length > 0) continue
        if (partida && norm((p as any).descripcion) !== norm(partida)) continue
        if (Number(p.avance) !== avance) hojas.push(p.id)
      }
    }
    for (let i = 0; i < hojas.length; i += 200) {
      const { error } = await supabase.from('partidas_proyecto').update({ avance })
        .in('id', hojas.slice(i, i + 200)).eq('user_id', ownerId)
      if (error) throw new Error(error.message)
    }
    const r = await recalcTodo(supabase, proyectoId, ownerId)

    // Una vivienda que llega a 100% queda terminada; una que empieza, en ejecución
    const tras = armarArbol((await traerPartidas<any>(supabase, proyectoId, ownerId)))
    const { data: estados } = await supabase.from('viviendas').select('id, partida_id, estado').in('id', ids).eq('user_id', ownerId)
    const terminadas: string[] = [], enCurso: string[] = []
    for (const v of estados ?? []) {
      const av = Math.round(tras.avance(v.partida_id))
      if (av >= 100 && (v.estado === 'pendiente' || v.estado === 'en_ejecucion')) terminadas.push(v.id)
      else if (av > 0 && av < 100 && v.estado === 'pendiente') enCurso.push(v.id)
    }
    if (terminadas.length) await supabase.from('viviendas').update({ estado: 'terminada', fecha_termino: hoy() }).in('id', terminadas).eq('user_id', ownerId)
    if (enCurso.length) await supabase.from('viviendas').update({ estado: 'en_ejecucion', fecha_inicio: hoy() }).in('id', enCurso).eq('user_id', ownerId).is('fecha_inicio', null)
    if (enCurso.length) await supabase.from('viviendas').update({ estado: 'en_ejecucion' }).in('id', enCurso).eq('user_id', ownerId)

    return NextResponse.json({ ok: true, partidas: hojas.length, avance_obra: r.avanceProyecto, terminadas: terminadas.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudo registrar el avance' }, { status: 500 })
  }
}

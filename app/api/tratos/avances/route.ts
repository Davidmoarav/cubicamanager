// app/api/tratos/avances/route.ts
// Avances de un trato: lo ejecutado, su aprobación y su pago.
//   Aprobado, de trabajadores → se reparte en la cuadrilla y entra a la liquidación del mes.
//   Aprobado, de un tercero   → su bruto es gasto de la obra.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { AvanceTratoSchema, validar } from '@/lib/validar'
import { aplicarGastos } from '@/lib/gastos-server'
import { lectorSueldos } from '@/lib/supabase-admin'
import { calcularAvanceTrato, errorAvanceTrato, repartirTrato } from '@/lib/tratos'
import { AVISO_55, faltaTratos, rangoMes } from '@/lib/tratos-server'
import { NextResponse } from 'next/server'

async function sesion() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id, ownerId: (await getOwnerId(supabase)) || user.id }
}
const error55 = (msg: string) => NextResponse.json({ error: faltaTratos(msg) ? AVISO_55 : msg }, { status: 500 })

// ─── POST: registrar un avance (queda por aprobar) ──
export async function POST(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const v = validar(AvanceTratoSchema, await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const [{ data: trato, error: eT }, { data: previos }] = await Promise.all([
    supabase.from('tratos').select('*').eq('id', v.data.trato_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('trato_avances').select('cantidad').eq('trato_id', v.data.trato_id).eq('user_id', ownerId),
  ])
  if (eT) return error55(eT.message)
  if (!trato) return NextResponse.json({ error: 'Trato no encontrado' }, { status: 404 })
  if (trato.estado !== 'vigente') return NextResponse.json({ error: 'El trato no está vigente' }, { status: 400 })

  const falla = errorAvanceTrato(trato, previos ?? [], v.data.cantidad)
  if (falla) return NextResponse.json({ error: falla }, { status: 400 })

  const { data, error } = await supabase.from('trato_avances').insert({
    trato_id: trato.id, proyecto_id: trato.proyecto_id, fecha: v.data.fecha, cantidad: v.data.cantidad,
    ...calcularAvanceTrato(trato, v.data.cantidad), estado: 'borrador', notas: v.data.notas || null, user_id: ownerId,
  }).select().single()
  if (error) return error55(error.message)
  return NextResponse.json(data)
}

const PASOS: Record<string, string[]> = {
  borrador: ['aprobado'],
  aprobado: ['pagado', 'borrador'],
  pagado: ['aprobado'],
}

// ─── PUT: aprobar, pagar o deshacer ──
export async function PUT(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, userId, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const { id, estado } = await req.json().catch(() => ({}))
  if (!id || !estado) return NextResponse.json({ error: 'Faltan id y estado' }, { status: 400 })

  const { data: avance, error: eA } = await supabase.from('trato_avances').select('*, trato:tratos(*)')
    .eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (eA) return error55(eA.message)
  if (!avance?.trato) return NextResponse.json({ error: 'Avance no encontrado' }, { status: 404 })
  if (avance.estado === estado) return NextResponse.json(avance)
  if (!(PASOS[avance.estado] ?? []).includes(estado)) {
    return NextResponse.json({ error: `Un avance ${avance.estado} no puede pasar a ${estado}` }, { status: 400 })
  }

  const trato = avance.trato
  const deTerceros = trato.ejecutor === 'tercero'
  const periodo = String(avance.fecha).slice(0, 7)
  const entraOSale = avance.estado === 'borrador' || estado === 'borrador'   // cambia lo que se debe
  let aviso: string | undefined

  if (entraOSale && !deTerceros) {
    const { data: cuadrilla, error: eC } = await supabase.from('trato_participantes')
      .select('empleado_id, porcentaje').eq('trato_id', trato.id).eq('user_id', ownerId)
    if (eC) return error55(eC.message)
    const ids = (cuadrilla ?? []).map((p: any) => p.empleado_id)
    if (ids.length === 0) return NextResponse.json({ error: 'El trato no tiene trabajadores asignados' }, { status: 400 })

    // Un mes ya pagado no se mueve: primero hay que deshacer ese pago
    const { data: pagadas, error: eL } = await lectorSueldos(supabase).from('liquidaciones').select('empleado_id')
      .eq('user_id', ownerId).eq('periodo', periodo).eq('estado', 'pagada').in('empleado_id', ids)
    if (eL) return NextResponse.json({ error: eL.message }, { status: 500 })
    if ((pagadas ?? []).length > 0) {
      return NextResponse.json({
        error: `La liquidación de ${periodo} ya está pagada para ${pagadas!.length === 1 ? 'un trabajador' : pagadas!.length + ' trabajadores'} de este trato. Deshaz ese pago o registra el avance con fecha del mes siguiente.`,
      }, { status: 400 })
    }

    if (estado === 'aprobado') {
      // Reparto por días: los días que cada uno trabajó en esta obra durante el mes del avance
      let dias: Record<string, number> = {}
      if (trato.reparto === 'dias') {
        const { desde, hasta } = rangoMes(periodo)
        const { data: partes, error: eP } = await supabase.from('parte_diario').select('empleado_id, fecha')
          .eq('proyecto_id', trato.proyecto_id).eq('user_id', ownerId).in('empleado_id', ids).gte('fecha', desde).lt('fecha', hasta)
        if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })
        const vistos = new Set<string>()
        for (const p of partes ?? []) {
          const k = `${p.empleado_id}|${p.fecha}`
          if (vistos.has(k)) continue
          vistos.add(k)
          dias[p.empleado_id] = (dias[p.empleado_id] || 0) + 1
        }
        if (vistos.size === 0) aviso = 'Nadie de la cuadrilla tiene parte diario en esta obra este mes: se repartió en partes iguales.'
      }
      const partes = repartirTrato(Number(avance.bruto) || 0,
        (cuadrilla ?? []).map((p: any) => ({ ...p, dias: dias[p.empleado_id] ?? 0 })), trato.reparto)
      await supabase.from('trato_avance_reparto').delete().eq('avance_id', id).eq('user_id', ownerId)
      const { error: eR } = await supabase.from('trato_avance_reparto')
        .insert(partes.map(p => ({ avance_id: id, empleado_id: p.empleado_id, monto: p.monto, user_id: ownerId })))
      if (eR) return error55(eR.message)
      aviso = [aviso, `Entra a la liquidación de ${periodo}: si ya estaba guardada, vuelve a guardarla en Remuneraciones.`].filter(Boolean).join(' ')
    } else {
      const { error: eR } = await supabase.from('trato_avance_reparto').delete().eq('avance_id', id).eq('user_id', ownerId)
      if (eR) return error55(eR.message)
      aviso = `Sale de la liquidación de ${periodo}: si ya estaba guardada, vuelve a guardarla en Remuneraciones.`
    }
  }

  if (entraOSale && deTerceros) {
    try {
      await aplicarGastos(supabase, ownerId, 'trato_avance_id', id, estado === 'aprobado' ? [{
        proyecto_id: trato.proyecto_id,
        partida_id: trato.partida_id,
        fecha: avance.fecha,
        categoria: 'mano_obra',
        descripcion: `Trato ${trato.tercero_nombre || ''} · ${trato.descripcion}`.slice(0, 300),
        monto: Number(avance.bruto) || 0,
      }] : [])
    } catch (e: any) {
      return error55(e?.message ?? 'No se pudo registrar el gasto de la obra')
    }
  }

  const { data, error } = await supabase.from('trato_avances').update({
    estado,
    ...(estado === 'aprobado' && avance.estado === 'borrador' ? { aprobado_por: userId, aprobado_en: new Date().toISOString() } : {}),
    ...(estado === 'borrador' ? { aprobado_por: null, aprobado_en: null } : {}),
  }).eq('id', id).eq('user_id', ownerId).select().single()
  if (error) return error55(error.message)
  return NextResponse.json({ ...data, ...(aviso ? { aviso } : {}) })
}

// ─── DELETE: solo lo que aún no se aprueba ──
export async function DELETE(req: Request) {
  const s = await sesion()
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { supabase, ownerId } = s
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { data: avance } = await supabase.from('trato_avances').select('estado').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!avance) return NextResponse.json({ error: 'Avance no encontrado' }, { status: 404 })
  if (avance.estado !== 'borrador') return NextResponse.json({ error: 'Deshaz la aprobación antes de eliminar el avance' }, { status: 400 })
  const { error } = await supabase.from('trato_avances').delete().eq('id', id).eq('user_id', ownerId)
  if (error) return error55(error.message)
  return NextResponse.json({ ok: true })
}

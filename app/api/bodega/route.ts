// app/api/bodega/route.ts
// Bodega por obra. Lo comprado ya es gasto al recibirlo: el consumo controla el
// material sin volver a contarlo. El traspaso sí mueve el costo entre obras.
//   GET ?proyecto_id=X  → stock valorizado + últimos movimientos
//   POST                → entrada manual, consumo, ajuste o traspaso
//   DELETE { id }       → elimina un movimiento manual (el traspaso, con su par)
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { MovimientoBodegaSchema, validar } from '@/lib/validar'
import { partidaEsDeProyecto, traerTodo } from '@/lib/costos-server'
import { calcularStock, materialQueQuedaNegativo, partidaUnicaDeEntradas, stockDe } from '@/lib/bodega'
import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

const traerMovimientos = (supabase: any, ownerId: string, proyectoId: string) =>
  traerTodo<any>((d, h) => supabase.from('bodega_movimientos').select('*')
    .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('id').range(d, h))

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  try {
    const movs = await traerMovimientos(supabase, ownerId, proyectoId)
    const recientes = [...movs]
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 100)
    return NextResponse.json({ stock: calcularStock(movs), movimientos: recientes })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo la bodega' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(MovimientoBodegaSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { tipo, proyecto_id, material, cantidad, fecha, partida_id, destino_id, notas, costo_unitario } = v.data
  const unidad = v.data.unidad || 'un'

  const { data: proy } = await supabase
    .from('proyectos').select('id, nombre').eq('id', proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  if (partida_id && !(await partidaEsDeProyecto(supabase, ownerId, partida_id, proyecto_id))) {
    return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
  }
  if (tipo !== 'ajuste' && cantidad < 0) {
    return NextResponse.json({ error: 'La cantidad debe ser mayor que 0' }, { status: 400 })
  }

  try {
    const movs = await traerMovimientos(supabase, ownerId, proyecto_id)
    const linea = stockDe(movs, material, unidad)
    const stock = linea?.stock ?? 0
    const costo = linea?.costo_promedio ?? 0
    const sale = tipo === 'consumo' || tipo === 'traspaso' ? cantidad : tipo === 'ajuste' && cantidad < 0 ? -cantidad : 0
    if (sale > stock) {
      return NextResponse.json({ error: `Stock insuficiente de "${material}": hay ${stock} ${unidad}` }, { status: 400 })
    }

    const base = { material: linea?.material ?? material, unidad: linea?.unidad ?? unidad, fecha, notas: notas || null, user_id: ownerId }

    if (tipo === 'traspaso') {
      if (!destino_id || destino_id === proyecto_id) {
        return NextResponse.json({ error: 'Elige una obra de destino distinta' }, { status: 400 })
      }
      const { data: dest } = await supabase
        .from('proyectos').select('id, nombre').eq('id', destino_id).eq('user_id', ownerId).maybeSingle()
      if (!dest) return NextResponse.json({ error: 'Obra de destino no encontrada' }, { status: 404 })

      const traspaso_id = randomUUID()
      const { error } = await supabase.from('bodega_movimientos').insert([
        { ...base, proyecto_id, tipo, cantidad: -cantidad, costo_unitario: costo, traspaso_id, partida_id: null },
        { ...base, proyecto_id: destino_id, tipo, cantidad, costo_unitario: costo, traspaso_id, partida_id: null },
      ])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // El costo se va con el material
      const valor = Math.round(cantidad * costo)
      if (valor !== 0) {
        const fila = { fecha, categoria: 'materiales', proveedor: null, traspaso_id, user_id: ownerId }
        const { error: eG } = await supabase.from('gastos_obra').insert([
          { ...fila, proyecto_id, partida_id: partidaUnicaDeEntradas(movs, material, unidad), monto: -valor, descripcion: `Traspaso de ${base.material} a ${dest.nombre}` },
          { ...fila, proyecto_id: destino_id, partida_id: null, monto: valor, descripcion: `Traspaso de ${base.material} desde ${proy.nombre}` },
        ])
        if (eG) {
          await supabase.from('bodega_movimientos').delete().eq('traspaso_id', traspaso_id).eq('user_id', ownerId)
          return NextResponse.json({ error: eG.message }, { status: 500 })
        }
      }
      return NextResponse.json({ ok: true, traspaso_id })
    }

    const { data, error } = await supabase.from('bodega_movimientos').insert({
      ...base, proyecto_id, tipo,
      cantidad: tipo === 'consumo' ? -cantidad : cantidad,
      costo_unitario: tipo === 'entrada' ? (costo_unitario ?? 0) : costo,
      partida_id: partida_id || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error registrando el movimiento' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  try {
    const { data: mov } = await supabase
      .from('bodega_movimientos').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
    if (!mov) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
    if (mov.recepcion_id) {
      return NextResponse.json({ error: 'Esta entrada viene de una recepción: reviértela desde la orden de compra' }, { status: 400 })
    }

    let quitados: any[] = [mov]
    if (mov.traspaso_id) {
      const { data: par } = await supabase
        .from('bodega_movimientos').select('*').eq('traspaso_id', mov.traspaso_id).eq('user_id', ownerId)
      quitados = par ?? [mov]
    }

    for (const proyectoId of new Set(quitados.map(m => m.proyecto_id))) {
      const movs = await traerMovimientos(supabase, ownerId, proyectoId as string)
      const material = materialQueQuedaNegativo(movs, quitados.map(m => m.id))
      if (material) {
        return NextResponse.json({ error: `No se puede eliminar: "${material}" quedaría con stock negativo` }, { status: 400 })
      }
    }

    if (mov.traspaso_id) {
      const { error: eG } = await supabase.from('gastos_obra').delete().eq('traspaso_id', mov.traspaso_id).eq('user_id', ownerId)
      if (eG) return NextResponse.json({ error: eG.message }, { status: 500 })
    }
    const { error } = await supabase.from('bodega_movimientos').delete().in('id', quitados.map(m => m.id)).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error eliminando el movimiento' }, { status: 500 })
  }
}

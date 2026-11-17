// app/api/filtro/proyecto/route.ts
//
// Pasa un grupo del Filtro DS27 a una obra:
// 1. Crea la obra en UF con el total de las viviendas incluidas
// 2. Por cada vivienda: un grupo, su partida (neta, en pesos al valor UF indicado) y su ficha de beneficiario
// 3. Enlaza el grupo con la obra
// Con rollback manual si algo falla. El Filtro solo lo leen dueño, admin y jefe de obra (RLS).

import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { evaluarTodos } from '@/lib/filtro/evaluacion'
import { netoPesos, obraDesdeGrupo } from '@/lib/filtro/proyecto'
import type { Grupo, Llamado, Postulante } from '@/lib/filtro/tipos'
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Pedido = z.object({
  grupo_id: z.string().uuid(),
  nombre: z.string().trim().min(1, 'Falta el nombre de la obra').max(200),
  cliente: z.string().trim().min(1, 'Falta el cliente').max(200),
  valor_uf: z.number().positive('Falta el valor de la UF').max(1_000_000),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
})

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = Pedido.safeParse(await req.json().catch(() => null))
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const { grupo_id, nombre, cliente, valor_uf, inicio } = v.data

  // 1. Grupo, llamado y postulantes (RLS: si no puede ver el Filtro, no encuentra el grupo)
  const { data: grupo } = await supabase
    .from('filtro_grupos').select('*').eq('id', grupo_id).eq('user_id', ownerId).maybeSingle()
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  if (grupo.proyecto_id) {
    const { data: ya } = await supabase.from('proyectos').select('id').eq('id', grupo.proyecto_id).maybeSingle()
    if (ya) return NextResponse.json({ error: 'Este grupo ya pasó a una obra', proyecto_id: ya.id }, { status: 409 })
  }
  const [{ data: llamado }, { data: postulantes, error: ep }] = await Promise.all([
    supabase.from('filtro_llamados').select('*').eq('id', grupo.llamado_id).maybeSingle(),
    supabase.from('filtro_postulantes').select('*').eq('grupo_id', grupo_id),
  ])
  if (!llamado || ep) return NextResponse.json({ error: 'No se pudo leer el llamado del grupo' }, { status: 500 })

  const evaluados = evaluarTodos((postulantes ?? []) as Postulante[], [grupo as Grupo], [llamado as Llamado])
  const obra = obraDesdeGrupo(grupo as Grupo, llamado as Llamado, evaluados)
  if (obra.viviendas.length === 0) {
    return NextResponse.json({ error: 'El grupo no tiene postulantes incluidos' }, { status: 400 })
  }

  // Mismo criterio que al convertir una cotización: el costo se deriva del precio con el markup de la empresa
  const { data: cfg } = await supabase
    .from('empresa_config').select('markup_default').eq('user_id', ownerId).maybeSingle()
  const markup = Number(cfg?.markup_default) || 20
  const precios = obra.viviendas.map((x) => netoPesos(x.montoUF, valor_uf))

  // 2. Obra
  const { data: proyecto, error: e1 } = await supabase
    .from('proyectos')
    .insert({
      nombre,
      cliente,
      descripcion: obra.descripcion.slice(0, 2000),
      valor: obra.totalUF,
      moneda: 'uf',
      valor_uf,
      monto_contrato: precios.reduce((s, n) => s + n, 0),
      avance: 0,
      estado: 'activo',
      inicio: inicio || new Date().toISOString().split('T')[0],
      fin: null,
      markup_global: markup,
      user_id: ownerId,
    })
    .select()
    .single()
  // Datos del programa (sql/54). Aparte, para que la obra se cree igual si la migración aún no corre.
  if (proyecto) {
    await supabase.from('proyectos').update({
      tipo: 'programa', programa: 'DS27', codigo_grupo: grupo.codigo || null,
      resolucion: llamado.resolucion || null, comuna: grupo.comuna || null,
    }).eq('id', proyecto.id).eq('user_id', ownerId)
  }
  if (e1 || !proyecto) return NextResponse.json({ error: 'Error al crear la obra: ' + (e1?.message ?? '') }, { status: 500 })

  const deshacer = async () => {
    await supabase.from('partidas_proyecto').delete().eq('proyecto_id', proyecto.id).eq('user_id', ownerId)
    await supabase.from('proyectos').delete().eq('id', proyecto.id).eq('user_id', ownerId)
  }

  // 3. Por vivienda: grupo (la vivienda) → partida (sus obras). Misma forma que el programa importado
  //    por Excel, así el cobro por beneficiario, la matriz y las fotos funcionan igual.
  const idsGrupo = obra.viviendas.map(() => randomUUID())
  const { error: e2 } = await supabase.from('partidas_proyecto').insert([
    ...obra.viviendas.map((x, i) => ({
      id: idsGrupo[i],
      proyecto_id: proyecto.id,
      parent_id: null,
      nivel: 1,
      es_grupo: true,
      orden: i,
      descripcion: x.descripcion,
      unidad: 'gl',
      cantidad: 0,
      precio_unitario: 0,
      costo_unitario: 0,
      markup_pct: null,
      avance: 0,
      user_id: ownerId,
    })),
    ...obra.viviendas.map((x, i) => ({
      id: randomUUID(),
      proyecto_id: proyecto.id,
      parent_id: idsGrupo[i],
      nivel: 2,
      es_grupo: false,
      orden: 0,
      descripcion: 'Obras de la vivienda',
      unidad: 'viv',
      cantidad: 1,
      precio_unitario: precios[i],
      costo_unitario: Math.round(precios[i] / (1 + markup / 100)),
      markup_pct: markup,
      avance: 0,
      user_id: ownerId,
    })),
  ])
  if (e2) {
    await deshacer()
    return NextResponse.json({ error: 'Error al crear las partidas: ' + e2.message }, { status: 500 })
  }

  // 3b. Ficha de cada vivienda (sql/54). Si la tabla aún no existe, la obra queda creada igual.
  const { error: eViv } = await supabase.from('viviendas').insert(
    obra.viviendas.map((x, i) => ({
      proyecto_id: proyecto.id,
      partida_id: idsGrupo[i],
      beneficiario: x.beneficiario,
      rut: x.rut,
      direccion: x.direccion,
      telefono: x.telefono,
      subsidio_uf: x.subsidioUF,
      ahorro_uf: x.ahorroUF,
      postulante_id: x.postulante_id,
      user_id: ownerId,
    })),
  )
  const sinFichas = !!eViv

  // 4. Enlace del grupo con la obra
  const { error: e3 } = await supabase.from('filtro_grupos').update({ proyecto_id: proyecto.id }).eq('id', grupo_id)
  if (e3) {
    await deshacer()
    const falta = /proyecto_id/.test(e3.message)
    return NextResponse.json({
      error: falta ? 'Falta activar el paso a obra en la base de datos (sql/51_filtro_a_proyecto.sql).' : 'Error al enlazar el grupo: ' + e3.message,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, proyecto_id: proyecto.id, viviendas: obra.viviendas.length, total_uf: obra.totalUF,
    ...(sinFichas ? { aviso: 'La obra se creó, pero sin fichas de vivienda: falta ejecutar sql/54_viviendas.sql.' } : {}),
  })
}

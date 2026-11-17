// app/api/partidas-proyecto/importar-programa/route.ts
// Importa un PROGRAMA con varios beneficiarios (grilla horizontal).
// ESTRUCTURA DE 2 NIVELES:
//   Nivel 1: cada beneficiario/persona = subproyecto (agrupador, es_grupo).
//   Nivel 2: sus partidas reales (hojas) con costo y avance.
// El subproyecto (M1/M4) y la etapa del Excel se guardan como "categoria"
// dentro de cada partida (campo notas), para poder agruparlas en el resumen
// sin crear niveles extra en el árbol.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { recalcTodo } from '@/lib/avance-server'
import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  const { proyecto_id, beneficiarios, markup = 20, reemplazar = false } = body
  if (!proyecto_id || !Array.isArray(beneficiarios)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // FK: el proyecto debe pertenecer a ESTA organización
  const { data: proyOk } = await supabase
    .from('proyectos').select('id').eq('id', proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proyOk) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Si se pide reemplazar, borrar TODAS las partidas actuales del proyecto
  // (evita acumular partidas de importaciones previas)
  if (reemplazar) {
    const { error: eDel } = await supabase
      .from('partidas_proyecto')
      .delete()
      .eq('proyecto_id', proyecto_id)
      .eq('user_id', ownerId)
    if (eDel) return NextResponse.json({ error: 'No se pudieron limpiar las partidas previas: ' + eDel.message }, { status: 500 })
  }

  const factor = 1 + Number(markup) / 100
  let creados = 0

  // Sin reemplazar, los beneficiarios nuevos van después de los que ya existen
  let ordenBenef = 0
  if (!reemplazar) {
    const { data: ultimo } = await supabase.from('partidas_proyecto').select('orden')
      .eq('proyecto_id', proyecto_id).eq('user_id', ownerId).is('parent_id', null)
      .order('orden', { ascending: false }).limit(1).maybeSingle()
    if (ultimo) ordenBenef = (Number(ultimo.orden) || 0) + 1
  }

  // Los ids se generan aquí: todos los beneficiarios entran en un lote y sus partidas
  // en otro, en vez de una consulta por beneficiario.
  const grupos: any[] = []
  const hojas: any[] = []
  for (const benef of beneficiarios) {
    const idBenef = randomUUID()
    // Nivel 1: el beneficiario/persona (agrupador = subproyecto)
    grupos.push({
      id: idBenef, proyecto_id, parent_id: null, nivel: 1, es_grupo: true,
      descripcion: String(benef.nombre || 'Beneficiario').slice(0, 200),
      unidad: 'gl', cantidad: 0, costo_unitario: 0, precio_unitario: 0, avance: 0, orden: ordenBenef++,
      user_id: ownerId,
    })
    // Nivel 2 (hojas): partidas reales de la persona.
    // La categoría (M1/etapa) se guarda en notas para agrupar en el resumen.
    ;(benef.partidas || []).forEach((p: any, i: number) => {
      const mat = Math.round(Number(p.material) || 0)
      const mo  = Math.round(Number(p.mano_obra) || 0)
      const costo = mat + mo
      hojas.push({
        proyecto_id, parent_id: idBenef, nivel: 2, es_grupo: false,
        descripcion: String(p.descripcion || 'Partida').slice(0, 200),
        unidad: String(p.unidad || 'm2').slice(0, 20),
        cantidad: Number(p.cantidad) || 0,
        costo_material_unit: mat, costo_mo_unit: mo, costo_unitario: costo,
        markup_pct: Number(markup), precio_unitario: Math.round(costo * factor),
        avance: 0, orden: i, notas: String(p.categoria || '').slice(0, 200) || null,
        user_id: ownerId,
      })
    })
  }

  const LOTE = 500
  try {
    for (const filas of [grupos, hojas]) {
      for (let i = 0; i < filas.length; i += LOTE) {
        const lote = filas.slice(i, i + LOTE)
        const { error } = await supabase.from('partidas_proyecto').insert(lote)
        if (error) throw error
        creados += lote.length
      }
    }
  } catch (err: any) {
    // No dejar el programa a medias: se retira lo que alcanzó a entrar en esta importación
    const ids = grupos.map(g => g.id)
    for (let i = 0; i < ids.length; i += 200) {
      await supabase.from('partidas_proyecto').delete().in('id', ids.slice(i, i + 200)).eq('user_id', ownerId)
    }
    return NextResponse.json({
      error: 'Error al importar: ' + (err.message || 'desconocido') + '. No se guardó nada de este archivo.',
      creados: 0,
    }, { status: 500 })
  }

  // Ficha de cada vivienda y obra marcada como programa (sql/54). Si la migración aún no corre,
  // el programa queda importado igual y las fichas se crean después desde la pestaña Viviendas.
  const { error: eViv } = await supabase.from('viviendas').insert(
    grupos.map((g, i) => ({
      proyecto_id, partida_id: g.id, beneficiario: g.descripcion,
      rut: String(beneficiarios[i]?.rut || '').slice(0, 20) || null,
      direccion: String(beneficiarios[i]?.direccion || '').slice(0, 300) || null,
      user_id: ownerId,
    })),
  )
  if (!eViv) await supabase.from('proyectos').update({ tipo: 'programa' }).eq('id', proyecto_id).eq('user_id', ownerId)

  // El avance de la obra cambia: las partidas nuevas parten en 0%
  await recalcTodo(supabase, proyecto_id, ownerId).catch(() => {})

  return NextResponse.json({ ok: true, creados, beneficiarios: beneficiarios.length, fichas: !eViv })
}

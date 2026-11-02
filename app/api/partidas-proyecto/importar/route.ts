// app/api/partidas-proyecto/importar/route.ts
// Recibe una estructura jerárquica (subproyectos → etapas → partidas) ya
// parseada en el cliente, y la crea en árbol dentro del proyecto.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura } from '@/lib/roles'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { proyecto_id, subproyectos, markup = 20 } = body
  if (!proyecto_id || !Array.isArray(subproyectos)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const factor = 1 + Number(markup) / 100
  let creados = 0
  let ordenSub = 0

  try {
    for (const sub of subproyectos) {
      // Nivel 1: subproyecto (agrupador)
      const { data: n1, error: e1 } = await supabase.from('partidas_proyecto').insert({
        proyecto_id, parent_id: null, nivel: 1, es_grupo: true,
        descripcion: String(sub.nombre || 'Subproyecto').slice(0, 200),
        unidad: 'gl', cantidad: 0, costo_unitario: 0, precio_unitario: 0,
        avance: 0, orden: ordenSub++, user_id: user.id,
      }).select('id').single()
      if (e1) throw e1
      creados++

      let ordenEt = 0
      for (const et of (sub.etapas || [])) {
        // Nivel 2: etapa (agrupador)
        const { data: n2, error: e2 } = await supabase.from('partidas_proyecto').insert({
          proyecto_id, parent_id: n1!.id, nivel: 2, es_grupo: true,
          descripcion: String(et.nombre || 'Etapa').slice(0, 200),
          unidad: 'gl', cantidad: 0, costo_unitario: 0, precio_unitario: 0,
          avance: 0, orden: ordenEt++, user_id: user.id,
        }).select('id').single()
        if (e2) throw e2
        creados++

        // Nivel 3: partidas reales (con costo material + mano de obra)
        const filas = (et.partidas || []).map((p: any, i: number) => {
          const mat = Math.round(Number(p.material) || 0)
          const mo  = Math.round(Number(p.mano_obra) || 0)
          const costo = mat + mo
          return {
            proyecto_id, parent_id: n2!.id, nivel: 3, es_grupo: false,
            descripcion: String(p.descripcion || 'Partida').slice(0, 200),
            unidad: String(p.unidad || 'm2').slice(0, 20),
            cantidad: Number(p.cantidad) || 0,
            costo_material_unit: mat,
            costo_mo_unit: mo,
            costo_unitario: costo,
            markup_pct: Number(markup),
            precio_unitario: Math.round(costo * factor),
            avance: 0, orden: i, user_id: user.id,
          }
        })
        if (filas.length > 0) {
          const { error: e3 } = await supabase.from('partidas_proyecto').insert(filas)
          if (e3) throw e3
          creados += filas.length
        }
      }
    }
  } catch (err: any) {
    return NextResponse.json({
      error: 'Error al importar: ' + (err.message || 'desconocido'),
      creados,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, creados })
}
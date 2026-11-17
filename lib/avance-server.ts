// lib/avance-server.ts
// Lee las partidas de una obra y guarda el avance calculado (lib/avance.ts).
import { calcularAvances, type NodoAvance } from './avance'
import { traerTodo } from './costos-server'

const COLUMNAS = 'id, parent_id, cantidad, precio_unitario, avance'

/** Partidas de una obra, completas: PostgREST corta en 1000 filas sin avisar. */
export function traerPartidas<T = any>(supabase: any, proyectoId: string, ownerId: string, columnas = COLUMNAS): Promise<T[]> {
  return traerTodo<T>((d, h) => supabase.from('partidas_proyecto').select(columnas)
    .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('id').range(d, h))
}

/** Recalcula y guarda el avance de los grupos y de la obra. */
export async function recalcTodo(supabase: any, proyectoId: string, ownerId: string) {
  const todas = await traerPartidas<NodoAvance>(supabase, proyectoId, ownerId)
  const { cambios, avanceProyecto } = calcularAvances(todas)

  // Un UPDATE por valor de avance (a lo más 101), no uno por grupo
  const porAvance = new Map<number, string[]>()
  for (const c of cambios) {
    const ids = porAvance.get(c.avance)
    if (ids) ids.push(c.id)
    else porAvance.set(c.avance, [c.id])
  }
  const escrituras: PromiseLike<any>[] = []
  for (const [avance, ids] of porAvance) {
    for (let i = 0; i < ids.length; i += 200) {
      escrituras.push(supabase.from('partidas_proyecto').update({ avance })
        .in('id', ids.slice(i, i + 200)).eq('user_id', ownerId))
    }
  }
  escrituras.push(supabase.from('proyectos').update({ avance: avanceProyecto }).eq('id', proyectoId).eq('user_id', ownerId))
  await Promise.all(escrituras)
  return { avanceProyecto, grupos: cambios.length }
}

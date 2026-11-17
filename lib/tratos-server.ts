// lib/tratos-server.ts
// Lee de Supabase lo que necesitan los cálculos de lib/tratos.ts.
import { traerTodo } from './costos-server'
import { variablesDelMes, type VariablesMes } from './tratos'
import { REM_DEFAULTS } from '../types/finanzas'

// Las tablas de tratos llegan con sql/55: si faltan, se dice cuál ejecutar
export const faltaTratos = (msg?: string) => /does not exist|could not find the table|schema cache/i.test(msg ?? '')
export const AVISO_55 = 'Falta activar los tratos en la base de datos (sql/55_tratos.sql).'

export const rangoMes = (periodo: string) => {
  const [y, m] = periodo.split('-').map(Number)
  const siguiente = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { desde: `${periodo}-01`, hasta: `${siguiente}-01` }
}

export interface TratoDelMes { empleado_id: string; fecha: string; monto: number; proyecto_id: string; partida_id: string | null }

/** Lo que cada trabajador ganó en tratos aprobados o pagados con fecha en el mes. Sin sql/55: nada. */
export async function tratosDelMes(supabase: any, ownerId: string, periodo: string, empleadoId?: string): Promise<TratoDelMes[]> {
  const { desde, hasta } = rangoMes(periodo)
  try {
    const avances = await traerTodo<any>((d, h) => supabase.from('trato_avances')
      .select('id, fecha, proyecto_id, trato:tratos(partida_id)')
      .eq('user_id', ownerId).in('estado', ['aprobado', 'pagado']).gte('fecha', desde).lt('fecha', hasta)
      .order('id').range(d, h))
    if (avances.length === 0) return []
    const porId = new Map(avances.map(a => [a.id, a]))
    const out: TratoDelMes[] = []
    const ids = [...porId.keys()]
    for (let i = 0; i < ids.length; i += 200) {
      let q = supabase.from('trato_avance_reparto').select('avance_id, empleado_id, monto')
        .eq('user_id', ownerId).in('avance_id', ids.slice(i, i + 200))
      if (empleadoId) q = q.eq('empleado_id', empleadoId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      for (const r of data ?? []) {
        const a = porId.get(r.avance_id)
        out.push({
          empleado_id: r.empleado_id, fecha: a.fecha, monto: Number(r.monto) || 0,
          proyecto_id: a.proyecto_id, partida_id: a.trato?.partida_id ?? null,
        })
      }
    }
    return out
  } catch (e: any) {
    if (faltaTratos(e?.message)) return []
    throw e
  }
}

/** Días, horas, trato y semana corrida del mes, por trabajador. */
export async function cargarVariablesMes(
  supabase: any, ownerId: string, periodo: string, empleados: any[],
  params?: { dias_laborales?: number | null; ingreso_minimo?: number | null } | null
): Promise<Record<string, VariablesMes>> {
  const { desde, hasta } = rangoMes(periodo)
  const uno = empleados.length === 1 ? empleados[0].id : undefined
  if (params === undefined) {
    const { data } = await supabase.from('parametros_remuneracion').select('*').eq('user_id', ownerId).maybeSingle()
    params = data
  }
  const dias: 5 | 6 = Number(params?.dias_laborales) === 6 ? 6 : 5
  const minimo = Number(params?.ingreso_minimo) || REM_DEFAULTS.ingreso_minimo || 0
  const [partes, tratos] = await Promise.all([
    traerTodo<any>((d, h) => {
      let q = supabase.from('parte_diario').select('empleado_id, fecha, horas')
        .eq('user_id', ownerId).gte('fecha', desde).lt('fecha', hasta)
      if (uno) q = q.eq('empleado_id', uno)
      return q.order('id').range(d, h)
    }),
    tratosDelMes(supabase, ownerId, periodo, uno),
  ])

  const agrupar = <T extends { empleado_id: string }>(filas: T[]) => {
    const m = new Map<string, T[]>()
    for (const f of filas) { const l = m.get(f.empleado_id); if (l) l.push(f); else m.set(f.empleado_id, [f]) }
    return m
  }
  const partesDe = agrupar(partes)
  const tratosDe = agrupar(tratos)

  const out: Record<string, VariablesMes> = {}
  for (const e of empleados) {
    out[e.id] = variablesDelMes(e, partesDe.get(e.id) ?? [], tratosDe.get(e.id) ?? [], periodo, dias, minimo)
  }
  return out
}

// lib/imputacion-sueldos.ts
// Reparte el costo de cada liquidación entre obras y partidas, según las horas
// del parte diario, y lo registra como gasto de obra.
//
//   costo = total de haberes + aportes del empleador
//   Con horas en el mes → se reparte proporcional a las horas registradas.
//   Sin horas en el mes → va completo a la obra asignada al empleado.
import { aportesEmpleador, REM_DEFAULTS } from '../types/finanzas'
import { aplicarGastos } from './gastos-server'

export interface HorasObra {
  proyecto_id: string
  partida_id?: string | null
  horas: number
}

export interface TramoSueldo {
  proyecto_id: string
  partida_id: string | null
  horas: number
  monto: number
}

// Función pura. Los tramos suman EXACTO el costo (método del mayor resto).
export function repartirCosto(costo: number, horas: HorasObra[], obraAsignada?: string | null): TramoSueldo[] {
  const total = Math.round(Number(costo) || 0)
  if (total <= 0) return []

  const grupos = new Map<string, { proyecto_id: string; partida_id: string | null; horas: number }>()
  for (const h of horas) {
    const cant = Number(h.horas) || 0
    if (cant <= 0) continue
    const clave = claveTramo(h.proyecto_id, h.partida_id)
    const g = grupos.get(clave)
    if (g) g.horas += cant
    else grupos.set(clave, { proyecto_id: h.proyecto_id, partida_id: h.partida_id || null, horas: cant })
  }

  if (grupos.size === 0) {
    return obraAsignada ? [{ proyecto_id: obraAsignada, partida_id: null, horas: 0, monto: total }] : []
  }

  const lista = [...grupos.values()]
  const totalHoras = lista.reduce((s, g) => s + g.horas, 0)
  const tramos = lista.map(g => {
    const exacto = total * g.horas / totalHoras
    return { ...g, monto: Math.floor(exacto), resto: exacto - Math.floor(exacto) }
  })

  let faltante = total - tramos.reduce((s, t) => s + t.monto, 0)
  for (const t of [...tramos].sort((a, b) => b.resto - a.resto)) {
    if (faltante <= 0) break
    t.monto += 1
    faltante -= 1
  }

  return tramos.map(({ resto, ...t }) => t)
}

const claveTramo = (proyectoId: string, partidaId?: string | null) => `${proyectoId}|${partidaId || ''}`

const rangoMes = (periodo: string) => {
  const [y, m] = periodo.split('-').map(Number)
  const siguiente = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { desde: `${periodo}-01`, hasta: `${siguiente}-01` }
}

// Deja los gastos de la liquidación iguales al reparto actual (idempotente).
export async function sincronizarGastoSueldo(supabase: any, ownerId: string, liq: any) {
  const { desde, hasta } = rangoMes(liq.periodo)

  const [emp, params, horas] = await Promise.all([
    supabase.from('empleados').select('proyecto_id, nombre, contrato_tipo')
      .eq('id', liq.empleado_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('parametros_remuneracion').select('*').eq('user_id', ownerId).maybeSingle(),
    supabase.from('parte_diario').select('proyecto_id, partida_id, horas')
      .eq('empleado_id', liq.empleado_id).eq('user_id', ownerId).gte('fecha', desde).lt('fecha', hasta),
  ])
  const errorCarga = emp.error || params.error || horas.error
  if (errorCarga) throw new Error(errorCarga.message)

  const aportes = aportesEmpleador(liq, emp.data?.contrato_tipo, { ...REM_DEFAULTS, ...(params.data ?? {}) })
  const costo = (Number(liq.total_haberes) || 0) + aportes.total
  const tramos = repartirCosto(costo, horas.data ?? [], emp.data?.proyecto_id)

  await aplicarGastos(supabase, ownerId, 'liquidacion_id', liq.id, tramos.map(t => ({
    proyecto_id: t.proyecto_id,
    partida_id: t.partida_id,
    fecha: desde,
    categoria: 'mano_obra',
    descripcion: `Sueldo ${emp.data?.nombre || ''} · ${liq.periodo}${t.horas ? ` · ${t.horas} h` : ''}`,
    monto: t.monto,
  })))
}

// Reimputa las liquidaciones ya generadas tras un cambio en el parte diario.
export async function reimputarSueldos(supabase: any, ownerId: string, empleadoIds: string[], periodo: string) {
  if (empleadoIds.length === 0) return
  const { data, error } = await supabase
    .from('liquidaciones').select('*')
    .eq('user_id', ownerId).eq('periodo', periodo).in('empleado_id', empleadoIds)
  if (error) throw new Error(error.message)
  for (const liq of data ?? []) await sincronizarGastoSueldo(supabase, ownerId, liq)
}

// lib/gastos-server.ts
// Gastos de obra automáticos: los deja iguales a lo que dice su documento de origen.
import { epCuentaComoGasto } from './subcontratos'

const claveGasto = (proyectoId: string, partidaId?: string | null) => `${proyectoId}|${partidaId || ''}`

export interface FilaGasto {
  proyecto_id: string
  partida_id?: string | null
  [campo: string]: any
}

// Idempotente, por obra y partida. Inserta antes de borrar: si algo falla,
// el costo no desaparece de la obra.
export async function aplicarGastos(supabase: any, ownerId: string, columna: string, idOrigen: string, filas: FilaGasto[]) {
  const { data: actuales, error: eCarga } = await supabase
    .from('gastos_obra').select('id, proyecto_id, partida_id')
    .eq(columna, idOrigen).eq('user_id', ownerId)
  if (eCarga) throw new Error(eCarga.message)

  const porClave = new Map<string, any>()
  const sobrantes: string[] = []
  for (const g of actuales ?? []) {
    const clave = claveGasto(g.proyecto_id, g.partida_id)
    if (porClave.has(clave)) sobrantes.push(g.id)
    else porClave.set(clave, g)
  }

  for (const f of filas) {
    const fila = { ...f, partida_id: f.partida_id || null, [columna]: idOrigen, user_id: ownerId }
    const clave = claveGasto(f.proyecto_id, f.partida_id)
    const existente = porClave.get(clave)
    const { error } = existente
      ? await supabase.from('gastos_obra').update(fila).eq('id', existente.id).eq('user_id', ownerId)
      : await supabase.from('gastos_obra').insert(fila)
    if (error) throw new Error(error.message)
    porClave.delete(clave)
  }

  const obsoletos = [...sobrantes, ...[...porClave.values()].map(g => g.id)]
  if (obsoletos.length > 0) {
    const { error } = await supabase.from('gastos_obra').delete().in('id', obsoletos).eq('user_id', ownerId)
    if (error) throw new Error(error.message)
  }
}

// Al asociar una factura a un documento, cuenta como gasto de esa obra.
export async function atribuirFactura(
  supabase: any, ownerId: string, facturaId: string,
  destino: { proyecto_id?: string | null; proyecto?: string | null; partida_id?: string | null }
) {
  const { error } = await supabase.from('facturas')
    .update({
      proyecto: destino.proyecto || null,
      proyecto_id: destino.proyecto_id || null,
      // Sin partida en el documento, la factura conserva la suya
      ...(destino.partida_id ? { partida_id: destino.partida_id } : {}),
    })
    .eq('id', facturaId).eq('user_id', ownerId)
  if (error) throw new Error(error.message)
}

// Estado de pago de subcontrato: su bruto es gasto de obra si está aprobado o pagado.
// Con factura asociada cuenta la factura (evita el doble conteo).
export async function sincronizarGastoEP(supabase: any, ownerId: string, ep: any, sub: any) {
  const filas = epCuentaComoGasto(ep) ? [{
    proyecto_id: sub.proyecto_id,
    partida_id: sub.partida_id,
    fecha: ep.fecha,
    categoria: 'subcontrato',
    descripcion: `${sub.subcontratista} · EP N°${ep.numero}`,
    monto: Number(ep.bruto) || 0,
  }] : []
  await aplicarGastos(supabase, ownerId, 'subcontrato_ep_id', ep.id, filas)
}

// Uso de equipo: su monto es gasto de obra, salvo que tenga factura asociada.
export async function sincronizarGastoUso(supabase: any, ownerId: string, uso: any, nombreEquipo: string) {
  const filas = uso.factura_id ? [] : [{
    proyecto_id: uso.proyecto_id,
    partida_id: uso.partida_id,
    fecha: uso.fecha_desde,
    categoria: 'equipos',
    descripcion: `${nombreEquipo} · ${uso.cantidad} × ${uso.tarifa}`,
    monto: Number(uso.monto) || 0,
  }]
  await aplicarGastos(supabase, ownerId, 'equipo_uso_id', uso.id, filas)
}

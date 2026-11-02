// lib/compras-server.ts
// Órdenes de compra contra la base: carga, recepción y gasto de obra.
import { aplicarGastos } from './gastos-server'
import { conciliar, estadoSegunRecepciones, gastosDeOC, type LineaOC, type RecepcionOC } from './recepciones'

export async function cargarOC(supabase: any, ownerId: string, ordenId: string) {
  const [oc, lineas, recepciones] = await Promise.all([
    supabase.from('ordenes_compra').select('*').eq('id', ordenId).eq('user_id', ownerId).maybeSingle(),
    supabase.from('orden_compra_lineas').select('*').eq('orden_id', ordenId).eq('user_id', ownerId).order('created_at', { ascending: true }),
    supabase.from('recepciones_oc').select('*').eq('orden_id', ordenId).eq('user_id', ownerId).order('created_at', { ascending: true }),
  ])
  const error = oc.error || lineas.error || recepciones.error
  if (error) throw new Error(error.message)
  return { oc: oc.data, lineas: (lineas.data ?? []) as LineaOC[], recepciones: (recepciones.data ?? []) as (RecepcionOC & { id: string })[] }
}

// Deja el estado y los gastos de la OC iguales a lo recibido.
export async function sincronizarOC(supabase: any, ownerId: string, ordenId: string) {
  const { oc, lineas, recepciones } = await cargarOC(supabase, ownerId, ordenId)
  if (!oc) return null

  let actual = oc
  const estado = estadoSegunRecepciones(oc.estado, lineas, recepciones)
  if (estado !== oc.estado) {
    const { data, error } = await supabase.from('ordenes_compra')
      .update({ estado }).eq('id', ordenId).eq('user_id', ownerId).select().single()
    if (error) throw new Error(error.message)
    actual = data
  }

  const descripcion = `Orden #${actual.numero}${actual.proveedor ? ' · ' + actual.proveedor : ''}`
  await aplicarGastos(supabase, ownerId, 'orden_compra_id', ordenId,
    gastosDeOC(actual, lineas, recepciones).map(g => ({ ...g, categoria: 'materiales', descripcion })))
  return actual
}

// Registra lo recibido y lo ingresa a la bodega de la obra.
export async function registrarRecepcion(
  supabase: any, ownerId: string, oc: any, lineas: LineaOC[],
  items: { linea_id: string; cantidad: number; a_bodega?: boolean }[],
  datos: { fecha: string; documento?: string | null; notas?: string | null }
) {
  const { data: creadas, error } = await supabase.from('recepciones_oc')
    .insert(items.map(it => ({
      orden_id: oc.id, linea_id: it.linea_id, cantidad: it.cantidad,
      fecha: datos.fecha, documento: datos.documento || null, notas: datos.notas || null, user_id: ownerId,
    })))
    .select()
  if (error) throw new Error(error.message)

  if (oc.proyecto_id) {
    const entradas = (creadas ?? []).flatMap((r: any) => {
      const item = items.find(it => it.linea_id === r.linea_id)
      const linea = lineas.find(l => l.id === r.linea_id)
      if (!linea || item?.a_bodega === false) return []
      return [{
        proyecto_id: oc.proyecto_id, material: linea.material, unidad: linea.unidad || 'un', tipo: 'entrada',
        cantidad: r.cantidad, costo_unitario: Number(linea.precio_unitario) || 0, fecha: datos.fecha,
        partida_id: linea.partida_id || oc.partida_id || null, recepcion_id: r.id,
        notas: `Orden #${oc.numero}${datos.documento ? ` · ${datos.documento}` : ''}`, user_id: ownerId,
      }]
    })
    if (entradas.length > 0) {
      const { error: eB } = await supabase.from('bodega_movimientos').insert(entradas)
      if (eB) {
        // Sin entrada a bodega, la recepción queda a medias: se deshace
        await supabase.from('recepciones_oc').delete().in('id', (creadas ?? []).map((r: any) => r.id)).eq('user_id', ownerId)
        throw new Error(eB.message)
      }
    }
  }
  return creadas ?? []
}

// OC ↔ factura: compara lo recibido con lo facturado (neto de sus notas).
// Una factura puede pagar varias órdenes: se concilia contra todas.
export async function conciliacionDeOC(supabase: any, ownerId: string, oc: any, lineas: LineaOC[], recepciones: RecepcionOC[]) {
  if (!oc.factura_id) return conciliar([{ neto: oc.neto, lineas, recepciones }], null)

  const [factura, notas, hermanas] = await Promise.all([
    supabase.from('facturas').select('numero, neto').eq('id', oc.factura_id).eq('user_id', ownerId).maybeSingle(),
    supabase.from('facturas').select('neto, doc_tipo').eq('factura_ref', oc.factura_id).eq('user_id', ownerId),
    supabase.from('ordenes_compra').select('id, neto').eq('factura_id', oc.factura_id).eq('user_id', ownerId),
  ])
  const error = factura.error || notas.error || hermanas.error
  if (error) throw new Error(error.message)

  const ordenes = await Promise.all((hermanas.data ?? []).map(async (o: any) => {
    if (o.id === oc.id) return { neto: o.neto, lineas, recepciones }
    const otra = await cargarOC(supabase, ownerId, o.id)
    return { neto: o.neto, lineas: otra.lineas, recepciones: otra.recepciones }
  }))
  const facturado = (Number(factura.data?.neto) || 0) + (notas.data ?? []).reduce((s: number, n: any) =>
    s + (n.doc_tipo === 'nota_credito' ? -Math.abs(Number(n.neto) || 0) : Number(n.neto) || 0), 0)
  return { ...conciliar(ordenes, facturado), factura_numero: factura.data?.numero ?? null, n_ordenes: ordenes.length }
}

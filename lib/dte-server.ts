// lib/dte-server.ts
// Prepara y registra la emisión de un DTE contra la base.
import { construirDTE, tipoDTE, type DocumentoDTE, type ParteDTE } from './dte'
import type { ProveedorDTE } from './dte-proveedores'

const ESTADOS_VIGENTES = ['enviando', 'enviado', 'aceptado']

async function buscarReceptor(supabase: any, ownerId: string, factura: any): Promise<ParteDTE> {
  let cliente: any = null
  if (factura.proyecto_id) {
    const { data: proy } = await supabase
      .from('proyectos').select('cliente_id').eq('id', factura.proyecto_id).eq('user_id', ownerId).maybeSingle()
    if (proy?.cliente_id) {
      const { data } = await supabase.from('clientes').select('*').eq('id', proy.cliente_id).eq('user_id', ownerId).maybeSingle()
      cliente = data
    }
  }
  if (!cliente && factura.cliente) {
    const { data } = await supabase.from('clientes').select('*').eq('razon_social', factura.cliente).eq('user_id', ownerId).limit(1)
    cliente = data?.[0] ?? null
  }
  return {
    rut: cliente?.rut || factura.rut_contraparte || null,
    razon_social: cliente?.razon_social || factura.cliente || null,
    giro: cliente?.giro ?? null,
    direccion: cliente?.direccion ?? null,
    comuna: cliente?.comuna ?? null,
  }
}

async function emisionVigente(supabase: any, ownerId: string, facturaId: string, modo: string) {
  const { data, error } = await supabase.from('dte_emisiones').select('*')
    .eq('factura_id', facturaId).eq('user_id', ownerId).eq('modo', modo).in('estado', ESTADOS_VIGENTES).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

// Vista previa: lo que se emitiría y lo que falta para poder hacerlo
export async function prepararDTE(supabase: any, ownerId: string, facturaId: string, modo: string, codigoReferencia?: number) {
  const { data: factura } = await supabase
    .from('facturas').select('*').eq('id', facturaId).eq('user_id', ownerId).maybeSingle()
  if (!factura) return null

  const [{ data: empresa }, receptor] = await Promise.all([
    supabase.from('empresa_config').select('*').eq('user_id', ownerId).maybeSingle(),
    buscarReceptor(supabase, ownerId, factura),
  ])

  // Una nota necesita el folio real de la factura que modifica
  let referencia: { tipo_dte: number; folio?: string | null; fecha?: string | null } | null = null
  if (factura.factura_ref) {
    const { data: ref } = await supabase
      .from('facturas').select('*').eq('id', factura.factura_ref).eq('user_id', ownerId).maybeSingle()
    if (ref) {
      // Solo cuenta la emisión del mismo modo: un folio demo no existe para el SII
      const emitida = await emisionVigente(supabase, ownerId, ref.id, modo)
      referencia = {
        tipo_dte: emitida?.tipo_dte ?? tipoDTE(ref) ?? 33,
        folio: emitida?.folio ?? (/^\d+$/.test(String(ref.numero ?? '')) ? String(ref.numero) : null),
        fecha: ref.emision ?? null,
      }
    }
  }

  const emisor: ParteDTE = {
    rut: empresa?.rut, razon_social: empresa?.razon_social, giro: empresa?.giro,
    direccion: empresa?.direccion, comuna: empresa?.comuna,
  }
  return { factura, ...construirDTE({ factura, emisor, receptor, referencia, codigoReferencia }) }
}

export async function emitirDTE(
  supabase: any, ownerId: string, facturaId: string, proveedor: ProveedorDTE, codigoReferencia?: number
) {
  const prep = await prepararDTE(supabase, ownerId, facturaId, proveedor.modo, codigoReferencia)
  if (!prep) return { codigo: 404, error: 'Documento no encontrado' }
  if (prep.errores.length > 0 || !prep.documento) {
    return { codigo: 400, error: 'Faltan datos para emitir', errores: prep.errores }
  }
  if (await emisionVigente(supabase, ownerId, facturaId, proveedor.modo)) {
    return { codigo: 400, error: 'Este documento ya fue emitido' }
  }

  // Se registra ANTES de enviar: el índice único impide emitir dos veces en paralelo
  const documento: DocumentoDTE = prep.documento
  const { data: emision, error: eI } = await supabase.from('dte_emisiones').insert({
    factura_id: facturaId, tipo_dte: documento.tipo_dte, estado: 'enviando',
    modo: proveedor.modo, proveedor: proveedor.nombre, documento, user_id: ownerId,
  }).select().single()
  if (eI) {
    const repetida = /duplicate key|unique/i.test(eI.message)
    return { codigo: repetida ? 400 : 500, error: repetida ? 'Este documento ya se está emitiendo' : eI.message }
  }

  try {
    const r = await proveedor.emitir(documento, emision.id)
    const { data: final, error: eU } = await supabase.from('dte_emisiones').update({
      estado: r.estado, folio: r.folio, track_id: r.track_id ?? null, pdf_url: r.pdf_url ?? null,
      respuesta: r.detalle ?? null, updated_at: new Date().toISOString(),
    }).eq('id', emision.id).eq('user_id', ownerId).select().single()
    if (eU) throw new Error(eU.message)

    // Solo un folio real pasa a ser el número del documento
    if (proveedor.modo === 'produccion' && r.folio && r.estado !== 'rechazado') {
      await supabase.from('facturas').update({ numero: r.folio }).eq('id', facturaId).eq('user_id', ownerId)
    }
    return { codigo: 200, emision: final }
  } catch (e: any) {
    const mensaje = e?.message ?? 'Error al emitir'
    // Sin respuesta no se sabe si el proveedor lo recibió: revisar antes de reintentar
    await supabase.from('dte_emisiones').update({ estado: 'error', error: mensaje, updated_at: new Date().toISOString() })
      .eq('id', emision.id).eq('user_id', ownerId)
    return { codigo: 502, error: mensaje }
  }
}

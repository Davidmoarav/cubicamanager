// app/api/importar-sii/route.ts
// Importación masiva del Registro de Compras y Ventas (RCV) del SII.
// Recibe filas ya parseadas desde el cliente, las VALIDA una a una,
// descarta duplicados (clave con RUT) e inserta por lotes tolerantes:
// si un lote falla, reintenta fila a fila y reporta cuáles fallaron.
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { claveFactura, claveFacturaLegacy, normalizarRut, parseFechaSII } from '@/lib/sii'
import { NextResponse } from 'next/server'

const DOC_TIPOS = ['factura', 'boleta', 'nota_credito', 'nota_debito']

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { filas, tipo } = await req.json()  // tipo: 'compra' | 'venta'
  if (!['compra', 'venta'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }
  if (!Array.isArray(filas) || filas.length === 0) {
    return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 })
  }
  if (filas.length > 5000) {
    return NextResponse.json({ error: 'Máximo 5.000 filas por importación' }, { status: 400 })
  }

  // ¿Existe ya la columna rut_contraparte? (sql/33). Si no, se importa
  // igual pero sin RUT (dedup con clave antigua) y se avisa en la respuesta.
  const { error: probeErr } = await supabase
    .from('facturas').select('rut_contraparte').limit(1)
  const tieneRut = !probeErr

  // ── Normalizar y validar cada fila en el servidor ──
  const invalidas: { fila: number; motivo: string }[] = []
  const normalizadas = filas.map((f: any, i: number) => {
    const emision = parseFechaSII(f.emision)                     // null si no es fecha válida
    const periodo = /^\d{4}-\d{2}$/.test(f.periodo || '') ? f.periodo
                  : (emision ? emision.slice(0, 7) : null)
    const doc_tipo = DOC_TIPOS.includes(f.doc_tipo) ? f.doc_tipo : 'factura'
    const neto  = Math.round(Number(f.neto)  || 0)
    const iva   = Math.round(Number(f.iva)   || 0)
    const total = Math.round(Number(f.total) || 0)
    if (neto === 0 && iva === 0 && total === 0) {
      invalidas.push({ fila: i + 1, motivo: 'sin montos' })
      return null
    }
    const fila: Record<string, any> = {
      numero:    String(f.numero ?? '').trim() || null,
      cliente:   String(f.contraparte || '').trim() || 'Sin nombre',
      tipo,
      doc_tipo,
      factura_ref: f.factura_ref || null,     // id (uuid) de la factura asociada, si vino
      neto, iva, monto: total,
      emision, periodo,
      estado: tipo === 'compra' ? 'pagada' : 'pendiente',
      user_id: ownerId,
    }
    if (tieneRut) fila.rut_contraparte = normalizarRut(f.rut) || null
    return fila
  }).filter((f): f is NonNullable<typeof f> => f !== null)

  // ── Duplicados: clave nueva (con RUT) + clave antigua (sin RUT) ──
  // La antigua evita re-importar lo cargado antes de existir rut_contraparte.
  const { data: existentes, error: e0 } = await supabase
    .from('facturas')
    .select(tieneRut ? 'numero, periodo, doc_tipo, rut_contraparte' : 'numero, periodo, doc_tipo')
    .eq('user_id', ownerId)
    .eq('tipo', tipo)
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })

  const yaExiste = new Set<string>()
  // cast: el select dinámico (con/sin rut_contraparte) confunde al parser de tipos de supabase-js
  for (const f of (existentes ?? []) as any[]) {
    yaExiste.add(claveFactura(f))
    yaExiste.add(claveFacturaLegacy(f))
  }

  const vistasEnArchivo = new Set<string>()   // dedup dentro del mismo archivo
  const filasInsertar = normalizadas.filter(f => {
    const k = claveFactura(f)
    if (yaExiste.has(k) || yaExiste.has(claveFacturaLegacy(f))) return false
    if (vistasEnArchivo.has(k)) return false
    vistasEnArchivo.add(k)
    return true
  })
  const duplicadas = normalizadas.length - filasInsertar.length

  if (filasInsertar.length === 0) {
    return NextResponse.json({
      ok: true, insertadas: 0, duplicadas, omitidas: invalidas.length,
      mensaje: 'Todas las facturas ya estaban registradas',
    })
  }

  // ── Insertar por lotes; si un lote falla, reintenta fila a fila ──
  let insertadas = 0
  const fallidas: { numero: string | null; motivo: string }[] = []
  for (let i = 0; i < filasInsertar.length; i += 100) {
    const lote = filasInsertar.slice(i, i + 100)
    const { error } = await supabase.from('facturas').insert(lote)
    if (!error) { insertadas += lote.length; continue }
    // El lote falló: no abortar la importación — aislar la(s) fila(s) mala(s)
    for (const fila of lote) {
      const { error: e1 } = await supabase.from('facturas').insert(fila)
      if (e1) fallidas.push({ numero: fila.numero, motivo: e1.message })
      else insertadas++
    }
  }

  return NextResponse.json({
    ok: fallidas.length === 0,
    insertadas,
    duplicadas,
    omitidas: invalidas.length,
    fallidas: fallidas.length,
    detalle_fallidas: fallidas.slice(0, 5),
    advertencia: tieneRut ? null
      : 'Ejecuta sql/33_factura_rut.sql para deduplicar por RUT (dos proveedores pueden repetir folio)',
  })
}

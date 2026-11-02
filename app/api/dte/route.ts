// app/api/dte/route.ts
// Emisión de documentos tributarios electrónicos.
//   GET                  → emisiones de la empresa
//   GET ?factura_id=X    → vista previa: documento, lo que falta y la emisión vigente
//   POST { factura_id, codigo_referencia } → emite con el proveedor configurado
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { traerTodo } from '@/lib/costos-server'
import { NOMBRE_DTE } from '@/lib/dte'
import { proveedorDTE } from '@/lib/dte-proveedores'
import { emitirDTE, prepararDTE } from '@/lib/dte-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const facturaId = req.nextUrl.searchParams.get('factura_id')

  try {
    if (!facturaId) {
      return NextResponse.json(await traerTodo<any>((d, h) => supabase.from('dte_emisiones')
        .select('id, factura_id, tipo_dte, estado, modo, folio, error, created_at')
        .eq('user_id', ownerId).order('created_at', { ascending: false }).range(d, h)))
    }

    const codigo = Number(req.nextUrl.searchParams.get('codigo_referencia')) || undefined
    const proveedor = proveedorDTE()
    const prep = await prepararDTE(supabase, ownerId, facturaId, proveedor.modo, codigo)
    if (!prep) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

    const { data: emisiones, error } = await supabase.from('dte_emisiones').select('*')
      .eq('factura_id', facturaId).eq('user_id', ownerId).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    return NextResponse.json({
      modo: proveedor.modo,
      proveedor: proveedor.nombre,
      nombre_tipo: prep.documento ? NOMBRE_DTE[prep.documento.tipo_dte] : null,
      documento: prep.documento,
      errores: prep.errores,
      factura: { id: prep.factura.id, numero: prep.factura.numero, doc_tipo: prep.factura.doc_tipo },
      // Un número de folio suele indicar que ya se emitió fuera de este sistema
      ya_tiene_folio: /^\d+$/.test(String(prep.factura.numero ?? '')),
      emisiones: emisiones ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo la emisión' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { factura_id, codigo_referencia } = await req.json()
  if (!factura_id) return NextResponse.json({ error: 'Falta factura_id' }, { status: 400 })

  try {
    const { codigo, ...resultado } = await emitirDTE(
      supabase, ownerId, factura_id, proveedorDTE(), Number(codigo_referencia) || undefined)
    return NextResponse.json(resultado, { status: codigo })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error al emitir' }, { status: 500 })
  }
}

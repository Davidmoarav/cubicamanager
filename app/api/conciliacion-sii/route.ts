// app/api/conciliacion-sii/route.ts
// Compara un Registro de Compras y Ventas con los documentos cargados.
// Solo informa: no modifica nada (cálculo en lib/conciliacion-sii.ts).
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { traerTodo } from '@/lib/costos-server'
import { conciliarRegistro } from '@/lib/conciliacion-sii'
import { NextResponse } from 'next/server'

const MAX_FILAS = 20000

export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'facturacion')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { tipo, periodo, filas } = await req.json()
  if (!['compra', 'venta'].includes(tipo)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if (!/^\d{4}-\d{2}$/.test(String(periodo))) return NextResponse.json({ error: 'Período inválido (YYYY-MM)' }, { status: 400 })
  if (!Array.isArray(filas)) return NextResponse.json({ error: 'Faltan las filas del registro' }, { status: 400 })
  if (filas.length > MAX_FILAS) return NextResponse.json({ error: `El registro supera las ${MAX_FILAS} filas` }, { status: 400 })

  try {
    const documentos = await traerTodo<any>((d, h) => supabase.from('facturas')
      .select('id, numero, cliente, rut_contraparte, doc_tipo, neto, iva, monto, emision, periodo')
      .eq('user_id', ownerId).eq('tipo', tipo).order('id').range(d, h))
    return NextResponse.json(conciliarRegistro(filas, documentos, periodo))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error al conciliar' }, { status: 500 })
  }
}

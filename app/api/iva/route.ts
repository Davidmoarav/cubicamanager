// app/api/iva/route.ts
// Resumen de IVA por período considerando notas de crédito y débito.
//
//   IVA Débito (ventas)  = IVA facturas venta + IVA notas débito venta − IVA notas crédito venta
//   IVA Crédito (compras)= IVA facturas compra + IVA notas débito compra − IVA notas crédito compra
//   IVA a pagar = Débito − Crédito
import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select('*')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const arr = facturas ?? []

  type Periodo = {
    periodo: string
    iva_debito: number
    iva_credito: number
    neto_ventas: number
    neto_compras: number
    n_ventas: number
    n_compras: number
    iva_nc_venta: number   // notas crédito venta (restan débito)
    iva_nd_venta: number   // notas débito venta (suman débito)
    iva_nc_compra: number
    iva_nd_compra: number
  }

  const periodos: Record<string, Periodo> = {}

  for (const f of arr) {
    const per = f.periodo || (f.emision ? f.emision.slice(0, 7) : 'sin-periodo')
    if (!periodos[per]) {
      periodos[per] = {
        periodo: per, iva_debito: 0, iva_credito: 0,
        neto_ventas: 0, neto_compras: 0, n_ventas: 0, n_compras: 0,
        iva_nc_venta: 0, iva_nd_venta: 0, iva_nc_compra: 0, iva_nd_compra: 0,
      }
    }
    const p = periodos[per]
    const iva = Number(f.iva) || 0
    const neto = Number(f.neto) || 0
    const docTipo = f.doc_tipo || 'factura'
    const esVenta = f.tipo !== 'compra'

    if (docTipo === 'nota_credito') {
      // Nota de crédito: resta del IVA de su tipo
      if (esVenta) { p.iva_debito -= iva; p.iva_nc_venta += iva }
      else         { p.iva_credito -= iva; p.iva_nc_compra += iva }
    } else if (docTipo === 'nota_debito') {
      // Nota de débito: suma al IVA de su tipo
      if (esVenta) { p.iva_debito += iva; p.iva_nd_venta += iva }
      else         { p.iva_credito += iva; p.iva_nd_compra += iva }
    } else {
      // Factura normal
      if (esVenta) { p.iva_debito += iva; p.neto_ventas += neto; p.n_ventas += 1 }
      else         { p.iva_credito += iva; p.neto_compras += neto; p.n_compras += 1 }
    }
  }

  const resumen = Object.values(periodos)
    .map(p => ({ ...p, iva_a_pagar: p.iva_debito - p.iva_credito }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo))

  return NextResponse.json(resumen)
}

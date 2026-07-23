// app/api/iva/route.ts
// Resumen de IVA por período considerando notas de crédito y débito, más PPM.
//
//   IVA Débito (ventas)  = IVA facturas venta + IVA notas débito venta − IVA notas crédito venta
//   IVA Crédito (compras)= IVA facturas compra + IVA notas débito compra − IVA notas crédito compra
//   IVA a pagar = Débito − Crédito
//   PPM = tasa% (editable, según lo informado por el SII a cada contribuyente) × ventas netas del mes
//   Total a pagar al SII = IVA a pagar + PPM
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { calcularResumenIVA, type PPMConfigPorPeriodo } from '@/lib/iva'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'finanzas')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const [{ data: facturas, error }, { data: ppmRows }] = await Promise.all([
    supabase.from('facturas').select('*').eq('user_id', ownerId),
    supabase.from('ppm_config').select('*').eq('user_id', ownerId),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ppmPorPeriodo: PPMConfigPorPeriodo = {}
  for (const row of ppmRows ?? []) {
    ppmPorPeriodo[row.periodo] = { regimen: row.regimen, tasa: Number(row.tasa) || 0 }
  }

  // Cálculo puro y testeable en lib/iva.ts
  return NextResponse.json(calcularResumenIVA(facturas ?? [], ppmPorPeriodo))
}

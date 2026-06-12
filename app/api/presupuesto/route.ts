// app/api/presupuesto/route.ts
// Presupuesto con COSTO + MARKUP y GASTO REAL por obra.
//
//   presupuesto_costo  = suma de (cantidad x costo_unitario)        [lo planificado]
//   presupuesto_venta  = suma de (cantidad x precio_unitario)       [costo + markup]
//   ganancia_esperada  = venta - costo
//   gasto_real         = facturas de compra del proyecto + gastos manuales  [lo REAL]
//   desviacion         = presupuesto_costo - gasto_real  (verde si positivo)
//   ganancia_real      = venta_ejecutada - gasto_real
import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [{ data: proyectos }, { data: partidas }, { data: gastos }, { data: facturas }] = await Promise.all([
    supabase.from('proyectos').select('*').eq('user_id', user.id),
    supabase.from('partidas_proyecto').select('*').eq('user_id', user.id),
    supabase.from('gastos_obra').select('*').eq('user_id', user.id),
    supabase.from('facturas').select('*').eq('user_id', user.id),
  ])

  const arrProy = proyectos ?? []
  const arrPart = partidas ?? []
  const arrGastos = gastos ?? []
  const arrFacturas = facturas ?? []

  const resumen = arrProy.map(proy => {
    const padres = arrPart.filter(p => p.proyecto_id === proy.id && !p.parent_id)
    const hijos  = arrPart.filter(p => p.proyecto_id === proy.id && p.parent_id)

    let presupuestoCosto = 0
    let presupuestoVenta = 0
    let costoEjecutado   = 0
    let ventaEjecutada   = 0

    for (const padre of padres) {
      const cant  = Number(padre.cantidad) || 0
      const costo = cant * (Number(padre.costo_unitario) || 0)
      const venta = cant * (Number(padre.precio_unitario) || 0)
      presupuestoCosto += costo
      presupuestoVenta += venta

      const hijosPadre = hijos.filter(h => h.parent_id === padre.id)
      const avance = hijosPadre.length > 0
        ? hijosPadre.reduce((s, h) => s + (Number(h.avance) || 0), 0) / hijosPadre.length
        : (Number(padre.avance) || 0)

      costoEjecutado += costo * avance / 100
      ventaEjecutada += venta * avance / 100
    }

    // ─── GASTO REAL: gastos manuales + facturas de compra del proyecto ───
    const gastosProy = arrGastos.filter(g => g.proyecto_id === proy.id)
    const gastoManual = gastosProy.reduce((s, g) => s + (Number(g.monto) || 0), 0)

    const facturasCompraProy = arrFacturas.filter(f =>
      (f.tipo === 'compra') &&
      (f.doc_tipo || 'factura') === 'factura' &&
      f.proyecto === proy.nombre
    )
    const gastoFacturas = facturasCompraProy.reduce((s, f) => s + (Number(f.neto) || 0), 0)

    const gastoReal = gastoManual + gastoFacturas

    // Gasto real por partida (para el detalle)
    const gastoPorPartida: Record<string, number> = {}
    for (const g of gastosProy) {
      if (g.partida_id) gastoPorPartida[g.partida_id] = (gastoPorPartida[g.partida_id] || 0) + (Number(g.monto) || 0)
    }

    const gananciaEsperada = presupuestoVenta - presupuestoCosto
    const desviacion = presupuestoCosto - gastoReal       // + = vas bajo presupuesto
    const gananciaReal = ventaEjecutada - gastoReal       // utilidad real a la fecha
    const markupReal = presupuestoCosto > 0 ? Math.round((gananciaEsperada / presupuestoCosto) * 100) : 0
    const margenVentaPct = presupuestoVenta > 0 ? Math.round((gananciaEsperada / presupuestoVenta) * 100) : 0
    const pctEjecutado = presupuestoVenta > 0 ? Math.round((ventaEjecutada / presupuestoVenta) * 100) : 0
    const pctGastado = presupuestoCosto > 0 ? Math.round((gastoReal / presupuestoCosto) * 100) : 0

    return {
      proyecto_id: proy.id,
      nombre: proy.nombre,
      cliente: proy.cliente,
      estado: proy.estado,
      avance_fisico: Number(proy.avance) || 0,
      n_partidas: padres.length,
      // Presupuesto
      presupuesto_costo: Math.round(presupuestoCosto),
      presupuesto_venta: Math.round(presupuestoVenta),
      ganancia_esperada: Math.round(gananciaEsperada),
      markup_real: markupReal,
      margen_venta_pct: margenVentaPct,
      // Ejecutado teórico (avance)
      costo_ejecutado: Math.round(costoEjecutado),
      venta_ejecutada: Math.round(ventaEjecutada),
      pct_ejecutado: pctEjecutado,
      // GASTO REAL
      gasto_real: Math.round(gastoReal),
      gasto_manual: Math.round(gastoManual),
      gasto_facturas: Math.round(gastoFacturas),
      gasto_por_partida: gastoPorPartida,
      desviacion: Math.round(desviacion),
      ganancia_real: Math.round(gananciaReal),
      pct_gastado: pctGastado,
      // Compat
      presupuesto_partidas: Math.round(presupuestoVenta),
      ejecutado: Math.round(ventaEjecutada),
      valor_contrato: Number(proy.valor) || 0,
      pct_presupuesto: pctEjecutado,
    }
  })

  return NextResponse.json(resumen)
}

// app/api/finanzas/consolidado/route.ts
// Consolidado de la empresa por obra: ingresos, costos e IVA. El total es la suma
// de las obras más "Sin obra" (cálculo en lib/consolidado.ts).
//   GET ?periodo=YYYY-MM  → un mes · sin período → todo el historial
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { traerTodo } from '@/lib/costos-server'
import { consolidarPorObra } from '@/lib/consolidado'
import { aportesEmpleador, REM_DEFAULTS } from '@/types/finanzas'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'finanzas')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const periodo = req.nextUrl.searchParams.get('periodo') || undefined
  if (periodo && !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido (YYYY-MM)' }, { status: 400 })
  }

  try {
    const [proyectos, facturas, gastos, liquidaciones, empleados, params] = await Promise.all([
      traerTodo<any>((d, h) => supabase.from('proyectos').select('id, nombre').eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('facturas')
        .select('id, tipo, doc_tipo, estado, neto, iva, monto, periodo, emision, proyecto, proyecto_id, partida_id, factura_ref')
        .eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('gastos_obra').select('proyecto_id, monto, fecha, liquidacion_id')
        .eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('liquidaciones').select('*').eq('user_id', ownerId).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('empleados').select('id, contrato_tipo').eq('user_id', ownerId).order('id').range(d, h)),
      supabase.from('parametros_remuneracion').select('*').eq('user_id', ownerId).maybeSingle(),
    ])

    // Lo que no llegó a ninguna obra sigue siendo costo de la empresa
    const conObra = new Set(gastos.filter(g => g.liquidacion_id).map(g => g.liquidacion_id))
    const parametros = { ...REM_DEFAULTS, ...(params.data ?? {}) }
    const nominaSinObra = liquidaciones.filter(l => !conObra.has(l.id)).map(l => {
      const contrato = empleados.find(e => e.id === l.empleado_id)?.contrato_tipo
      return { periodo: l.periodo, monto: (Number(l.total_haberes) || 0) + aportesEmpleador(l, contrato, parametros).total }
    })

    return NextResponse.json(consolidarPorObra({ facturas, gastos, nominaSinObra, proyectos, periodo }))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error armando el consolidado' }, { status: 500 })
  }
}

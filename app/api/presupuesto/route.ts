// app/api/presupuesto/route.ts
// Presupuesto con COSTO + MARKUP y GASTO REAL por obra (cálculo en lib/costos.ts).
import { createServerSupabase } from '@/lib/supabase-server'
import { getOwnerId } from '@/lib/roles'
import { cargarCostosObras } from '@/lib/costos-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  // Opcional: acotar a un solo proyecto (evita escanear todas las obras)
  const proyectoId = new URL(req.url).searchParams.get('proyecto_id')

  let proyQuery = supabase.from('proyectos').select('*').eq('user_id', ownerId)
  if (proyectoId) proyQuery = proyQuery.eq('id', proyectoId)
  const { data: proyectos } = await proyQuery

  try {
    return NextResponse.json(await cargarCostosObras(supabase, ownerId, proyectos ?? []))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error calculando costos' }, { status: 500 })
  }
}

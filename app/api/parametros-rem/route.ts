// app/api/parametros-rem/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardModulo, getOwnerId } from '@/lib/roles'
import { REM_DEFAULTS } from '@/types/finanzas'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'remuneraciones')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { data, error } = await supabase
    .from('parametros_remuneracion')
    .select('*')
    .eq('user_id', ownerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Si no existe, devolver defaults (sin guardar aún).
  // Si existe pero es de antes de la Fase 2, completar los campos nuevos.
  return NextResponse.json(data ? { ...REM_DEFAULTS, ...data } : { ...REM_DEFAULTS })
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'remuneraciones')
  if (denied) return denied
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  const { id, created_at, user_id, ...payload } = body

  const guardar = (fila: any) => supabase
    .from('parametros_remuneracion')
    .upsert({ ...fila, user_id: ownerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()

  let { data, error } = await guardar(payload)
  // Sin sql/56 aún no existen ingreso_minimo ni dias_laborales: se guarda el resto
  if (error && /ingreso_minimo|dias_laborales/.test(error.message)) {
    const { ingreso_minimo, dias_laborales, ...resto } = payload
    ;({ data, error } = await guardar(resto))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
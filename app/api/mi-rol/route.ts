// app/api/mi-rol/route.ts
// Devuelve el rol del usuario actual y activa invitaciones pendientes.
import { createServerSupabase } from '@/lib/supabase-server'
import { getRolActual, MODULOS_POR_ROL } from '@/lib/roles'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Si fue invitado y aún no se vincula, activar su membresía por email
  const { error: errAceptar } = await supabase.rpc('aceptar_invitacion')
  if (errAceptar) console.error('aceptar_invitacion RPC:', errAceptar.message)

  const info = await getRolActual(supabase)
  if (!info) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({
    rol: info.rol,
    email: info.email,
    es_admin: info.rol === 'admin',
    // Dueño de la organización: los archivos de Storage van SIEMPRE en su carpeta
    owner_id: info.ownerId,
    modulos_restringidos: MODULOS_POR_ROL,
  })
}
// app/api/avisos-pago/route.ts
// Pagos que los clientes informan desde el portal (sql/48).
//   GET ?proyecto_id=X        → avisos de la obra, los pendientes primero
//   PUT { id, accion, motivo } → confirmar (el estado de pago y su factura quedan pagados) o rechazar
// Lo puede resolver cualquier miembro: el contador registra pagos aunque no edite obras.
import { createServerSupabase } from '@/lib/supabase-server'
import { getOwnerId } from '@/lib/roles'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const faltaMigracion = (msg: string) =>
  /relation .* does not exist|could not find|schema cache/i.test(msg)
    ? 'Esta función aún no está activada. Avisa al administrador.'
    : msg

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  const { data, error } = await supabase.from('avisos_pago')
    .select('*, estado_pago:estados_pago(numero, total, estado)')
    .eq('proyecto_id', proyectoId).eq('user_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: faltaMigracion(error.message) }, { status: 500 })
  const orden = (a: any) => (a.estado === 'pendiente' ? 0 : 1)
  return NextResponse.json((data ?? []).sort((a: any, b: any) => orden(a) - orden(b)))
}

const ResolverSchema = z.object({
  id: z.string().uuid(),
  accion: z.enum(['confirmar', 'rechazar']),
  motivo: z.string().trim().max(300).optional(),
}).strip()

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = ResolverSchema.safeParse(await req.json().catch(() => ({})))
  if (!v.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { id, accion, motivo } = v.data
  if (accion === 'rechazar' && !motivo) {
    return NextResponse.json({ error: 'Escribe el motivo: el cliente lo verá en el portal' }, { status: 400 })
  }

  const { data: aviso } = await supabase.from('avisos_pago')
    .select('id, estado, estado_pago_id').eq('id', id).eq('user_id', ownerId).maybeSingle()
  if (!aviso) return NextResponse.json({ error: 'Aviso no encontrado' }, { status: 404 })
  if (aviso.estado !== 'pendiente') return NextResponse.json({ error: 'Este aviso ya fue revisado' }, { status: 409 })

  if (accion === 'confirmar') {
    const { data: ep } = await supabase.from('estados_pago')
      .select('id, estado, factura_id').eq('id', aviso.estado_pago_id).eq('user_id', ownerId).maybeSingle()
    if (!ep) return NextResponse.json({ error: 'El estado de pago ya no existe' }, { status: 404 })
    if (ep.estado !== 'pagado') {
      const { error } = await supabase.from('estados_pago').update({ estado: 'pagado' }).eq('id', ep.id).eq('user_id', ownerId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // El cobro es uno solo: su factura queda pagada igual que en Estados de pago
      if (ep.factura_id) {
        await supabase.from('facturas').update({ estado: 'pagada' }).eq('id', ep.factura_id).eq('user_id', ownerId)
      }
    }
  }

  const { error } = await supabase.from('avisos_pago').update({
    estado: accion === 'confirmar' ? 'confirmado' : 'rechazado',
    motivo: accion === 'rechazar' ? motivo : null,
    resuelto_en: new Date().toISOString(),
  }).eq('id', id).eq('user_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

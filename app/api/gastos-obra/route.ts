// app/api/gastos-obra/route.ts
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { gastosVisibles } from '@/lib/costos-server'
import { NextResponse, type NextRequest } from 'next/server'

const BUCKET = 'proyecto-docs'

// Comprobante (factura/boleta): debe estar en la carpeta de esta obra y organización.
function comprobante(body: any, ownerId: string, proyectoId: string) {
  const path = typeof body.archivo_path === 'string' ? body.archivo_path : ''
  if (!path) return { archivo_path: null, archivo_nombre: null, archivo_tipo: null }
  if (!path.startsWith(`${ownerId}/${proyectoId}/`) || path.includes('..')) return null
  return {
    archivo_path: path,
    archivo_nombre: String(body.archivo_nombre || path.split('/').pop()).slice(0, 255),
    archivo_tipo: body.archivo_tipo ? String(body.archivo_tipo).slice(0, 100) : null,
  }
}

// Solo los gastos registrados a mano: los automáticos dependen de su documento de origen.
const esManual = (g: any) => !g.orden_compra_id && !g.liquidacion_id && !g.subcontrato_ep_id && !g.equipo_uso_id && !g.traspaso_id

// ─── GET: gastos de un proyecto ───────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const proyectoId = req.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  try {
    const gastos = await gastosVisibles(supabase, ownerId, [proyectoId])
    return NextResponse.json(gastos.sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo los gastos' }, { status: 500 })
  }
}

// ─── POST: crear gasto ────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  if (!body.proyecto_id || !(body.descripcion || '').trim()) {
    return NextResponse.json({ error: 'Faltan proyecto y descripción' }, { status: 400 })
  }

  // FK: el proyecto debe pertenecer a ESTA organización
  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', body.proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const archivo = comprobante(body, ownerId, body.proyecto_id)
  if (!archivo) return NextResponse.json({ error: 'Comprobante inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('gastos_obra')
    .insert({
      proyecto_id: body.proyecto_id,
      partida_id:  body.partida_id || null,
      fecha:       body.fecha || new Date().toISOString().split('T')[0],
      categoria:   body.categoria || 'materiales',
      descripcion: body.descripcion,
      monto:       Number(body.monto) || 0,
      proveedor:   body.proveedor || null,
      documento:   body.documento || null,
      ...archivo,
      user_id:     user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── PATCH: adjuntar, cambiar o quitar el comprobante ─────
export async function PATCH(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const body = await req.json()
  const { data: gasto } = await supabase
    .from('gastos_obra').select('*').eq('id', body.id).eq('user_id', ownerId).maybeSingle()
  if (!gasto) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
  if (!esManual(gasto)) return NextResponse.json({ error: 'Este gasto viene de otro documento: adjunta el comprobante ahí' }, { status: 400 })

  const archivo = comprobante(body, ownerId, gasto.proyecto_id)
  if (!archivo) return NextResponse.json({ error: 'Comprobante inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('gastos_obra').update(archivo).eq('id', gasto.id).eq('user_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // El archivo anterior ya no lo usa nadie
  if (gasto.archivo_path && gasto.archivo_path !== archivo.archivo_path) {
    await supabase.storage.from(BUCKET).remove([gasto.archivo_path])
  }
  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────
export async function DELETE(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const { id } = await req.json()
  const { data: borrados, error } = await supabase
    .from('gastos_obra')
    .delete()
    .eq('id', id)
    .eq('user_id', ownerId)
    .select('archivo_path')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const archivos = (borrados ?? []).map((g: any) => g.archivo_path).filter(Boolean)
  if (archivos.length > 0) await supabase.storage.from(BUCKET).remove(archivos)
  return NextResponse.json({ ok: true })
}
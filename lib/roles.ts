// lib/roles.ts
// Resolución de rol del usuario actual y control de acceso por módulo.
import { NextResponse } from 'next/server'

export type Rol = 'admin' | 'contador' | 'jefe_obra'

// Módulos restringidos y qué roles pueden acceder (autoritativo, server-side).
// Lo que no esté acá, lo pueden ver todos los roles.
export const MODULOS_POR_ROL: Record<string, Rol[]> = {
  proyectos:      ['admin', 'jefe_obra'],   // el contador no gestiona obras
  facturacion:    ['admin', 'contador'],
  finanzas:       ['admin', 'contador'],
  iva:            ['admin', 'contador'],
  ppm:            ['admin', 'contador'],
  remuneraciones: ['admin', 'contador'],
  rrhh:           ['admin', 'contador'],    // sueldos: el jefe de obra no los ve
  usuarios:       ['admin'],
  config_empresa: ['admin'],
  auditoria:      ['admin'],
}

export function rolPermiteModulo(rol: Rol, modulo: string): boolean {
  const permitidos = MODULOS_POR_ROL[modulo]
  return !permitidos || permitidos.includes(rol)
}

// Devuelve { userId, email, rol, ownerId } del usuario actual.
// Si tiene membresía activa → usa su rol y el dueño de esa organización.
// Si no → es dueño de su propia organización (admin).
type InfoRol = { userId: string; email: string | undefined; rol: Rol; ownerId: string }

// Una consulta por petición: guardEscritura, guardModulo y getOwnerId comparten el resultado
// (el cliente de Supabase del servidor se crea una vez por petición).
const rolPorCliente = new WeakMap<object, Promise<InfoRol | null>>()

export function getRolActual(supabase: any): Promise<InfoRol | null> {
  const ya = rolPorCliente.get(supabase)
  if (ya) return ya
  const consulta = leerRolActual(supabase)
  rolPorCliente.set(supabase, consulta)
  // Un fallo de red no debe quedar guardado
  consulta.catch(() => rolPorCliente.delete(supabase))
  return consulta
}

async function leerRolActual(supabase: any): Promise<InfoRol | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Determinista: si existieran varias membresías activas (no debería, hay
  // índice único), siempre se usa la más antigua — igual que resolver_owner().
  const { data: ms } = await supabase
    .from('miembros')
    .select('rol, owner_id')
    .eq('member_user_id', user.id)
    .eq('estado', 'activo')
    .order('created_at', { ascending: true })
    .limit(1)
  const m = ms?.[0]
  if (m) return { userId: user.id, email: user.email, rol: m.rol as Rol, ownerId: m.owner_id }
  return { userId: user.id, email: user.email, rol: 'admin' as Rol, ownerId: user.id }
}

// Módulos donde un rol entra en SOLO LECTURA (puede ver, no modificar).
// El contador necesita ver las obras para contabilizar, pero no ejecutarlas.
export const SOLO_LECTURA: Record<string, Rol[]> = {
  obra: ['contador'],
}

export function esSoloLectura(rol: Rol, modulo: string): boolean {
  return (SOLO_LECTURA[modulo] ?? []).includes(rol)
}

// Guarda de escritura: permite GET, bloquea POST/PUT/DELETE a los roles
// que tienen ese módulo en solo lectura. Devuelve 403 o null.
export async function guardEscritura(supabase: any, modulo: string) {
  const info = await getRolActual(supabase)
  if (!info) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (esSoloLectura(info.rol, modulo)) {
    return NextResponse.json({ error: 'Tu rol tiene acceso de solo lectura a este módulo' }, { status: 403 })
  }
  return null
}

// Devuelve el ID del DUEÑO de la organización del usuario actual.
// - Si es dueño (sin membresía) → su propio id.
// - Si es miembro de una organización → el id del dueño de esa organización.
// Con esto, los filtros .eq('user_id', ownerId) apuntan a los datos de la
// empresa, no a los del miembro (cuyo id no tiene datos propios).
export async function getOwnerId(supabase: any): Promise<string | null> {
  const info = await getRolActual(supabase)
  return info?.ownerId ?? null
}

// Guarda de módulo para endpoints sensibles. Devuelve una respuesta 401/403
// si el usuario no puede, o null si tiene permiso.
export async function guardModulo(supabase: any, modulo: string) {
  const info = await getRolActual(supabase)
  if (!info) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rolPermiteModulo(info.rol, modulo)) {
    return NextResponse.json({ error: 'No tienes permiso para este módulo' }, { status: 403 })
  }
  return null
}
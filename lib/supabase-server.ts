// lib/supabase-server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function createServerSupabase() {
  const cookieStore = await cookies()
  const cliente = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet: CookieToSet[]) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch {}
        },
      },
    }
  )

  // Este cliente vive lo que dura una petición. Las rutas piden el usuario varias veces
  // (guarda de rol, dueño, la propia ruta) y cada una era un viaje al servidor de sesiones:
  // se valida una vez y se reutiliza la respuesta.
  const getUser = cliente.auth.getUser.bind(cliente.auth)
  let validado: ReturnType<typeof getUser> | null = null
  cliente.auth.getUser = ((jwt?: string) => {
    if (jwt) return getUser(jwt)
    if (!validado) validado = getUser()
    return validado
  }) as typeof cliente.auth.getUser
  return cliente
}

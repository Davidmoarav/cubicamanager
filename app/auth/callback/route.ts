import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { destinoTrasCodigo, motivoDeError } from '@/lib/auth-recuperacion'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  const conError = (motivo: string) => NextResponse.redirect(`${origin}/auth/forgot?error=${motivo}`)

  if (searchParams.get('error') || searchParams.get('error_code')) {
    return conError(motivoDeError({ code: searchParams.get('error_code') }))
  }

  // Sin ?code el error viene en el fragmento de la URL (#error=...), que el servidor
  // no puede leer. El navegador lo conserva al redirigir y update-password lo informa.
  if (!code) return NextResponse.redirect(`${origin}/auth/update-password`)

  const cookies: CookieToSet[] = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet: CookieToSet[]) { cookies.push(...toSet) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return conError(motivoDeError(error))

  const respuesta = NextResponse.redirect(`${origin}${destinoTrasCodigo((data as any).redirectType)}`)
  cookies.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
  return respuesta
}

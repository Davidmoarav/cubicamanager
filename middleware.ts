// middleware.ts  (raíz del proyecto)
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function middleware(request: NextRequest) {
  // Si Supabase no autoriza la dirección pedida, el link del correo cae en la raíz.
  // Con el verificador en este navegador, el código todavía se puede canjear.
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')
    && request.cookies.getAll().some(c => c.name.endsWith('-code-verifier'))) {
    const callback = new URL('/auth/callback', request.url)
    callback.searchParams.set('code', request.nextUrl.searchParams.get('code')!)
    return NextResponse.redirect(callback)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet: CookieToSet[]) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/auth')
  const isPublic   = request.nextUrl.pathname === '/'
    || request.nextUrl.pathname.startsWith('/portal')   // portal público del cliente (por token)

  if (!user && !isAuthPage && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  // Con sesión solo se salta el login: un link de recuperación debe seguir funcionando
  if (user && request.nextUrl.pathname === '/auth/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

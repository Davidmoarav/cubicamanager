// app/api/indicadores/route.ts
// UF y UTM del día desde mindicador.cl (fuente: Banco Central / SII).
// Cache de 12 horas para no golpear la API externa en cada visita.
import { createServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const res = await fetch('https://mindicador.cl/api', {
      next: { revalidate: 43200 },          // 12 h
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status}`)
    const j = await res.json()

    const uf  = Math.round(Number(j?.uf?.valor) || 0)
    const utm = Math.round(Number(j?.utm?.valor) || 0)
    if (!uf || !utm) throw new Error('Respuesta sin UF/UTM')

    return NextResponse.json({
      uf,
      utm,
      uf_fecha:  j?.uf?.fecha || null,
      utm_fecha: j?.utm?.fecha || null,
      fuente: 'mindicador.cl',
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'No se pudo obtener UF/UTM: ' + (e?.message || 'error de red') },
      { status: 502 }
    )
  }
}

// app/api/portal/pago/route.ts
// Público: el cliente avisa desde el portal que pagó un estado de pago.
// Solo sirve con un token de portal activo; la validación final la hace portal_avisar_pago (sql/48).
// El pago no queda registrado hasta que la empresa lo confirma.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const AvisoSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{16,64}$/i),
  numero: z.coerce.number().int().positive(),
  monto: z.coerce.number().int().positive().max(999_999_999_999),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referencia: z.string().trim().min(3).max(80),
  pagador: z.string().trim().min(2).max(120),
  comentario: z.string().trim().max(500).optional(),
}).strip()

export async function POST(req: Request) {
  const v = AvisoSchema.safeParse(await req.json().catch(() => ({})))
  if (!v.success) return NextResponse.json({ error: 'Revisa los datos del pago' }, { status: 400 })
  const d = v.data

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.rpc('portal_avisar_pago', {
    t: d.token, p_numero: d.numero, p_monto: d.monto, p_fecha: d.fecha_pago,
    p_referencia: d.referencia, p_pagador: d.pagador, p_comentario: d.comentario ?? null,
  })
  if (error) return NextResponse.json({ error: 'No se pudo informar el pago. Intenta de nuevo o contacta a la empresa.' }, { status: 500 })
  if (!data?.ok) return NextResponse.json({ error: data?.error ?? 'No se pudo informar el pago' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

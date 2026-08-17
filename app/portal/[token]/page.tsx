// app/portal/[token]/page.tsx — Portal público del cliente (Fase 5).
// Solo lectura, sin login: lee el snapshot vía la función portal_por_token
// (SECURITY DEFINER). Nadie puede ver nada sin el token exacto.

import { createClient } from '@supabase/supabase-js'
import type { SnapshotPortal } from '@/lib/portal'
import { calcularGantt, fechaCortaCL } from '@/lib/gantt'
import { fmt } from '@/lib/format'

export const dynamic = 'force-dynamic'

const ESTADO_PROY: Record<string, { label: string; color: string; bg: string }> = {
  cotizacion: { label: 'Cotizando', color: '#C24019', bg: '#FCEAE3' },
  activo:     { label: 'En obra',   color: '#1a7a4a', bg: '#e6f4ed' },
  terminado:  { label: 'Terminado', color: '#6b7a8d', bg: '#F1ECE6' },
}

const ESTADO_EP_PORTAL: Record<string, { label: string; color: string; bg: string }> = {
  presentado: { label: 'Por pagar', color: '#b07d1a', bg: '#fef3d7' },
  aprobado:   { label: 'Aprobado',  color: '#E5502A', bg: '#FCEAE3' },
  pagado:     { label: 'Pagado',    color: '#1a7a4a', bg: '#e6f4ed' },
}

const COLOR_BARRA: Record<string, string> = {
  completa: '#1a7a4a', encurso: '#E5502A', atrasada: '#b0401a', pendiente: '#d1d9e6',
}

async function cargarSnapshot(token: string): Promise<(SnapshotPortal & { actualizado_en?: string }) | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await sb.rpc('portal_por_token', { t: token })
    if (error || !data) return null
    return data as SnapshotPortal & { actualizado_en?: string }
  } catch {
    return null
  }
}

export default async function PortalCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const snap = await cargarSnapshot(token)

  if (!snap || !snap.nombre) {
    return (
      <div className="min-h-screen bg-om-canvas flex items-center justify-center px-4">
        <div className="bg-white rounded-card border border-line shadow-card p-10 text-center max-w-[420px]">
          <div className="text-[40px] mb-2"></div>
          <div className="text-[17px] font-extrabold text-ink">Este link no está disponible</div>
          <p className="text-[13px] text-muted mt-2">
            El presupuesto pudo haber sido desactivado por el contratista, o el link no es válido.
            Pídele que te lo comparta de nuevo.
          </p>
        </div>
      </div>
    )
  }

  const est = ESTADO_PROY[snap.estado] ?? ESTADO_PROY.cotizacion
  const hoy = new Date().toISOString().slice(0, 10)
  const gantt = calcularGantt(snap.etapas ?? [], hoy)
  const m = snap.montos

  return (
    <div className="min-h-screen bg-om-canvas">
      {/* Nav pública */}
      <nav className="bg-om-ink text-white">
        <div className="max-w-[860px] mx-auto px-4 lg:px-6 h-14 flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-om flex items-center justify-center font-black text-[13px]">
            {snap.empresa.nombre.charAt(0).toUpperCase()}
          </span>
          <span className="font-extrabold text-[15px] truncate">{snap.empresa.nombre}</span>
          <span className="ml-auto text-[11px] text-white/60 hidden sm:inline">Presupuesto compartido</span>
        </div>
      </nav>

      <main className="max-w-[860px] mx-auto px-4 lg:px-6 py-6 space-y-5">
        {/* Hero */}
        <div className="bg-white rounded-card border border-line shadow-card p-5 lg:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-extrabold text-ink tracking-tight">{snap.nombre}</h1>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ background: est.bg, color: est.color }}
            >
              ● {est.label}
            </span>
          </div>
          {snap.cliente && <div className="text-[13px] text-muted mt-1">Preparado para {snap.cliente}</div>}
          {snap.descripcion && <p className="text-[13px] text-muted mt-2 max-w-[600px]">{snap.descripcion}</p>}

          <div className="mt-4">
            <div className="flex items-center justify-between text-[12px] font-bold">
              <span className="text-muted uppercase tracking-wide">Avance de la obra</span>
              <span className="text-om text-[15px]">{snap.avance}%</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-canvas overflow-hidden">
              <div className="h-full rounded-full bg-om transition-all" style={{ width: `${Math.min(100, snap.avance)}%` }} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: 'Total presupuesto', valor: fmt(m.total), coral: false },
              { label: 'Pagado', valor: fmt(m.pagado), coral: false },
              { label: 'Saldo', valor: fmt(m.saldo), coral: true },
            ].map(x => (
              <div key={x.label} className="bg-canvas/70 rounded-xl px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{x.label}</div>
                <div className={`text-[15px] lg:text-[17px] font-extrabold ${x.coral ? 'text-om' : 'text-ink'}`}>{x.valor}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Línea de tiempo */}
        {gantt.desde && (
          <div className="bg-white rounded-card border border-line shadow-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-[15px] font-extrabold text-ink">Línea de tiempo</h2>
              <span className="text-[12px] text-muted">
                {fechaCortaCL(gantt.desde)} → {fechaCortaCL(gantt.hasta)}
                {gantt.diasRestantes !== null && gantt.diasRestantes > 0 && ` · faltan ${gantt.diasRestantes} días`}
              </span>
            </div>
            <div className="space-y-2.5">
              {gantt.etapas.filter(e => e.anchoPct > 0).map(e => (
                <div key={e.id} className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(110px, 170px) 1fr' }}>
                  <div className="text-[12px] font-bold text-ink truncate">{e.nombre}</div>
                  <div className="relative h-5 bg-canvas rounded">
                    {gantt.hoyPct !== null && (
                      <div className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-om z-10" style={{ left: `${gantt.hoyPct}%` }} />
                    )}
                    <div
                      className="absolute top-0 bottom-0 rounded flex items-center px-1.5"
                      style={{ left: `${e.iniPct}%`, width: `${e.anchoPct}%`, background: COLOR_BARRA[e.estado] }}
                    >
                      <span className={`text-[9.5px] font-extrabold ${e.estado === 'pendiente' ? 'text-[#6b7a8d]' : 'text-white'}`}>
                        {Math.round(e.avance)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presupuesto */}
        <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-[15px] font-extrabold text-ink">Detalle del presupuesto</h2>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-om-ink text-white text-left">
                <th className="px-5 py-2 font-bold">Descripción</th>
                <th className="px-2 py-2 font-bold text-right w-14">Cant.</th>
                <th className="px-2 py-2 font-bold w-12">Un.</th>
                <th className="px-5 py-2 font-bold text-right w-24">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {snap.presupuesto.grupos.map((g, gi) => (
                <GrupoPortal key={gi} grupo={g} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td colSpan={3} className="px-5 py-1.5 pt-3 text-right text-muted">Neto</td>
                <td className="px-5 py-1.5 pt-3 text-right font-bold text-ink">{fmt(m.neto)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 py-1.5 text-right text-muted">IVA 19%</td>
                <td className="px-5 py-1.5 text-right font-bold text-ink">{fmt(m.iva)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 py-2.5 text-right font-extrabold text-ink text-[13.5px]">TOTAL</td>
                <td className="px-5 py-2.5 text-right font-extrabold text-om text-[15px]">{fmt(m.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Cobros */}
        {snap.cobros.length > 0 && (
          <div className="bg-white rounded-card border border-line shadow-card overflow-hidden">
            <div className="p-5 pb-3">
              <h2 className="text-[15px] font-extrabold text-ink">Estados de pago</h2>
            </div>
            <ul className="divide-y divide-line">
              {snap.cobros.map(c => {
                const e = ESTADO_EP_PORTAL[c.estado] ?? { label: c.estado, color: '#6b7a8d', bg: '#F1ECE6' }
                return (
                  <li key={c.numero} className="px-5 py-3 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-om-bg text-om font-extrabold flex items-center justify-center text-[12px]">
                      {c.numero}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-ink text-[13px]">Estado de pago N°{c.numero}</div>
                      <div className="text-[11.5px] text-muted">{c.periodo ?? (c.fecha ? fechaCortaCL(c.fecha) : '')}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold" style={{ background: e.bg, color: e.color }}>
                      {e.label}
                    </span>
                    <span className="font-extrabold text-ink text-[13.5px] w-24 text-right">{fmt(c.total)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Contacto + pie */}
        <div className="bg-white rounded-card border border-line shadow-card p-5 text-center">
          <div className="text-[13px] font-bold text-ink">¿Dudas sobre este presupuesto?</div>
          <p className="text-[12.5px] text-muted mt-1">
            Contacta a {snap.empresa.nombre}
            {snap.empresa.telefono ? ` · ${snap.empresa.telefono}` : ''}
            {snap.empresa.email ? ` · ${snap.empresa.email}` : ''}
          </p>
        </div>

        <p className="text-center text-[11px] text-subtle pb-6">
          Datos actualizados al {snap.actualizado_en ? fechaCortaCL(snap.actualizado_en.slice(0, 10)) : '—'} ·
          Documento informativo generado con CubicaManager
        </p>
      </main>
    </div>
  )
}

function GrupoPortal({ grupo }: { grupo: SnapshotPortal['presupuesto']['grupos'][number] }) {
  return (
    <>
      <tr style={{ background: '#FCEAE3' }}>
        <td className="px-5 py-1.5 font-extrabold text-[11.5px] uppercase tracking-wide" style={{ color: '#C24019' }}>
          {grupo.nombre}
        </td>
        <td colSpan={2} />
        <td className="px-5 py-1.5 text-right font-extrabold" style={{ color: '#C24019' }}>{fmt(grupo.subtotal)}</td>
      </tr>
      {grupo.items.map((i, ix) => (
        <tr key={ix} className="border-t border-line/60">
          <td className="px-5 py-1.5 text-ink">{i.descripcion}</td>
          <td className="px-2 py-1.5 text-right text-muted">{i.cantidad}</td>
          <td className="px-2 py-1.5 text-muted">{i.unidad}</td>
          <td className="px-5 py-1.5 text-right font-semibold text-ink">{fmt(i.subtotal)}</td>
        </tr>
      ))}
    </>
  )
}

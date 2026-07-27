// app/(protected)/dashboard/page.tsx  — SERVER COMPONENT
// Usa el AppShell del layout (protected) y los datos de la ORGANIZACIÓN
// (getOwnerId): un miembro invitado ve la empresa, no su cuenta vacía.
import { createServerSupabase } from '@/lib/supabase-server'
import { getOwnerId } from '@/lib/roles'
import { Badge, SectionTitle, Table, Th, Td } from '@/components/ui'
import { fmt, fmtM } from '@/lib/format'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ownerId = await getOwnerId(supabase) || user.id

  const [{ data: proyectos }, { data: empleados }, { data: facturas }] = await Promise.all([
    supabase.from('proyectos').select('id, nombre, cliente, avance, valor, estado, created_at').eq('user_id', ownerId).order('created_at', { ascending: false }),
    supabase.from('empleados').select('id, tipo').eq('user_id', ownerId),
    supabase.from('facturas').select('id, numero, cliente, tipo, doc_tipo, estado, monto, created_at').eq('user_id', ownerId).order('created_at', { ascending: false }),
  ])

  const p = proyectos ?? []
  const e = empleados ?? []
  const f = facturas  ?? []

  // Ingresos = solo facturas de VENTA. Con signo: notas de crédito restan.
  const efecto    = (x:any) => ((x.doc_tipo === 'nota_credito' ? -1 : 1) * (x.monto || 0))
  const ventas    = f.filter((x:any) => (x.tipo || 'venta') !== 'compra')
  const cobrado   = ventas.filter((x:any) => x.estado === 'pagada').reduce((s:number, x:any) => s + efecto(x), 0)
  const pendiente = ventas.filter((x:any) => x.estado !== 'pagada').reduce((s:number, x:any) => s + efecto(x), 0)
  const activos   = p.filter((x:any) => x.estado === 'activo').length

  const estadosP = [
    { key: 'activo',      label: 'En curso',       bar: 'bg-brand' },
    { key: 'terminado',   label: 'Terminado',      bar: 'bg-success' },
    { key: 'cotizacion',  label: 'En cotización',  bar: 'bg-warning' },
  ]

  const metricas = [
    { label: 'Ingresos cobrados', value: fmtM(cobrado),   sub: 'Facturas pagadas',    color: 'text-success', icon: '💰' },
    { label: 'Por cobrar',        value: fmtM(pendiente), sub: 'Facturas pendientes', color: 'text-danger',  icon: '⏳' },
    { label: 'Proyectos activos', value: activos,         sub: `+${p.filter((x:any)=>x.estado==='cotizacion').length} en cotización`, color: 'text-warning', icon: '🏗' },
    { label: 'Personal',          value: e.length,        sub: `${e.filter((x:any)=>x.tipo==='subcontrato').length} subcontratados`, color: 'text-muted', icon: '👷' },
  ]

  return (
    <div>
      <div className="mb-6">
        <SectionTitle>Panel general</SectionTitle>
        <p className="text-sm text-muted mt-1">Resumen de tu operación</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metricas.map(m => (
          <div key={m.label} className="bg-white border border-line rounded-2xl p-5 shadow-card hover:shadow-pop transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">{m.label}</span>
              <span className="text-base opacity-70">{m.icon}</span>
            </div>
            <div className="text-2xl font-extrabold text-ink tabular-nums">{m.value}</div>
            <div className={`text-xs mt-1 font-medium ${m.color}`}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Estado proyectos */}
        <div className="bg-white border border-line rounded-2xl p-6 shadow-card">
          <div className="text-sm font-bold text-ink mb-4">Estado de proyectos</div>
          {estadosP.map(s => {
            const count = p.filter((x:any) => x.estado === s.key).length
            const pct   = p.length ? Math.round((count / p.length) * 100) : 0
            return (
              <div key={s.key} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-ink">{s.label}</span>
                  <span className="text-muted">{count} proyecto{count !== 1 ? 's' : ''}</span>
                </div>
                <div className="h-2 bg-[#eef2f7] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          {p.length === 0 && <p className="text-[13px] text-muted text-center py-5">Sin proyectos aún</p>}
        </div>

        {/* Últimas facturas */}
        <div className="bg-white border border-line rounded-2xl p-6 shadow-card">
          <div className="text-sm font-bold text-ink mb-4">Últimas facturas</div>
          {f.length === 0
            ? <p className="text-[13px] text-muted text-center py-5">Sin facturas aún</p>
            : f.slice(0, 4).map((fac:any) => (
              <div key={fac.id} className="flex justify-between items-center py-2.5 border-b border-[#f0f4f8] last:border-0">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{fac.cliente}</div>
                  <div className="text-[11px] text-muted">{fac.numero || '—'}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-[13px] font-bold text-ink tabular-nums">{fmt(fac.monto)}</div>
                  <Badge estado={fac.estado} tipo="factura" />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Proyectos recientes */}
      <div className="bg-white border border-line rounded-2xl p-6 shadow-card">
        <div className="text-sm font-bold text-ink mb-4">Proyectos recientes</div>
        {p.length === 0
          ? <p className="text-[13px] text-muted text-center py-5">Dirígete a Proyectos para crear el primero.</p>
          : (
            <Table>
              <thead>
                <tr><Th>Proyecto</Th><Th>Cliente</Th><Th>Avance</Th><Th>Valor</Th><Th>Estado</Th></tr>
              </thead>
              <tbody>
                {p.slice(0, 5).map((pr:any) => {
                  const pct = pr.avance || 0
                  const barColor = pct === 100 ? 'bg-success' : 'bg-brand'
                  return (
                    <tr key={pr.id} className="hover:bg-canvas transition-colors">
                      <Td className="font-semibold">{pr.nombre}</Td>
                      <Td className="text-muted">{pr.cliente}</Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-[#eef2f7] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted w-8 text-right">{pct}%</span>
                        </div>
                      </Td>
                      <Td className="font-bold tabular-nums">{fmtM(pr.valor)}</Td>
                      <Td><Badge estado={pr.estado} tipo="proyecto" /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
      </div>
    </div>
  )
}

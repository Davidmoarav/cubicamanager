// app/(protected)/dashboard/page.tsx  — SERVER COMPONENT
// Usa el AppShell del layout (protected) y los datos de la ORGANIZACIÓN
// (getOwnerId): un miembro invitado ve la empresa, no su cuenta vacía.
import { createServerSupabase } from '@/lib/supabase-server'
import Link from 'next/link'
import { getOwnerId, getRolActual } from '@/lib/roles'
import { calcularPendientes, mesAnterior, primerosPasos } from '@/lib/pendientes'
import { Badge, Table, Th, Td } from '@/components/ui'
import { fmt } from '@/lib/format'
import { contratoBruto } from '@/lib/informe'
import { resolverDocumentosCompra } from '@/lib/costos'
import { filtrarPorObra } from '@/lib/consolidado'
import { FiltroObraUrl } from '@/components/FiltroObra'
import { lectorSueldos } from '@/lib/supabase-admin'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ownerId = await getOwnerId(supabase) || user.id
  const rol = (await getRolActual(supabase))?.rol ?? 'admin'
  const verFinanzas = rol !== 'jefe_obra'
  const hoy = new Date().toISOString().slice(0, 10)
  const obra = (await searchParams)?.obra ?? ''

  const [{ data: proyectos }, { data: empleados }, { data: facturas }, ordenes, estadosPago, liquidaciones, incidentes, clientes, { data: empresa }, avisosPago] = await Promise.all([
    supabase.from('proyectos').select('*').eq('user_id', ownerId).order('created_at', { ascending: false }),
    lectorSueldos(supabase).from('empleados').select('id, tipo, proyecto_id, estado').eq('user_id', ownerId),
    supabase.from('facturas').select('id, numero, cliente, tipo, doc_tipo, estado, monto, created_at, proyecto, proyecto_id, partida_id, factura_ref, vencimiento, periodo').eq('user_id', ownerId).order('created_at', { ascending: false }),
    supabase.from('ordenes_compra').select('id, estado, proyecto_id').eq('user_id', ownerId),
    supabase.from('estados_pago').select('proyecto_id, numero, estado, factura_id').eq('user_id', ownerId),
    supabase.from('liquidaciones').select('empleado_id').eq('user_id', ownerId).eq('periodo', mesAnterior(hoy)),
    supabase.from('prevencion_registros').select('id, proyecto_id, tipo, estado, titulo').eq('user_id', ownerId).eq('estado', 'abierto'),
    supabase.from('clientes').select('id').eq('user_id', ownerId).limit(1),
    supabase.from('empresa_config').select('razon_social, rut').eq('user_id', ownerId).maybeSingle(),
    supabase.from('avisos_pago').select('id, proyecto_id, monto, estado_pago:estados_pago(numero)').eq('user_id', ownerId).eq('estado', 'pendiente'),
  ])

  const todas = proyectos ?? []
  const p = obra ? todas.filter((x:any) => x.id === obra) : todas
  const e = filtrarPorObra((empleados ?? []) as any[], obra)
  // Las notas siguen a la factura que modifican
  const f = filtrarPorObra(resolverDocumentosCompra((facturas ?? []) as any[]), obra, todas) as any[]

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
    ...(verFinanzas ? [
      { label: 'Ingresos cobrados', value: fmt(cobrado),   sub: 'Facturas pagadas',    color: 'text-success', href: '/facturacion' },
      { label: 'Por cobrar',        value: fmt(pendiente), sub: 'Facturas pendientes', color: 'text-danger',  href: '/facturacion' },
    ] : []),
    { label: 'Obras activas', value: activos, sub: `+${p.filter((x:any)=>x.estado==='cotizacion').length} en cotización`, color: 'text-warning', href: '/proyectos' },
    { label: 'Personal',      value: e.length, sub: `${e.filter((x:any)=>x.tipo==='subcontrato').length} subcontratados`, color: 'text-muted', href: verFinanzas ? '/rrhh' : null },
  ]

  // Una consulta con error queda en null: esa regla no opina
  const porObra = (filas: any[] | null) => filas && (obra ? filas.filter(x => x.proyecto_id === obra) : filas)
  const pendientes = calcularPendientes({
    rol, hoy, proyectos: p, facturas: f,
    ordenes: porObra(ordenes.error ? null : ordenes.data),
    estadosPago: porObra(estadosPago.error ? null : estadosPago.data),
    empleados: e,
    liquidaciones: liquidaciones.error ? null : liquidaciones.data,
    avisosPago: porObra(avisosPago.error ? null : avisosPago.data),
    incidentes: porObra(incidentes.error ? null : incidentes.data),
  })
  const pasos = primerosPasos({ rol, empresa, clientes: clientes.data?.length ?? 0, obras: todas.length, empleados: (empleados ?? []).length })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink tracking-tight">Panel general</h1>
          <p className="text-sm text-muted mt-1">Resumen de tu operación</p>
        </div>
        <FiltroObraUrl value={obra} proyectos={todas as any[]} />
      </div>

      {pasos.length > 0 && (
        <div className="bg-white border border-line rounded-card p-5 shadow-card mb-6">
          <h2 className="text-[14px] font-extrabold text-ink">Primeros pasos</h2>
          <p className="text-[12.5px] text-muted mt-0.5 mb-3">{pasos.filter(x => x.hecho).length} de {pasos.length} listos.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {pasos.map(x => (
              <li key={x.id}>
                <Link href={x.href} className="flex items-start gap-2.5 p-3 rounded-lg border border-line hover:bg-canvas transition">
                  <span className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center text-[11px] ${x.hecho ? 'bg-success text-white border-success' : 'border-line2 text-transparent'}`} aria-hidden="true">✓</span>
                  <span>
                    <span className={`block text-[13px] font-semibold ${x.hecho ? 'text-muted line-through' : 'text-ink'}`}>{x.texto}</span>
                    <span className="block text-[11.5px] text-muted">{x.detalle}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="bg-white border border-line rounded-card p-5 shadow-card mb-6">
          <h2 className="text-[14px] font-extrabold text-ink mb-2">Pendientes</h2>
          <ul>
            {pendientes.slice(0, 6).map(x => (
              <li key={x.id}>
                <Link href={x.href} className="flex items-center justify-between gap-3 py-2.5 border-b border-canvas hover:text-brand transition">
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-semibold ${x.urgente ? 'text-danger' : 'text-ink'}`}>{x.texto}</span>
                    {x.detalle && <span className="block text-[11.5px] text-muted">{x.detalle}</span>}
                  </span>
                  <span className="text-muted" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
          {pendientes.length > 6 && <p className="text-[11.5px] text-muted mt-2">Y {pendientes.length - 6} más.</p>}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metricas.map(m => {
          const tarjeta = (
            <div className="bg-white border border-line rounded-card p-5 shadow-card hover:shadow-pop hover:-translate-y-0.5 transition duration-200 min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted mb-3">{m.label}</div>
              <div className={`${String(m.value).length > 11 ? 'text-[15px]' : 'text-[19px]'} sm:text-[26px] font-extrabold text-ink tabular-nums tracking-tight leading-none [overflow-wrap:anywhere]`}>{m.value}</div>
              <div className={`text-xs mt-1.5 font-semibold ${m.color}`}>{m.sub}</div>
            </div>
          )
          return m.href ? <Link key={m.label} href={m.href} className="min-w-0">{tarjeta}</Link> : <div key={m.label} className="min-w-0">{tarjeta}</div>
        })}
      </div>

      <div className={`grid grid-cols-1 gap-5 mb-5 ${verFinanzas ? 'lg:grid-cols-2' : ''}`}>
        {/* Estado proyectos */}
        <div className="bg-white border border-line rounded-card p-6 shadow-card">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">Estado de las obras</div>
          {estadosP.map(s => {
            const count = p.filter((x:any) => x.estado === s.key).length
            const pct   = p.length ? Math.round((count / p.length) * 100) : 0
            return (
              <div key={s.key} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-ink">{s.label}</span>
                  <span className="text-muted">{count} {count === 1 ? 'obra' : 'obras'}</span>
                </div>
                <div className="h-2 bg-canvas rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          {p.length === 0 && <p className="text-[13px] text-muted text-center py-5">Sin obras aún</p>}
        </div>

        {/* Últimas facturas */}
        {verFinanzas && <div className="bg-white border border-line rounded-card p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Últimos documentos</div>
            <Link href="/facturacion" className="text-[12px] font-semibold text-brand">Ver todos</Link>
          </div>
          {f.length === 0
            ? <p className="text-[13px] text-muted text-center py-5">Sin facturas aún</p>
            : f.slice(0, 4).map((fac:any) => (
              <div key={fac.id} className="flex justify-between items-center py-2.5 border-b border-line/60 last:border-0">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{fac.cliente}</div>
                  <div className="text-[11px] text-muted">{fac.tipo === 'compra' ? 'Compra' : 'Venta'} · {fac.doc_tipo === 'nota_credito' ? 'Nota de crédito' : fac.doc_tipo === 'nota_debito' ? 'Nota de débito' : 'N°'} {fac.numero || '—'}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-[13px] font-bold text-ink tabular-nums">{fmt(efecto(fac))}</div>
                  <Badge estado={fac.estado} tipo="factura" />
                </div>
              </div>
            ))}
        </div>}
      </div>

      {/* Obras recientes */}
      <div className="bg-white border border-line rounded-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Obras recientes</div>
          <Link href="/proyectos" className="text-[12px] font-semibold text-brand">Ver todas</Link>
        </div>
        {p.length === 0
          ? <p className="text-[13px] text-muted text-center py-5">Aún no tienes obras. <Link href="/proyectos" className="font-semibold text-brand">Crea la primera</Link>.</p>
          : (
            <Table>
              <thead>
                <tr><Th>Obra</Th><Th>Cliente</Th><Th>Avance</Th><Th>Valor</Th><Th>Estado</Th></tr>
              </thead>
              <tbody>
                {p.slice(0, 5).map((pr:any) => {
                  const pct = pr.avance || 0
                  const barColor = pct === 100 ? 'bg-success' : 'bg-brand'
                  return (
                    <tr key={pr.id} className="hover:bg-canvas transition-colors">
                      <Td className="font-semibold"><Link href={`/obra/${pr.id}`} className="hover:text-brand transition">{pr.nombre}</Link></Td>
                      <Td className="text-muted">{pr.cliente}</Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold w-8 text-right ${pct === 100 ? 'text-success' : 'text-brand'}`}>{pct}%</span>
                        </div>
                      </Td>
                      <Td className="font-bold tabular-nums">{fmt(contratoBruto(pr))}</Td>
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

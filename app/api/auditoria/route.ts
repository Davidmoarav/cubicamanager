// app/api/auditoria/route.ts
// Bitácora de cambios. Solo lectura (el historial no se edita ni se borra).
import { createServerSupabase } from '@/lib/supabase-server'
import { getRolActual, guardModulo } from '@/lib/roles'
import { NextResponse } from 'next/server'

const COLS = 'id, actor_email, actor_rol, accion, tabla, registro_id, descripcion, antes, despues, cambios, creado_en'

// Nombres legibles de las tablas
const NOMBRE_TABLA: Record<string, string> = {
  proyectos: 'Proyectos', partidas_proyecto: 'Partidas', partida_materiales: 'Materiales',
  estados_pago: 'Estados de pago', gastos_obra: 'Gastos de obra', facturas: 'Facturas',
  cotizaciones: 'Cotizaciones', ordenes_compra: 'Órdenes de compra',
  orden_compra_lineas: 'Líneas de OC', clientes: 'Clientes', proveedores: 'Proveedores',
  proveedor_productos: 'Catálogo de productos', empleados: 'Empleados',
  liquidaciones: 'Liquidaciones', contratos: 'Contratos', devoluciones: 'Devoluciones',
  catalogo_partidas: 'Catálogo de partidas', ppm_config: 'Config. PPM',
  parametros_remuneracion: 'Parámetros de sueldos', empresa_config: 'Datos de la empresa',
  proyeccion_mo: 'Proyección mano de obra', miembros: 'Usuarios y roles',
  parte_diario: 'Parte diario', recepciones_oc: 'Recepciones de OC',
  bodega_movimientos: 'Bodega', subcontratos: 'Subcontratos', subcontrato_eps: 'EP de subcontratos',
  equipos: 'Equipos', equipo_usos: 'Uso de equipos',
  partida_dependencias: 'Dependencias de Gantt', libro_obra: 'Libro de obra',
  prevencion_registros: 'Prevención de riesgos', partida_apu_recursos: 'Recursos de APU',
  dte_emisiones: 'Emisiones de DTE',
}

export async function GET(req: Request) {
  const supabase = await createServerSupabase()
  const denied = await guardModulo(supabase, 'auditoria')
  if (denied) return denied
  const info = await getRolActual(supabase)
  if (!info) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams

  // Opciones para los filtros de la interfaz
  if (sp.get('filtros')) {
    const { data, error } = await supabase
      .from('auditoria')
      .select('actor_email, tabla')
      .eq('owner_id', info.ownerId)
      .order('creado_en', { ascending: false })
      .limit(3000)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    const usuarios = [...new Set(rows.map((r: any) => r.actor_email).filter(Boolean))].sort()

    // Módulos: los que ya tienen eventos, primero; luego el resto de los conocidos
    const conEventos = [...new Set(rows.map((r: any) => r.tabla).filter(Boolean))]
    const todos = [...new Set([...conEventos, ...Object.keys(NOMBRE_TABLA)])]
    const tablas = todos
      .map((t: string) => ({ valor: t, label: NOMBRE_TABLA[t] || t, tiene: conEventos.includes(t) }))
      .sort((a, b) => (Number(b.tiene) - Number(a.tiene)) || a.label.localeCompare(b.label))

    return NextResponse.json({ usuarios, tablas, total_eventos: rows.length })
  }

  const limit  = Math.min(Number(sp.get('limit')) || 50, 300)
  const tabla  = sp.get('tabla')
  const actor  = sp.get('actor')
  const accion = sp.get('accion')
  const desde  = sp.get('desde')
  const hasta  = sp.get('hasta')
  const buscar = sp.get('buscar')

  let q = supabase.from('auditoria').select(COLS)
  if (tabla)  q = q.eq('tabla', tabla)
  if (actor)  q = q.eq('actor_email', actor)
  if (accion) q = q.eq('accion', accion)
  if (desde)  q = q.gte('creado_en', `${desde}T00:00:00`)
  if (hasta)  q = q.lte('creado_en', `${hasta}T23:59:59`)
  if (buscar) {
    const term = buscar.trim().replace(/[,()%*\\]/g, '')
    if (term) q = q.ilike('descripcion', `%${term}%`)
  }
  q = q.order('creado_en', { ascending: false }).limit(limit)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => ({ ...r, tabla_label: NOMBRE_TABLA[r.tabla] || r.tabla }))
  return NextResponse.json(rows)
}
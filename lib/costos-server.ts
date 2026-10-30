// lib/costos-server.ts
// Carga desde Supabase lo que necesita el motor de costos (lib/costos.ts).
import { calcularCostosObra, resolverDocumentosCompra, type DocCompra, type PesosFacturas } from './costos'
import { pesosFacturaPorPartida } from './recepciones'

const TAM_PAGINA = 1000

// Trae todas las filas por páginas: PostgREST corta en 1000 sin avisar, y un gasto
// real truncado se vería como un número correcto. `consulta` debe tener orden estable.
export async function traerTodo<T = any>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await consulta(desde, desde + TAM_PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < TAM_PAGINA) return out
  }
}

// FK: la partida debe pertenecer al proyecto (y este a la organización).
export async function partidaEsDeProyecto(supabase: any, ownerId: string, partidaId: string, proyectoId: string | null | undefined) {
  if (!proyectoId) return false
  const { data } = await supabase
    .from('partidas_proyecto').select('id')
    .eq('id', partidaId).eq('proyecto_id', proyectoId).eq('user_id', ownerId).maybeSingle()
  return !!data
}

// Todas las partidas indicadas deben ser de ese proyecto (se ignoran las vacías).
export async function partidasSonDeProyecto(supabase: any, ownerId: string, partidaIds: (string | null | undefined)[], proyectoId: string | null | undefined) {
  const ids = [...new Set(partidaIds.filter(Boolean))] as string[]
  if (ids.length === 0) return true
  if (!proyectoId) return false
  const { data } = await supabase.from('partidas_proyecto').select('id')
    .eq('user_id', ownerId).eq('proyecto_id', proyectoId).in('id', ids)
  return (data ?? []).length === ids.length
}

// Una factura con OCs asociadas se reparte entre las partidas de esas OCs.
// Solo afina el detalle por partida: si falla, los totales de la obra no cambian.
async function cargarPesosFacturas(supabase: any, ownerId: string, proyIds: string[]): Promise<PesosFacturas> {
  try {
    const ordenes = await traerTodo<any>((d, h) => supabase.from('ordenes_compra')
      .select('id, partida_id, factura_id')
      .eq('user_id', ownerId).in('proyecto_id', proyIds).not('factura_id', 'is', null)
      .order('id').range(d, h))
    if (ordenes.length === 0) return {}
    const ids = ordenes.map(o => o.id)
    const [lineas, recepciones] = await Promise.all([
      traerTodo<any>((d, h) => supabase.from('orden_compra_lineas').select('id, orden_id, cantidad, precio_unitario, partida_id')
        .eq('user_id', ownerId).in('orden_id', ids).order('id').range(d, h)),
      traerTodo<any>((d, h) => supabase.from('recepciones_oc').select('orden_id, linea_id, cantidad')
        .eq('user_id', ownerId).in('orden_id', ids).order('id').range(d, h)),
    ])
    const porFactura = new Map<string, any[]>()
    for (const o of ordenes) {
      const fila = {
        partida_id: o.partida_id,
        lineas: lineas.filter(l => l.orden_id === o.id),
        recepciones: recepciones.filter(r => r.orden_id === o.id),
      }
      porFactura.set(o.factura_id, [...(porFactura.get(o.factura_id) ?? []), fila])
    }
    return Object.fromEntries([...porFactura].map(([id, oc]) => [id, pesosFacturaPorPartida(oc)]))
  } catch {
    return {}
  }
}

export async function cargarCostosObras(supabase: any, ownerId: string, proyectos: any[]) {
  if (proyectos.length === 0) return []
  const proyIds = proyectos.map(p => p.id)
  const proyNombres = proyectos.map(p => p.nombre).filter(Boolean)
  const COLS_DOC = 'id, proyecto, proyecto_id, partida_id, factura_ref, neto, tipo, doc_tipo'

  const [partidas, gastos, docs, notas, pesos] = await Promise.all([
    traerTodo((d, h) => supabase.from('partidas_proyecto').select('*')
      .eq('user_id', ownerId).in('proyecto_id', proyIds).order('id').range(d, h)),
    traerTodo((d, h) => supabase.from('gastos_obra').select('*')
      .eq('user_id', ownerId).in('proyecto_id', proyIds).order('id').range(d, h)),
    // Se enlaza por proyecto_id (fiable). Se incluyen también las que solo tienen
    // el nombre en texto (facturas antiguas aún sin migrar) para no perder gasto.
    traerTodo<DocCompra>((d, h) => supabase.from('facturas').select(COLS_DOC)
      .eq('user_id', ownerId).eq('tipo', 'compra')
      .or(`proyecto_id.in.(${proyIds.join(',')}),proyecto.in.(${proyNombres.map(n => `"${String(n).replace(/"/g, '')}"`).join(',') || '"__no_match__"'})`)
      .order('id').range(d, h)),
    // Las notas importadas del SII no traen obra: heredan la de su factura.
    traerTodo<DocCompra>((d, h) => supabase.from('facturas').select(COLS_DOC)
      .eq('user_id', ownerId).eq('tipo', 'compra')
      .in('doc_tipo', ['nota_credito', 'nota_debito']).not('factura_ref', 'is', null)
      .order('id').range(d, h)),
    cargarPesosFacturas(supabase, ownerId, proyIds),
  ])

  const unicos = new Map([...docs, ...notas].map(d => [d.id, d]))
  const resueltos = resolverDocumentosCompra([...unicos.values()])

  return proyectos.map(proy => calcularCostosObra(
    proy,
    partidas.filter((p: any) => p.proyecto_id === proy.id),
    gastos,
    resueltos,
    pesos,
  ))
}

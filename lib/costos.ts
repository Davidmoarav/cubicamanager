// lib/costos.ts
// Motor del COSTO REAL por obra: funciones puras, compartidas por el presupuesto
// y el informe ejecutivo.
//
//   presupuesto_costo  = suma de (cantidad x costo_unitario)        [lo planificado]
//   presupuesto_venta  = suma de (cantidad x precio_unitario)       [costo + markup]
//   ganancia_esperada  = venta - costo
//   gasto_real         = gastos de obra + documentos de compra      [lo REAL]
//   desviacion         = presupuesto_costo - gasto_real  (verde si positivo)
//   ganancia_real      = venta_ejecutada - gasto_real

// ─── Cálculo recursivo del árbol de partidas (N niveles) ───
// Devuelve, para un nodo, sus totales acumulando hacia arriba desde las hojas.
// Solo las HOJAS (partidas reales) tienen costo/venta propios; los grupos suman.
export function calcNodo(nodo: any, hijosDe: (id: string) => any[]): {
  costo: number; venta: number; costoEjec: number; ventaEjec: number; avance: number
} {
  const hijos = hijosDe(nodo.id)
  if (hijos.length === 0) {
    const cant  = Number(nodo.cantidad) || 0
    const costo = cant * (Number(nodo.costo_unitario) || 0)
    const venta = cant * (Number(nodo.precio_unitario) || 0)
    const av = Number(nodo.avance) || 0
    return { costo, venta, costoEjec: costo * av / 100, ventaEjec: venta * av / 100, avance: av }
  }
  let costo = 0, venta = 0, costoEjec = 0, ventaEjec = 0
  for (const h of hijos) {
    const r = calcNodo(h, hijosDe)
    costo += r.costo; venta += r.venta; costoEjec += r.costoEjec; ventaEjec += r.ventaEjec
  }
  const avance = venta > 0 ? (ventaEjec / venta) * 100 : 0
  return { costo, venta, costoEjec, ventaEjec, avance }
}

// ─── Documentos de compra ──────────────────────────────────
export interface DocCompra {
  id?: string
  proyecto?: string | null
  proyecto_id?: string | null
  partida_id?: string | null
  factura_ref?: string | null
  doc_tipo?: string | null
  neto?: number | null
}

const DOCS_CON_GASTO = ['factura', 'boleta', 'nota_credito', 'nota_debito']

// Con signo: la nota de crédito rebaja el gasto, la de débito lo aumenta.
export function netoConSigno(doc: DocCompra): number {
  const neto = Number(doc.neto) || 0
  return (doc.doc_tipo === 'nota_credito') ? -Math.abs(neto) : neto
}

// Deja solo los documentos que cuentan como gasto. Una nota sigue a la factura que
// modifica (el SII las importa sin obra): si la factura tiene obra, hereda su imputación.
export function resolverDocumentosCompra<T extends DocCompra>(docs: T[]): T[] {
  const porId = new Map(docs.filter(d => d.id).map(d => [d.id as string, d]))
  return docs
    .filter(d => DOCS_CON_GASTO.includes(d.doc_tipo || 'factura'))
    .map(d => {
      const esNota = d.doc_tipo === 'nota_credito' || d.doc_tipo === 'nota_debito'
      const ref = esNota && d.factura_ref ? porId.get(d.factura_ref) : undefined
      if (!ref || !(ref.proyecto_id || ref.proyecto)) return d
      return { ...d, proyecto_id: ref.proyecto_id, proyecto: ref.proyecto, partida_id: ref.partida_id }
    })
}

// Enlace por id (fiable); si la factura aún no tiene id, se acepta el nombre exacto.
export const docsDeObra = <T extends DocCompra>(docs: T[], proy: { id: string; nombre?: string }) =>
  docs.filter(d => d.proyecto_id ? d.proyecto_id === proy.id : d.proyecto === proy.nombre)

// Reparto de una factura entre partidas, según las OCs que paga (id de factura → pesos)
export type PesosFacturas = Record<string, { partida_id: string | null; peso: number }[]>

// ─── Costos de una obra ────────────────────────────────────
export function calcularCostosObra(proy: any, partidas: any[], gastos: any[], docs: DocCompra[], pesosFacturas: PesosFacturas = {}) {
  const hijosDe = (id: string) => partidas.filter(p => p.parent_id === id).sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const raices = partidas.filter(p => !p.parent_id).sort((a, b) => (a.orden || 0) - (b.orden || 0))

  let presupuestoCosto = 0
  let presupuestoVenta = 0
  let costoEjecutado   = 0
  let ventaEjecutada   = 0

  // Suma recursiva desde las raíces (soporta 2 o 3 niveles indistintamente)
  const totalesRaiz = new Map<string, number>()
  for (const raiz of raices) {
    const r = calcNodo(raiz, hijosDe)
    totalesRaiz.set(raiz.id, r.costo)
    presupuestoCosto += r.costo
    presupuestoVenta += r.venta
    costoEjecutado   += r.costoEjec
    ventaEjecutada   += r.ventaEjec
  }

  // ─── GASTO REAL: gastos de obra + documentos de compra del proyecto ───
  const gastosProy = gastos.filter(g => g.proyecto_id === proy.id)
  const sumaGastos = (filas: any[]) => filas.reduce((s, g) => s + (Number(g.monto) || 0), 0)
  const gastoOrdenes  = sumaGastos(gastosProy.filter(g => g.orden_compra_id))
  // `agregado`: la mano de obra que recibe agrupada el jefe de obra (ocultarSueldos)
  const gastoSueldos  = sumaGastos(gastosProy.filter(g => g.liquidacion_id || g.agregado))
  const gastoSubcontratos = sumaGastos(gastosProy.filter(g => g.subcontrato_ep_id))
  const gastoEquipos  = sumaGastos(gastosProy.filter(g => g.equipo_uso_id))
  const gastoTraspasos = sumaGastos(gastosProy.filter(g => g.traspaso_id))
  const gastoManual   = sumaGastos(gastosProy.filter(g =>
    !g.orden_compra_id && !g.liquidacion_id && !g.agregado && !g.subcontrato_ep_id && !g.equipo_uso_id && !g.traspaso_id))

  const docsProy = docsDeObra(docs, proy)
  const gastoFacturas = docsProy.reduce((s, d) => s + netoConSigno(d), 0)

  // El jefe de obra no ve la mano de obra de cuadrillas chicas: el gasto la omite y se avisa
  const manoObraReservada = gastosProy.some(g => g.reservado)

  const gastoReal = gastoManual + gastoOrdenes + gastoSueldos + gastoSubcontratos + gastoEquipos + gastoTraspasos + gastoFacturas

  // Gasto real por partida (para el detalle)
  const gastoPorPartida: Record<string, number> = {}
  for (const g of gastosProy) {
    if (g.partida_id) gastoPorPartida[g.partida_id] = (gastoPorPartida[g.partida_id] || 0) + (Number(g.monto) || 0)
  }
  for (const d of docsProy) {
    if (d.partida_id) {
      gastoPorPartida[d.partida_id] = (gastoPorPartida[d.partida_id] || 0) + netoConSigno(d)
      continue
    }
    // Sin partida propia: se reparte según las OCs que paga (la nota sigue a su factura)
    const pesos = pesosFacturas[d.id ?? ''] ?? pesosFacturas[d.factura_ref ?? ''] ?? []
    const total = pesos.reduce((s, p) => s + p.peso, 0)
    if (total <= 0) continue
    for (const p of pesos) {
      if (p.partida_id) gastoPorPartida[p.partida_id] = (gastoPorPartida[p.partida_id] || 0) + netoConSigno(d) * p.peso / total
    }
  }

  // ─── DETALLE POR PARTIDA: presupuesto de costo vs gastado real ───
  // El gastado de una partida incluye los gastos ligados a ella y a toda su descendencia.
  const gastadoRama = (nodo: any): number =>
    (gastoPorPartida[nodo.id] || 0) + hijosDe(nodo.id).reduce((s, h) => s + gastadoRama(h), 0)

  const detallePartidas = raices.map(raiz => {
    const presPart = totalesRaiz.get(raiz.id) || 0
    const gastadoPart = gastadoRama(raiz)
    return {
      id: raiz.id,
      descripcion: raiz.descripcion,
      presupuesto_costo: Math.round(presPart),
      gastado: Math.round(gastadoPart),
      pct_gastado: presPart > 0 ? Math.round((gastadoPart / presPart) * 100) : 0,
    }
  }).sort((a, b) => b.gastado - a.gastado)   // los más tocados primero

  // Lo que entró a la obra pero no a una partida vigente
  const gastoEnPartidas = raices.reduce((s, r) => s + gastadoRama(r), 0)
  const gastoSinPartida = gastoReal - gastoEnPartidas

  const gananciaEsperada = presupuestoVenta - presupuestoCosto
  const desviacion = presupuestoCosto - gastoReal       // + = holgura contra el presupuesto TOTAL
  // Desviación REAL: compara el gasto con lo que debería haber costado el avance actual.
  // Es la métrica que importa en obra: "para el avance que llevo, ¿voy sobre o bajo costo?"
  const desviacionEjecutada = costoEjecutado - gastoReal   // + = vas bajo costo; − = sobregirado
  const pctCostoEjecutado = costoEjecutado > 0 ? Math.round((gastoReal / costoEjecutado) * 100) : 0
  const gananciaReal = ventaEjecutada - gastoReal       // utilidad real a la fecha
  const margenRealPct = ventaEjecutada > 0 ? Math.round((gananciaReal / ventaEjecutada) * 100) : 0
  const markupReal = presupuestoCosto > 0 ? Math.round((gananciaEsperada / presupuestoCosto) * 100) : 0
  const margenVentaPct = presupuestoVenta > 0 ? Math.round((gananciaEsperada / presupuestoVenta) * 100) : 0
  const pctEjecutado = presupuestoVenta > 0 ? Math.round((ventaEjecutada / presupuestoVenta) * 100) : 0
  const pctGastado = presupuestoCosto > 0 ? Math.round((gastoReal / presupuestoCosto) * 100) : 0

  return {
    proyecto_id: proy.id,
    nombre: proy.nombre,
    cliente: proy.cliente,
    estado: proy.estado,
    avance_fisico: Number(proy.avance) || 0,
    n_partidas: raices.length,
    // Presupuesto
    presupuesto_costo: Math.round(presupuestoCosto),
    presupuesto_venta: Math.round(presupuestoVenta),
    ganancia_esperada: Math.round(gananciaEsperada),
    markup_real: markupReal,
    margen_venta_pct: margenVentaPct,
    // Ejecutado teórico (avance)
    costo_ejecutado: Math.round(costoEjecutado),
    venta_ejecutada: Math.round(ventaEjecutada),
    pct_ejecutado: pctEjecutado,
    // GASTO REAL
    mano_obra_reservada: manoObraReservada,
    gasto_real: Math.round(gastoReal),
    gasto_manual: Math.round(gastoManual),
    gasto_ordenes: Math.round(gastoOrdenes),
    gasto_sueldos: Math.round(gastoSueldos),
    gasto_subcontratos: Math.round(gastoSubcontratos),
    gasto_equipos: Math.round(gastoEquipos),
    gasto_traspasos: Math.round(gastoTraspasos),
    gasto_facturas: Math.round(gastoFacturas),
    gasto_sin_partida: Math.round(gastoSinPartida),
    gasto_por_partida: gastoPorPartida,
    detalle_partidas: detallePartidas,
    desviacion: Math.round(desviacion),
    desviacion_ejecutada: Math.round(desviacionEjecutada),
    pct_costo_ejecutado: pctCostoEjecutado,
    ganancia_real: Math.round(gananciaReal),
    margen_real_pct: margenRealPct,
    pct_gastado: pctGastado,
    // Compat
    presupuesto_partidas: Math.round(presupuestoVenta),
    ejecutado: Math.round(ventaEjecutada),
    valor_contrato: Number(proy.valor) || 0,
    pct_presupuesto: pctEjecutado,
    // Moneda del proyecto (partidas y costos SIEMPRE en pesos; contrato en su moneda)
    moneda: proy.moneda || 'peso',
    valor_uf: Number(proy.valor_uf) || 0,
    // Valor del contrato convertido a pesos (para comparar con costos)
    valor_contrato_pesos: (proy.moneda === 'uf')
      ? Math.round((Number(proy.valor) || 0) * (Number(proy.valor_uf) || 0))
      : Number(proy.valor) || 0,
  }
}

// ─── Mano de obra real por mes ('YYYY-MM' → monto) ─────────
export function moRealPorMes(gastos: any[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const g of gastos) {
    // 'mano de obra' es la clave antigua de los gastos automáticos (ver sql/41)
    if (g.categoria !== 'mano_obra' && g.categoria !== 'mano de obra') continue
    const mes = String(g.fecha || '').slice(0, 7)
    if (mes) out[mes] = (out[mes] || 0) + (Number(g.monto) || 0)
  }
  return out
}

// ─── Opciones de partida para un <select>, en orden de árbol ───
export function opcionesPartida(partidas: any[]): { value: string; label: string }[] {
  const lista = Array.isArray(partidas) ? partidas : []
  const hijosDe = (id: string | null) => lista
    .filter(p => (p.parent_id || null) === id)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const out: { value: string; label: string }[] = []
  const visitar = (id: string | null, nivel: number) => {
    for (const p of hijosDe(id)) {
      out.push({ value: p.id, label: `${'— '.repeat(nivel)}${p.descripcion}` })
      visitar(p.id, nivel + 1)
    }
  }
  visitar(null, 0)
  return out
}

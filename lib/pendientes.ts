// lib/pendientes.ts
// Qué requiere atención: en la empresa, en una obra y en una cuenta nueva.
// Funciones puras. Una lista en null significa que no se pudo leer: esa regla no opina.
import { fmt, fmtFecha, fmtPeriodo } from './format'

export interface Pendiente {
  id: string
  texto: string
  detalle?: string
  href: string
  urgente?: boolean
}

type Lista = any[] | null | undefined
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function mesAnterior(hoy: string): string {
  const [y, m] = hoy.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function calcularPendientes(d: {
  rol: string
  hoy: string
  proyectos?: Lista
  facturas?: Lista      // con las notas ya resueltas a la obra de su factura
  ordenes?: Lista
  estadosPago?: Lista
  empleados?: Lista
  liquidaciones?: Lista // las del mes anterior
  incidentes?: Lista
  avisosPago?: Lista    // pagos que informó el cliente en el portal, sin revisar
}): Pendiente[] {
  const out: Pendiente[] = []
  const finanzas = d.rol === 'admin' || d.rol === 'contador'
  const obra = d.rol === 'admin' || d.rol === 'jefe_obra'
  const proyectos = d.proyectos ?? []
  const nombreObra = (id: string) => proyectos.find(p => p.id === id)?.nombre ?? 'una obra'

  if (finanzas && d.facturas) {
    const vencidas = d.facturas.filter(f =>
      (f.tipo || 'venta') !== 'compra' && f.doc_tipo !== 'nota_credito' && f.estado !== 'pagada' &&
      (f.estado === 'vencida' || (f.vencimiento && f.vencimiento < d.hoy)))
    if (vencidas.length > 0) {
      const mes = vencidas.map(f => f.periodo).filter(Boolean).sort()[0]
      out.push({
        id: 'vencidas', urgente: true,
        texto: plural(vencidas.length, 'factura vencida por cobrar', 'facturas vencidas por cobrar'),
        detalle: fmt(vencidas.reduce((s, f) => s + (Number(f.monto) || 0), 0)),
        href: mes ? `/facturacion?periodo=${mes}` : '/facturacion',
      })
    }

    const asignable = (f: any) => f.tipo === 'compra' && !(f.doc_tipo === 'nota_credito' || f.doc_tipo === 'nota_debito')
    const sinObra = d.facturas.filter(f => asignable(f) && !f.proyecto_id && !f.proyecto)
    if (sinObra.length > 0) {
      const mes = sinObra.map(f => f.periodo).filter(Boolean).sort().pop()
      out.push({
        id: 'sin_obra',
        texto: plural(sinObra.length, 'compra sin obra', 'compras sin obra'),
        detalle: 'Su costo no entra al gasto real de ninguna obra',
        href: mes ? `/facturacion?periodo=${mes}&sin_obra=1` : '/facturacion',
      })
    }
  }

  if (finanzas && d.empleados && d.liquidaciones) {
    const mes = mesAnterior(d.hoy)
    const conLiquidacion = new Set(d.liquidaciones.map(l => l.empleado_id))
    const faltan = d.empleados.filter(e => e.estado !== 'inactivo' && !conLiquidacion.has(e.id))
    if (faltan.length > 0) {
      out.push({
        id: 'liquidaciones',
        texto: `${plural(faltan.length, 'liquidación', 'liquidaciones')} de ${fmtPeriodo(mes)} sin guardar`,
        detalle: 'Su sueldo no entra al costo de las obras',
        href: `/remuneraciones?periodo=${mes}`,
      })
    }
  }

  // Todos los roles: el contador registra pagos y el jefe de obra conoce a su cliente
  for (const a of (d.avisosPago ?? []).slice(0, 3)) {
    out.push({
      id: `aviso-pago-${a.id}`,
      texto: `${nombreObra(a.proyecto_id)}: el cliente informó un pago`,
      detalle: a.estado_pago?.numero ? `Estado de pago N°${a.estado_pago.numero} · ${fmt(Number(a.monto) || 0)}` : fmt(Number(a.monto) || 0),
      href: `/obra/${a.proyecto_id}?tab=pagos`,
    })
  }

  if (obra && d.incidentes) {
    for (const i of d.incidentes.filter(x => x.tipo === 'incidente' && x.estado === 'abierto').slice(0, 3)) {
      out.push({
        id: `incidente-${i.id}`, urgente: true,
        texto: `Incidente abierto en ${nombreObra(i.proyecto_id)}`,
        detalle: i.titulo || undefined,
        href: `/obra/${i.proyecto_id}?tab=prevencion`,
      })
    }
  }

  if (obra) {
    for (const p of proyectos.filter(x => x.estado === 'activo' && x.fin && x.fin < d.hoy && (Number(x.avance) || 0) < 100).slice(0, 3)) {
      out.push({
        id: `atrasada-${p.id}`, urgente: true,
        texto: `${p.nombre} debió terminar el ${fmtFecha(p.fin)}`,
        detalle: `Avance ${Math.round(Number(p.avance) || 0)}%`,
        href: `/obra/${p.id}?tab=gantt`,
      })
    }

    if (d.ordenes) {
      const porRecibir = d.ordenes.filter(o => o.estado === 'enviada' || o.estado === 'parcial')
      if (porRecibir.length > 0) {
        out.push({
          id: 'por_recibir',
          texto: plural(porRecibir.length, 'orden de compra por recibir', 'órdenes de compra por recibir'),
          href: '/ordenes-compra',
        })
      }
    }

    if (d.estadosPago) {
      const sinFactura = d.estadosPago.filter(e => e.estado === 'aprobado' && !e.factura_id)
      for (const e of sinFactura.slice(0, 3)) {
        out.push({
          id: `ep-${e.proyecto_id}-${e.numero}`,
          texto: `Estado de pago N°${e.numero} de ${nombreObra(e.proyecto_id)} sin facturar`,
          detalle: 'Ya está aprobado',
          href: `/obra/${e.proyecto_id}?tab=pagos`,
        })
      }
    }
  }

  return out.sort((a, b) => Number(!!b.urgente) - Number(!!a.urgente))
}

export interface PasoInicial {
  id: string
  texto: string
  detalle: string
  href: string
  hecho: boolean
}

// Solo para el administrador, y desaparece cuando la cuenta ya tiene lo básico
export function primerosPasos(d: {
  rol: string
  empresa?: { razon_social?: string | null; rut?: string | null } | null
  clientes: number
  obras: number
  empleados: number
}): PasoInicial[] {
  if (d.rol !== 'admin') return []
  const pasos: PasoInicial[] = [
    { id: 'empresa', texto: 'Completa los datos de tu empresa', detalle: 'Salen en cotizaciones y facturas', href: '/configuracion', hecho: !!(d.empresa?.razon_social && d.empresa?.rut) },
    { id: 'cliente', texto: 'Crea tu primer cliente', detalle: 'Para cotizarle y facturarle', href: '/clientes', hecho: d.clientes > 0 },
    { id: 'obra', texto: 'Crea tu primera obra', detalle: 'A mano, con el Copiloto o desde una cotización', href: '/proyectos', hecho: d.obras > 0 },
    { id: 'trabajadores', texto: 'Agrega a tus trabajadores', detalle: 'Para registrar horas y sueldos', href: '/rrhh', hecho: d.empleados > 0 },
  ]
  return pasos.every(p => p.hecho) ? [] : pasos
}

export interface PendienteObra {
  id: string
  texto: string
  tab?: string
  href?: string
  urgente?: boolean
}

export function pendientesObra(d: {
  proyecto: { id: string; cliente_id?: string | null; cliente?: string | null; fin?: string | null; estado?: string; avance?: number | null }
  partidas: any[]
  estadosPago: any[]
  ordenes?: Lista
  hoy: string
}): PendienteObra[] {
  const out: PendienteObra[] = []
  const p = d.proyecto
  if (d.partidas.length === 0) out.push({ id: 'partidas', texto: 'Carga las partidas de la obra', tab: 'control' })
  else {
    const conHijos = new Set(d.partidas.map(x => x.parent_id).filter(Boolean))
    const hojas = d.partidas.filter(x => !conHijos.has(x.id))
    if (d.partidas.every(x => !x.fecha_inicio)) out.push({ id: 'fechas', texto: 'Programa las fechas en la Carta Gantt', tab: 'gantt' })
    if (p.estado === 'activo' && hojas.every(x => !(Number(x.avance) > 0))) out.push({ id: 'avance', texto: 'Registra el primer avance', tab: 'control' })
  }
  if (!p.cliente_id) out.push({ id: 'cliente', texto: 'Asocia el cliente de la obra', tab: 'cliente' })
  if (!p.fin) out.push({ id: 'termino', texto: 'Define la fecha de término: sin ella no se proyecta el flujo de caja', href: '/proyectos' })
  if (p.estado === 'activo' && p.fin && p.fin < d.hoy && (Number(p.avance) || 0) < 100) {
    out.push({ id: 'atrasada', texto: `La fecha de término era el ${fmtFecha(p.fin)}`, tab: 'gantt', urgente: true })
  }
  for (const e of d.estadosPago.filter(x => x.estado === 'aprobado' && !x.factura_id)) {
    out.push({ id: `ep-${e.numero}`, texto: `Factura el estado de pago N°${e.numero}, ya aprobado`, tab: 'pagos' })
  }
  const porRecibir = (d.ordenes ?? []).filter(o => o.estado === 'enviada' || o.estado === 'parcial')
  if (porRecibir.length > 0) {
    out.push({ id: 'ordenes', texto: `${plural(porRecibir.length, 'orden de compra', 'órdenes de compra')} por recibir`, href: '/ordenes-compra' })
  }
  return out.sort((a, b) => Number(!!b.urgente) - Number(!!a.urgente))
}

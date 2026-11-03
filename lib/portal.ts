// lib/portal.ts
// Snapshot del portal del cliente (Fase 5): función PURA que arma lo que el
// cliente puede ver. Nada de costos internos, márgenes ni borradores.

export interface PartidaSnap {
  id: string
  parent_id?: string | null
  orden: number
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  avance?: number
  es_grupo?: boolean
  fecha_inicio?: string | null
  fecha_fin?: string | null
  responsable?: string | null
}

export interface EpSnap {
  numero: number
  fecha?: string | null
  periodo?: string | null
  estado: string
  total: number
}

export interface SnapshotPortal {
  version: 1
  nombre: string
  estado: string
  descripcion?: string
  avance: number
  empresa: { nombre: string; telefono?: string; email?: string }
  cliente?: string | null
  montos: { neto: number; iva: number; total: number; pagado: number; saldo: number }
  presupuesto: {
    grupos: {
      nombre: string
      subtotal: number
      items: { descripcion: string; cantidad: number; unidad: string; precio_unitario: number; subtotal: number }[]
    }[]
  }
  etapas: {
    id: string
    nombre: string
    avance: number
    valor: number
    fecha_inicio?: string | null
    fecha_fin?: string | null
  }[]
  cobros: EpSnap[]
  calendario?: string
  generado_en: string
}

const IVA = 0.19

// EPs que el cliente NO debe ver
const EP_OCULTOS = new Set(['borrador', 'rechazado'])

export function armarSnapshot(args: {
  proyecto: { nombre: string; estado: string; descripcion?: string | null; avance?: number; calendario_gantt?: string | null }
  partidas: PartidaSnap[]
  eps: { numero: number; fecha?: string | null; periodo?: string | null; estado: string; total: number }[]
  empresa?: { razon_social?: string; telefono?: string; email?: string } | null
  cliente?: { razon_social?: string } | null
  ahora?: string
}): SnapshotPortal {
  const { proyecto, partidas, eps, empresa, cliente } = args

  const hijosDe = (id: string) =>
    partidas.filter(p => p.parent_id === id).sort((a, b) => a.orden - b.orden)

  const valorNodo = (n: PartidaSnap): number => {
    const h = hijosDe(n.id)
    if (h.length === 0) return Math.round((Number(n.cantidad) || 0) * (Number(n.precio_unitario) || 0))
    return h.reduce((s, c) => s + valorNodo(c), 0)
  }

  // Hojas de un grupo, aplanadas (el cliente ve lista simple por etapa)
  const hojasDe = (n: PartidaSnap): PartidaSnap[] => {
    const h = hijosDe(n.id)
    if (h.length === 0) return [n]
    return h.flatMap(hojasDe)
  }

  const raices = partidas.filter(p => !p.parent_id).sort((a, b) => a.orden - b.orden)

  const grupos = raices.map(r => {
    const esGrupo = hijosDe(r.id).length > 0 || r.es_grupo
    const items = (esGrupo ? hojasDe(r) : [r]).map(h => ({
      descripcion: h.descripcion,
      cantidad: Number(h.cantidad) || 0,
      unidad: h.unidad,
      precio_unitario: Math.round(Number(h.precio_unitario) || 0),
      subtotal: valorNodo(h),
    }))
    return {
      nombre: esGrupo ? r.descripcion : 'GENERAL',
      subtotal: valorNodo(r),
      items,
    }
  })

  const neto = raices.reduce((s, r) => s + valorNodo(r), 0)
  const iva = Math.round(neto * IVA)
  const total = neto + iva

  const cobros = eps
    .filter(e => !EP_OCULTOS.has(e.estado))
    .sort((a, b) => a.numero - b.numero)
    .map(e => ({
      numero: e.numero,
      fecha: e.fecha ?? null,
      periodo: e.periodo ?? null,
      estado: e.estado,
      total: Math.round(Number(e.total) || 0),
    }))

  const pagado = cobros.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.total, 0)

  const etapas = raices
    .filter(r => hijosDe(r.id).length > 0 || r.es_grupo)
    .map(r => ({
      id: r.id,
      nombre: r.descripcion,
      avance: Math.round(Number(r.avance) || 0),
      valor: valorNodo(r),
      fecha_inicio: r.fecha_inicio ?? null,
      fecha_fin: r.fecha_fin ?? null,
    }))

  return {
    version: 1,
    nombre: proyecto.nombre,
    estado: proyecto.estado,
    descripcion: proyecto.descripcion ?? undefined,
    avance: Math.round(Number(proyecto.avance) || 0),
    empresa: {
      nombre: empresa?.razon_social || 'Contratista',
      telefono: empresa?.telefono,
      email: empresa?.email,
    },
    cliente: cliente?.razon_social ?? null,
    montos: { neto, iva, total, pagado, saldo: Math.max(0, total - pagado) },
    presupuesto: { grupos },
    etapas,
    cobros,
    calendario: proyecto.calendario_gantt ?? 'lun_vie',
    generado_en: args.ahora ?? new Date().toISOString(),
  }
}

// ─── Cobros al día (sql/48) ───
// La foto del link puede tener semanas; los cobros se leen al momento con portal_cobros.
// Sin esa función (migración no ejecutada) se usa lo que trae la foto.
export interface AvisoPortal { estado: 'pendiente' | 'confirmado' | 'rechazado'; monto: number; fecha_pago: string; motivo?: string | null }
export interface CobroPortal extends EpSnap { factura?: string | null; vencimiento?: string | null; aviso?: AvisoPortal | null }
export interface BancoPortal { banco?: string | null; tipo_cuenta?: string | null; numero_cuenta?: string | null; titular?: string | null; rut?: string | null; correo?: string | null }

export function cobrosPortal(snap: Pick<SnapshotPortal, 'cobros' | 'montos'>, vivos: { cobros?: any[]; banco?: BancoPortal | null } | null) {
  const alDia = Array.isArray(vivos?.cobros)
  const cobros: CobroPortal[] = (alDia ? vivos!.cobros! : snap.cobros)
    .filter(c => !EP_OCULTOS.has(c.estado))
    .map(c => ({
      numero: c.numero, fecha: c.fecha ?? null, periodo: c.periodo ?? null, estado: c.estado,
      total: Math.round(Number(c.total) || 0), factura: c.factura ?? null, vencimiento: c.vencimiento ?? null,
      aviso: c.aviso ?? null,
    }))
    .sort((a, b) => a.numero - b.numero)
  const pagado = cobros.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.total, 0)
  const porPagar = cobros.filter(c => c.estado === 'presentado' || c.estado === 'aprobado').reduce((s, c) => s + c.total, 0)
  return {
    alDia,
    cobros,
    pagado,
    porPagar,
    saldo: Math.max(0, snap.montos.total - pagado),
    banco: alDia && vivos?.banco?.numero_cuenta ? vivos.banco : null,
  }
}

export const puedeInformarPago = (c: CobroPortal) =>
  (c.estado === 'presentado' || c.estado === 'aprobado') && c.aviso?.estado !== 'pendiente'

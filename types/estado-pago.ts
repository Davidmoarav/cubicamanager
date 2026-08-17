// types/estado-pago.ts

export interface EstadoPagoDetalle {
  id?: string
  estado_pago_id?: string
  partida_id: string
  descripcion: string
  valor_partida: number
  avance_anterior: number
  avance_actual: number
  avance_periodo: number
  monto: number
}

export interface EstadoPago {
  id: string
  proyecto_id: string
  numero: number
  periodo?: string
  fecha?: string
  // ─── Cascada ───
  avance_obra: number
  utilidad_pct: number
  utilidad_monto: number
  gg_pct: number
  gg_monto: number
  bruto: number              // Valor EEPP
  descuentos: number
  anticipo_pct: number
  anticipo_desc: number      // amortización anticipo
  multas: number
  retencion_pct: number
  retencion_monto: number
  // ─── Compat / totales ───
  monto_neto: number
  monto_pagar: number        // total neto pre-IVA
  iva: number
  total: number              // líquido a pagar
  estado: 'borrador' | 'presentado' | 'aprobado' | 'pagado' | 'rechazado'
  factura_id?: string | null
  notas?: string
  user_id?: string
  created_at?: string
  detalle?: EstadoPagoDetalle[]
}

export const ESTADO_EP: Record<string, { label: string; bg: string; color: string }> = {
  borrador:   { label: 'Borrador',   bg: '#f0f4f8', color: '#6b7a8d' },
  presentado: { label: 'Presentado', bg: '#FCEAE3', color: '#E5502A' },
  aprobado:   { label: 'Aprobado',   bg: '#e6f4ed', color: '#1a7a4a' },
  pagado:     { label: 'Pagado',     bg: '#eeedfe', color: '#534ab7' },
  rechazado:  { label: 'Rechazado',  bg: '#fdecea', color: '#b0401a' },
}
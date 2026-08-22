// types/index.ts
// Tipos base compartidos de las entidades principales.

export interface Proyecto {
  id: string
  nombre: string
  cliente: string
  descripcion?: string
  valor: number
  avance: number
  estado: string            // 'cotizacion' | 'activo' | 'terminado'
  inicio?: string
  fin?: string
  cliente_id?: string | null
  cotizacion_id?: string | null
  retencion_pct?: number
  anticipo?: number
  user_id?: string
  created_at?: string
}

export interface Empleado {
  id: string
  nombre: string
  rut?: string
  cargo?: string
  sueldo: number
  horas_extra: number
  estado: string            // 'activo' | 'vacaciones' | 'inactivo'
  tipo?: string             // 'planta' | 'subcontrato'
  modalidad?: 'mensual' | 'por_metas'   // forma de pago
  inicio?: string
  // Campos previsionales (módulo remuneraciones)
  afp_nombre?: string
  afp_pct_custom?: number | null
  salud_sistema?: 'Fonasa' | 'Isapre'
  salud_pct_custom?: number | null
  salud_uf?: number
  contrato_tipo?: 'indefinido' | 'plazo_fijo' | 'obra_faena'
  colacion?: number
  movilizacion?: number
  bono_imponible?: number
  otros_descuentos?: number
  user_id?: string
  created_at?: string
}

export interface Proveedor {
  id: string
  nombre: string
  rut?: string
  rubro?: string
  contacto?: string
  telefono?: string
  monto3m?: number
  estado: string            // 'activo' | 'cotizacion'
  user_id?: string
  created_at?: string
}

export interface Contrato {
  id: string
  numero?: string
  contraparte: string
  tipo?: string             // 'Suma alzada' | 'Serie de precios'
  valor: number
  inicio?: string
  fin?: string
  estado: string            // 'ejecucion' | 'liquidado'
  user_id?: string
  created_at?: string
}

export interface Factura {
  id: string
  numero?: string
  cliente: string
  proyecto?: string
  tipo?: 'venta' | 'compra'
  neto?: number
  iva?: number
  monto: number
  emision?: string
  vencimiento?: string
  periodo?: string
  estado: string            // 'pendiente' | 'pagada' | 'vencida'
  estado_pago_id?: string | null
  user_id?: string
  created_at?: string
}

// types/index.ts
// Tipos base compartidos de las entidades principales.

export interface Proyecto {
  calendario_gantt?: string | null
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
  // Obra única o programa con viviendas (sql/54)
  tipo?: 'unica' | 'programa'
  programa?: string | null
  codigo_grupo?: string | null
  entidad_patrocinante?: string | null
  resolucion?: string | null
  comuna?: string | null
}

export type EstadoVivienda = 'pendiente' | 'en_ejecucion' | 'terminada' | 'recepcionada'

export interface Vivienda {
  id: string
  proyecto_id: string
  partida_id: string
  beneficiario: string
  rut?: string | null
  direccion?: string | null
  rol_avaluo?: string | null
  telefono?: string | null
  subsidio_uf?: number | null
  ahorro_uf?: number | null
  postulante_id?: string | null
  estado: EstadoVivienda
  fecha_inicio?: string | null
  fecha_termino?: string | null
  fecha_recepcion?: string | null
  notas?: string | null
  // Calculados desde sus partidas
  valor?: number
  avance?: number
  partidas?: number
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
  modalidad?: 'mensual' | 'por_metas' | 'diario' | 'por_hora' | 'trato' | 'mixto'   // forma de pago
  valor_dia?: number
  valor_hora?: number
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

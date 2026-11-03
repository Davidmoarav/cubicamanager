// types/empresa.ts

export interface EmpresaConfig {
  id?: string
  markup_default?: number | null
  user_id?: string
  razon_social?: string
  rut?: string
  giro?: string
  direccion?: string
  comuna?: string
  ciudad?: string
  telefono?: string
  email?: string
  sitio_web?: string
  logo_path?: string
  color_primario?: string
  notas_pdf?: string
  banco?: string
  tipo_cuenta?: string
  numero_cuenta?: string
  titular_cuenta?: string
  rut_titular?: string
  correo_pagos?: string
  updated_at?: string
}

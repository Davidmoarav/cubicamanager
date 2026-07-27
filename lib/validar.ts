// lib/validar.ts
// Validación de payloads con zod: LISTA BLANCA de campos por entidad.
// Corta el mass assignment: cualquier campo no declarado se descarta,
// y los tipos/rangos se validan antes de tocar la base.
import { z } from 'zod'

const texto = z.string().trim().max(500)
const textoLargo = z.string().trim().max(5000)
const dinero = z.coerce.number().finite().min(-999_999_999_999).max(999_999_999_999)
const pct = z.coerce.number().finite().min(0).max(100)
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
const uuid = z.string().uuid()

export const ProyectoSchema = z.object({
  nombre:       texto.min(1, 'Falta el nombre'),
  cliente:      texto.min(1, 'Falta el cliente'),
  descripcion:  textoLargo.nullish(),
  valor:        dinero.optional(),
  avance:       pct.optional(),
  estado:       z.enum(['cotizacion', 'activo', 'terminado']).optional(),
  inicio:       fecha.nullish().or(z.literal('')),
  fin:          fecha.nullish().or(z.literal('')),
  moneda:       z.enum(['peso', 'uf']).optional(),
  valor_uf:     dinero.optional(),
  monto_contrato: dinero.optional(),
  markup_global: pct.nullish(),
  utilidad_pct: pct.optional(),
  gg_pct:       pct.optional(),
  anticipo_pct: pct.optional(),
  anticipo:     dinero.optional(),
  retencion_pct: pct.optional(),
  cliente_id:   uuid.nullish(),
  cotizacion_id: uuid.nullish(),
}).strip()

export const ContratoSchema = z.object({
  numero:      texto.nullish(),
  contraparte: texto.min(1, 'Falta la contraparte'),
  tipo:        texto.optional(),
  valor:       dinero.optional(),
  inicio:      fecha.nullish().or(z.literal('')),
  fin:         fecha.nullish().or(z.literal('')),
  estado:      z.enum(['ejecucion', 'liquidado', 'pendiente']).optional(),
  proyecto_id: uuid.nullish(),
  cliente_id:  uuid.nullish(),
}).strip()

export const ProveedorSchema = z.object({
  nombre:   texto.min(1, 'Falta el nombre'),
  rut:      texto.nullish(),
  rubro:    texto.nullish(),
  contacto: texto.nullish(),
  telefono: texto.nullish(),
  monto3m:  dinero.optional(),
  estado:   z.enum(['activo', 'cotizacion']).optional(),
}).strip()

export const ClienteSchema = z.object({
  razon_social: texto.min(1, 'Falta la razón social'),
  rut:          texto.nullish(),
  giro:         texto.nullish(),
  direccion:    texto.nullish(),
  comuna:       texto.nullish(),
  ciudad:       texto.nullish(),
  contacto:     texto.nullish(),
  email:        z.string().trim().email().max(300).nullish().or(z.literal('')),
  telefono:     texto.nullish(),
  notas:        textoLargo.nullish(),
}).strip()

export const EmpleadoSchema = z.object({
  nombre:      texto.min(1, 'Falta el nombre'),
  rut:         texto.nullish(),
  cargo:       texto.nullish(),
  sueldo:      dinero.optional(),
  horas_extra: z.coerce.number().int().min(0).max(200).optional(),
  estado:      z.enum(['activo', 'vacaciones', 'inactivo']).optional(),
  tipo:        z.enum(['planta', 'subcontrato']).optional(),
  inicio:      fecha.nullish().or(z.literal('')),
  proyecto_id: uuid.nullish(),
  // Previsional
  afp_nombre:       texto.nullish(),
  afp_pct_custom:   pct.nullish(),
  salud_sistema:    z.enum(['Fonasa', 'Isapre']).nullish(),
  salud_pct_custom: pct.nullish(),
  salud_uf:         z.coerce.number().min(0).max(1000).nullish(),
  contrato_tipo:    z.enum(['indefinido', 'plazo_fijo', 'obra_faena']).nullish(),
  colacion:         dinero.optional(),
  movilizacion:     dinero.optional(),
  bono_imponible:   dinero.optional(),
  otros_descuentos: dinero.optional(),
}).strip()

export const DocumentoSchema = z.object({
  proyecto_id:  uuid,
  nombre:       texto.min(1),
  descripcion:  textoLargo.nullish(),
  categoria:    z.enum(['plano', 'foto', 'contrato', 'permiso', 'especificacion', 'presupuesto', 'general']).optional(),
  archivo_path: z.string().trim().max(1000),
  archivo_tipo: texto.nullish(),
  archivo_size: z.coerce.number().int().min(0).optional(),
}).strip()

export const FacturaSchema = z.object({
  numero:      texto.nullish(),
  cliente:     texto.min(1, 'Falta el cliente'),
  proyecto:    texto.nullish(),
  proyecto_id: uuid.nullish(),
  tipo:        z.enum(['venta', 'compra']).optional(),
  doc_tipo:    z.enum(['factura', 'nota_credito', 'nota_debito', 'boleta']).optional(),
  factura_ref: z.string().trim().max(100).nullish(),
  partida_id:  uuid.nullish(),
  rut_contraparte: z.string().trim().max(20).nullish(),
  neto:        dinero.optional(),
  iva:         dinero.optional(),
  monto:       dinero.optional(),
  emision:     fecha.nullish().or(z.literal('')),
  vencimiento: fecha.nullish().or(z.literal('')),
  periodo:     z.string().regex(/^\d{4}-\d{2}$/).nullish().or(z.literal('')),
  estado:      z.enum(['pagada', 'pendiente', 'vencida']).optional(),
  estado_pago_id: uuid.nullish(),
}).strip()

// ─── Helper: valida y devuelve datos limpios o un mensaje de error ───
export function validar<T>(schema: z.ZodType<T>, body: unknown):
  { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(body)
  if (r.success) return { ok: true, data: r.data }
  const issue = r.error.issues[0]
  const campo = issue?.path?.join('.') || ''
  return { ok: false, error: `${campo ? campo + ': ' : ''}${issue?.message || 'Datos inválidos'}` }
}

// Para updates parciales: valida solo los campos presentes
export function validarParcial<T extends z.ZodObject<any>>(schema: T, body: unknown):
  { ok: true; data: Record<string, any> } | { ok: false; error: string } {
  return validar(schema.partial() as any, body) as any
}
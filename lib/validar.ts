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
// Fecha opcional: acepta '', null o undefined y los normaliza a null.
// Evita insertar '' en columnas DATE de Postgres (que lo rechaza y hace
// fallar el guardado en silencio).
const fechaOpc = fecha.or(z.literal('')).nullish().transform(v => (v == null || v === '') ? null : v)
const uuid = z.string().uuid()

export const ProyectoSchema = z.object({
  nombre:       texto.min(1, 'Falta el nombre'),
  cliente:      texto.min(1, 'Falta el cliente'),
  descripcion:  textoLargo.nullish(),
  valor:        dinero.optional(),
  avance:       pct.optional(),
  estado:       z.enum(['cotizacion', 'activo', 'terminado']).optional(),
  inicio:       fechaOpc,
  fin:          fechaOpc,
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
  inicio:      fechaOpc,
  fin:         fechaOpc,
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
  modalidad:   z.enum(['mensual', 'por_metas']).optional(),
  inicio:      fechaOpc,
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
  libro_id:     uuid.nullish(),
  prevencion_id: uuid.nullish(),
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
  emision:     fechaOpc,
  vencimiento: fechaOpc,
  periodo:     z.string().regex(/^\d{4}-\d{2}$/).nullish().or(z.literal('')),
  estado:      z.enum(['pagada', 'pendiente', 'vencida']).optional(),
  estado_pago_id: uuid.nullish(),
}).strip()

// Asignar obra y partida a documentos de compra ya cargados (p. ej. importados del SII)
export const AsignarFacturasSchema = z.object({
  ids:         z.array(uuid).min(1, 'Elige al menos un documento').max(500),
  proyecto_id: uuid.nullable(),
  partida_id:  uuid.nullish(),
}).strip()

// Parte diario: reemplaza las horas de UN día en UNA obra
export const ParteDiarioSchema = z.object({
  proyecto_id: uuid,
  fecha,
  filas: z.array(z.object({
    empleado_id: uuid,
    partida_id:  uuid.nullish(),
    horas:       z.coerce.number().positive('Las horas deben ser mayores que 0').max(24, 'Máximo 24 horas por día')
                  .refine(h => Number.isInteger(h * 10), 'Usa como máximo un decimal en las horas'),
    notas:       texto.nullish(),
  }).strip()).max(500),
  // Huella de lo que se creía que había: si otra persona lo cambió, no se pisa
  base: z.string().max(100_000).nullish(),
}).strip()

export const AvancePartidaSchema = z.object({
  id: uuid,
  avance: pct,
  base_avance: z.coerce.number().finite().nullish(),
}).strip()

// Recepción por línea de una orden de compra
export const RecepcionSchema = z.object({
  orden_id:  uuid,
  fecha,
  documento: texto.nullish(),
  notas:     texto.nullish(),
  items: z.array(z.object({
    linea_id: uuid,
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor que 0').max(99_999_999),
    a_bodega: z.boolean().optional(),
  }).strip()).max(500),
}).strip()

// Movimiento manual de bodega. La cantidad de consumo y traspaso va en positivo.
export const MovimientoBodegaSchema = z.object({
  tipo:           z.enum(['entrada', 'consumo', 'ajuste', 'traspaso']),
  proyecto_id:    uuid,
  material:       texto.min(1, 'Falta el material'),
  unidad:         texto.nullish(),
  cantidad:       z.coerce.number().finite().min(-99_999_999).max(99_999_999).refine(n => n !== 0, 'La cantidad no puede ser 0'),
  costo_unitario: z.coerce.number().int().min(0).nullish(),
  fecha,
  partida_id:     uuid.nullish(),
  destino_id:     uuid.nullish(),
  notas:          texto.nullish(),
}).strip()

export const SubcontratoSchema = z.object({
  proyecto_id:        uuid,
  proveedor_id:       uuid.nullish(),
  subcontratista:     texto.min(1, 'Falta el subcontratista'),
  descripcion:        texto.nullish(),
  partida_id:         uuid.nullish(),
  monto_contrato:     z.coerce.number().int().min(0).max(999_999_999_999),
  retencion_pct:      pct.optional(),
  anticipo:           z.coerce.number().int().min(0).max(999_999_999_999).optional(),
  retencion_devuelta: z.coerce.number().int().min(0).max(999_999_999_999).optional(),
  fecha_inicio:       fechaOpc,
  fecha_fin:          fechaOpc,
  estado:             z.enum(['vigente', 'terminado', 'anulado']).optional(),
  notas:              texto.nullish(),
}).strip()

export const EPSubcontratoSchema = z.object({
  subcontrato_id:   uuid,
  avance_acumulado: pct,
  fecha,
  notas:            texto.nullish(),
}).strip()

export const EquipoSchema = z.object({
  nombre:       texto.min(1, 'Falta el nombre'),
  codigo:       texto.nullish(),
  tipo:         z.enum(['propio', 'arrendado']).optional(),
  proveedor:    texto.nullish(),
  unidad_cobro: z.enum(['hora', 'dia', 'mes']).optional(),
  tarifa:       z.coerce.number().int().min(0).max(999_999_999_999).optional(),
  activo:       z.boolean().optional(),
}).strip()

export const UsoEquipoSchema = z.object({
  equipo_id:   uuid,
  proyecto_id: uuid,
  partida_id:  uuid.nullish(),
  fecha_desde: fecha,
  fecha_hasta: fechaOpc,
  cantidad:    z.coerce.number().positive('La cantidad debe ser mayor que 0').max(99_999_999),
  tarifa:      z.coerce.number().int().min(0).max(999_999_999_999).optional(),
  factura_id:  uuid.nullish(),
  notas:       texto.nullish(),
}).strip()

// Dependencia de la Carta Gantt: partida_id parte cuando termina depende_de_id
export const DependenciaSchema = z.object({
  partida_id:    uuid,
  depende_de_id: uuid,
  desfase_dias:  z.coerce.number().int().min(-365).max(365).optional(),
}).strip()

export const LibroObraSchema = z.object({
  proyecto_id: uuid,
  fecha,
  tipo:        z.enum(['avance', 'observacion', 'instruccion_ito', 'visita', 'otro']),
  clima:       texto.nullish(),
  texto:       textoLargo.min(1, 'Escribe lo ocurrido en la obra'),
}).strip()

export const PrevencionSchema = z.object({
  proyecto_id:   uuid,
  tipo:          z.enum(['charla', 'epp', 'inspeccion', 'incidente']),
  fecha,
  titulo:        texto.min(1, 'Falta el título'),
  detalle:       textoLargo.nullish(),
  responsable:   texto.nullish(),
  asistentes:    z.coerce.number().int().min(0).max(100000).optional(),
  gravedad:      z.enum(['leve', 'grave', 'fatal']).nullish(),
  dias_perdidos: z.coerce.number().int().min(0).max(100000).optional(),
  estado:        z.enum(['abierto', 'cerrado']).optional(),
}).strip()

export const RecursoAPUSchema = z.object({
  partida_id:  uuid,
  tipo:        z.enum(['mano_obra', 'equipo', 'otro']),
  descripcion: texto.min(1, 'Falta la descripción'),
  cantidad:    z.coerce.number().positive('La cantidad debe ser mayor que 0').max(100000),
  costo_dia:   z.coerce.number().int().min(0).max(999_999_999_999),
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
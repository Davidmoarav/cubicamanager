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
  // Obra única o programa con viviendas (sql/54)
  tipo:         z.enum(['unica', 'programa']).optional(),
  programa:     texto.nullish(),
  codigo_grupo: texto.nullish(),
  entidad_patrocinante: texto.nullish(),
  resolucion:   texto.nullish(),
  comuna:       texto.nullish(),
  // Modalidad del contrato con el mandante (sql/56)
  modalidad_contrato:  z.enum(['suma_alzada', 'serie_precios', 'administracion']).optional(),
  honorario_admin_pct: pct.optional(),
}).strip()

// Partida de obra: campos que se pueden editar (PUT parcial)
export const PartidaSchema = z.object({
  proyecto_id:         uuid.optional(),
  parent_id:           uuid.nullish(),
  orden:               z.coerce.number().int().min(0).max(1_000_000).optional(),
  descripcion:         texto.min(1, 'Falta la descripción').optional(),
  unidad:              z.string().trim().max(20).optional(),
  cantidad:            z.coerce.number().min(0).max(999_999_999).optional(),
  precio_unitario:     z.coerce.number().min(0).max(999_999_999_999).transform(Math.round).optional(),
  costo_unitario:      z.coerce.number().min(0).max(999_999_999_999).transform(Math.round).optional(),
  costo_material_unit: z.coerce.number().min(0).max(999_999_999_999).transform(Math.round).optional(),
  costo_mo_unit:       z.coerce.number().min(0).max(999_999_999_999).transform(Math.round).optional(),
  markup_pct:          z.coerce.number().min(-100).max(1000).nullish(),
  avance:              z.coerce.number().min(0).max(100).transform(Math.round).optional(),
  notas:               textoLargo.nullish(),
  es_grupo:            z.boolean().optional(),
  nivel:               z.coerce.number().int().min(1).max(10).optional(),
  fecha_inicio:        fechaOpc.optional(),
  fecha_fin:           fechaOpc.optional(),
  responsable:         texto.nullish(),
  rendimiento_dia:     z.coerce.number().min(0).max(999_999_999).nullish(),
}).strip()

export const ESTADOS_VIVIENDA = ['pendiente', 'en_ejecucion', 'terminada', 'recepcionada'] as const
const uf = z.coerce.number().finite().min(0).max(99_999_999)

export const ViviendaSchema = z.object({
  proyecto_id:     uuid,
  beneficiario:    texto.min(1, 'Falta el nombre del beneficiario'),
  rut:             texto.nullish(),
  direccion:       texto.nullish(),
  rol_avaluo:      texto.nullish(),
  telefono:        texto.nullish(),
  subsidio_uf:     uf.nullish(),
  ahorro_uf:       uf.nullish(),
  estado:          z.enum(ESTADOS_VIVIENDA).optional(),
  fecha_inicio:    fechaOpc,
  fecha_termino:   fechaOpc,
  fecha_recepcion: fechaOpc,
  notas:           textoLargo.nullish(),
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
  modalidad:   z.enum(['mensual', 'por_metas', 'diario', 'por_hora', 'trato', 'mixto']).optional(),
  valor_dia:   z.coerce.number().int().min(0).max(999_999_999).optional(),
  valor_hora:  z.coerce.number().int().min(0).max(999_999_999).optional(),
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

// Registros que pueden llevar evidencia, y la tabla donde viven
export const TABLA_EVIDENCIA = {
  partida:        'partidas_proyecto',
  estado_pago:    'estados_pago',
  parte_diario:   'parte_diario',
  recepcion_oc:   'recepciones_oc',
  subcontrato:    'subcontratos',
  subcontrato_ep: 'subcontrato_eps',
  bodega:         'bodega_movimientos',
  equipo_uso:     'equipo_usos',
  gasto:          'gastos_obra',
  contrato:       'contratos',
  factura:        'facturas',
  orden_compra:   'ordenes_compra',
  trato:          'tratos',
  trato_avance:   'trato_avances',
  // Sin tabla propia: agrupa la evidencia del parte de un día (id de lib/evidencia-ids.ts)
  parte_dia:      null,
} as const satisfies Record<string, string | null>
export type EntidadEvidencia = keyof typeof TABLA_EVIDENCIA
// Evidencia que puede no ser de una obra: un contrato, una factura, una orden de compra
export const EVIDENCIA_SIN_OBRA: EntidadEvidencia[] = ['contrato', 'factura', 'orden_compra', 'recepcion_oc']
const ENTIDADES_EVIDENCIA = Object.keys(TABLA_EVIDENCIA) as [EntidadEvidencia, ...EntidadEvidencia[]]

export const DocumentoSchema = z.object({
  proyecto_id:  uuid.nullish(),
  nombre:       texto.min(1),
  descripcion:  textoLargo.nullish(),
  categoria:    z.enum(['plano', 'foto', 'contrato', 'permiso', 'especificacion', 'presupuesto', 'general']).optional(),
  archivo_path: z.string().trim().max(1000),
  archivo_tipo: texto.nullish(),
  archivo_size: z.coerce.number().int().min(0).optional(),
  libro_id:     uuid.nullish(),
  prevencion_id: uuid.nullish(),
  // Evidencia de cualquier registro de la obra (sql/53)
  entidad_tipo: z.enum(ENTIDADES_EVIDENCIA).optional(),
  entidad_id:   uuid.optional(),
  partida_id:   uuid.optional(),
  etapa:        z.enum(['antes', 'durante', 'despues']).optional(),
  tomada_en:    z.string().datetime({ offset: true }).optional(),
  lat:          z.coerce.number().min(-90).max(90).optional(),
  lng:          z.coerce.number().min(-180).max(180).optional(),
}).strip()
  .refine(d => !d.entidad_tipo === !d.entidad_id, { message: 'La evidencia necesita el tipo y el registro' })
  .refine(d => !!d.proyecto_id || (!!d.entidad_tipo && EVIDENCIA_SIN_OBRA.includes(d.entidad_tipo)), { message: 'Falta la obra' })

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

// ─── Tratos de mano de obra (sql/55) ──────────────────────
const entero = z.coerce.number().int().min(0).max(999_999_999_999)

export const TratoSchema = z.object({
  proyecto_id:      uuid,
  partida_id:       uuid.nullish(),
  descripcion:      texto.min(1, 'Falta la descripción del trato'),
  tipo:             z.enum(['unidad', 'suma_alzada', 'vivienda', 'por_hora', 'por_dia']),
  ejecutor:         z.enum(['trabajador', 'cuadrilla', 'tercero']),
  tercero_nombre:   texto.nullish(),
  proveedor_id:     uuid.nullish(),
  documento:        z.enum(['boleta_honorarios', 'factura']).nullish(),
  unidad:           texto.nullish(),
  precio_unitario:  entero.optional(),
  cantidad_pactada: z.coerce.number().min(0).max(999_999_999).optional(),
  monto_fijo:       entero.optional(),
  retencion_pct:    pct.optional(),
  reparto:          z.enum(['iguales', 'porcentaje', 'dias']).optional(),
  fecha_inicio:     fechaOpc,
  fecha_fin:        fechaOpc,
  estado:           z.enum(['vigente', 'terminado', 'anulado']).optional(),
  notas:            textoLargo.nullish(),
}).strip()

export const ParticipantesTratoSchema = z.array(z.object({
  empleado_id: uuid,
  porcentaje:  pct.optional(),
}).strip()).max(100)

export const AvanceTratoSchema = z.object({
  trato_id: uuid,
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero').max(999_999_999),
  fecha,
  notas:    texto.nullish(),
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
  // Modalidad (sql/56)
  modalidad:          z.enum(['suma_alzada', 'precios_unitarios', 'por_tiempo', 'administracion']).optional(),
  items:              z.array(z.object({
    id:              z.string().trim().min(1).max(60),
    descripcion:     texto.min(1, 'Falta la descripción del ítem'),
    unidad:          texto.nullish(),
    cantidad:        z.coerce.number().min(0).max(999_999_999),
    precio_unitario: z.coerce.number().int().min(0).max(999_999_999_999),
  }).strip()).max(300).optional(),
  tarifa:             z.coerce.number().int().min(0).max(999_999_999).optional(),
  unidad_tiempo:      z.enum(['hora', 'dia']).optional(),
  honorario_pct:      pct.optional(),
}).strip()

export const EPSubcontratoSchema = z.object({
  subcontrato_id:   uuid,
  // Según la modalidad del subcontrato: % acumulado, horas o días, cantidades por ítem o costo rendido
  avance_acumulado: pct.optional(),
  cantidad:         z.coerce.number().min(0).max(999_999).optional(),
  cantidades:       z.record(z.string(), z.coerce.number().min(0).max(999_999_999)).optional(),
  costo:            z.coerce.number().int().min(0).max(999_999_999_999).optional(),
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
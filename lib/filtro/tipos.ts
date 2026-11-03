// Módulo Filtro DS27 Cap. IV, traído desde la app «Filtro de calificación por grupo».
import type { DatosCalculo, Modalidad, Parametros, TipoProyecto, ZonaTermica } from './reglas';

/** Un capítulo o numeral del texto de la resolución, para leerlo y analizarlo en la app. */
export interface SeccionDocumento {
  id: string;
  numeral: string;
  titulo: string;
  /** Texto: párrafos separados por línea en blanco, «- » para viñetas y «| a | b |» para tablas. */
  contenido: string;
  /** Dónde se aplica en la app (p. ej. «Criterios › Requisitos»). */
  enApp?: string;
}

/** Un llamado = una resolución con sus propios criterios. */
export interface Llamado {
  id: string;
  nombre: string;
  resolucion: string | null;
  region: string | null;
  parametros: Parametros;
  /** Texto de la resolución por capítulos (null = aún no cargado). */
  documento: SeccionDocumento[] | null;
  /** Si está bloqueado, sus criterios no se pueden editar (llamados cerrados). */
  bloqueado: boolean;
  created_at: string;
  updated_at: string;
}

export type LlamadoNuevo = Omit<Llamado, 'id' | 'created_at' | 'updated_at'>;

export const ESTADOS_GRUPO = ['En preparación', 'Postulado', 'Seleccionado', 'No seleccionado'] as const;
export type EstadoGrupo = (typeof ESTADOS_GRUPO)[number];

export interface Grupo {
  id: string;
  llamado_id: string;
  nombre: string;
  codigo: string | null;
  comuna: string;
  zona_termica: ZonaTermica;
  tipo_proyecto: TipoProyecto;
  modalidad: Modalidad;
  organizacion: string | null;
  /** 3.13: junta de vecinos u organización funcional. */
  representacion: 'junta_vecinos' | 'organizacion_funcional' | null;
  personalidad_juridica_vigente: boolean;
  /** 1 y 14.3 c): localidad urbana donde se emplazan las viviendas. */
  localidad: string | null;
  localidad_mas_5000: boolean;
  estado: EstadoGrupo;
  observaciones: string | null;
  /** Obra de Cubica a la que pasó el grupo (sql/51). */
  proyecto_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type GrupoNuevo = Omit<Grupo, 'id' | 'created_at' | 'updated_at'>;

export interface Postulante extends DatosCalculo {
  id: string;
  grupo_id: string;
  nombre: string;
  rut: string;
  direccion: string | null;
  telefono: string | null;
  /** Si cuenta para la postulación del grupo (permite filtrar sin borrar). */
  incluido: boolean;
  es_vivienda_social: boolean;
  avaluo_fiscal_uf: number | null;
  anio_permiso: number | null;
  fecha_nacimiento: string | null;
  m2_vivienda: number | null;
  copropiedad_tipo_a: boolean;
  subsidio_termico_previo_anio: number | null;
  costo_proyecto_uf: number | null;
  ahorro_uf: number | null;
  recepcion_ley_20898: boolean;
  permiso_excepcion: boolean;
  /** Documentos recibidos, por clave definida en los criterios del llamado. */
  documentos: Record<string, boolean>;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export type PostulanteNuevo = Omit<Postulante, 'id' | 'created_at' | 'updated_at'>;

export function postulanteVacio(grupo_id: string): PostulanteNuevo {
  return {
    grupo_id,
    nombre: '',
    rut: '',
    direccion: null,
    telefono: null,
    incluido: true,
    rsh_tramo: null,
    integrantes: null,
    adulto_mayor: false,
    integrantes_discapacidad: 0,
    monoparental: false,
    prision_politica: false,
    seguridad_oportunidades: false,
    recambio_calefactor_mma: false,
    anio_recepcion: null,
    anio_permiso: null,
    es_vivienda_social: false,
    avaluo_fiscal_uf: null,
    fecha_nacimiento: null,
    m2_vivienda: null,
    copropiedad_tipo_a: false,
    subsidio_termico_previo_anio: null,
    costo_proyecto_uf: null,
    ahorro_uf: null,
    recepcion_ley_20898: false,
    permiso_excepcion: false,
    requiere_regularizacion: false,
    pisos_ventilados: false,
    techumbre: 'no_aplica',
    factores_extra: {},
    documentos: {},
    observaciones: null,
  };
}

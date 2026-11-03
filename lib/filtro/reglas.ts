// Módulo Filtro DS27 Cap. IV, traído desde la app «Filtro de calificación por grupo».
// Motor de reglas del DS N°27 Capítulo IV (Acondicionamiento Térmico Regular y PDA).
// Las cifras de cada resolución NO están aquí: viven en `llamados.parametros` (Supabase) y se editan
// desde la página «Criterios». Este archivo solo define su forma, los valores iniciales de la
// Res. Ex. N°1048/2026 y cómo se aplican.

export type ZonaTermica = string;
export type TipoProyecto = 'regular' | 'pda';
export const TIPOS_PROYECTO: { valor: TipoProyecto; etiqueta: string }[] = [
  { valor: 'regular', etiqueta: 'Acondicionamiento Térmico Regular' },
  { valor: 'pda', etiqueta: 'Acondicionamiento Térmico PDA' },
];

export type Modalidad = 'grupal' | 'individual';

export type Techumbre = 'no_aplica' | 'sin_asbesto' | 'con_asbesto';
export const TECHUMBRES: { valor: Techumbre; etiqueta: string }[] = [
  { valor: 'no_aplica', etiqueta: 'No aplica' },
  { valor: 'sin_asbesto', etiqueta: 'Sin asbesto' },
  { valor: 'con_asbesto', etiqueta: 'Con asbesto' },
];

/** Tramos de Calificación Socioeconómica del RSH (el % es el tope del tramo). */
export const TRAMOS_RSH = [40, 50, 60, 70, 80, 90, 100];

// ---------- Forma de los parámetros de un llamado ----------

export interface FilaPuntos {
  valor: number;
  puntos: number;
}

export interface MontosZona {
  zona: ZonaTermica;
  base: number;
  vulnerabilidadTramo1: number;
  vulnerabilidadTramo2: number;
  regularizacion: number;
  pisosVentilados: number;
  techoSinAsbesto: number;
  techoConAsbesto: number;
  maximo: number;
}

export type Exigencia = 'siempre' | 'vivienda_social' | 'no_vivienda_social';
export const EXIGENCIAS: { valor: Exigencia; etiqueta: string }[] = [
  { valor: 'siempre', etiqueta: 'Siempre' },
  { valor: 'vivienda_social', etiqueta: 'Solo vivienda social' },
  { valor: 'no_vivienda_social', etiqueta: 'Solo si no es vivienda social' },
];

export interface DocumentoExigido {
  clave: string;
  etiqueta: string;
  exigir: Exigencia;
}

/** Criterio Sí/No adicional que una resolución nueva puede agregar al puntaje. */
export interface FactorExtra {
  clave: string;
  etiqueta: string;
  puntos: number;
}

export interface Parametros {
  anioLlamado: number;
  comunas: string[];
  /** Montos 5.4 por zona térmica. */
  zonas: MontosZona[];
  /** Comunas cuya zona difiere de la habitual (p. ej. Constitución → E). */
  zonaPorComuna: { comuna: string; zona: ZonaTermica }[];
  /** Comunas con Plan de Descontaminación vigente (referencial). */
  comunasPDA: string[];

  // Requisitos (null = no se exige)
  rshMaxIndividual: number | null;
  rshMaxGrupal: number | null;
  rshTramoPrioritario: number;
  porcentajeMinPrioritario: number | null;
  grupoMin: number | null;
  grupoMax: number | null;
  avaluoMaxUF: number | null;
  anioMaxPermiso: number | null;
  antiguedadMinAnios: number | null;
  ahorroAdultoMayorUF: number;
  ahorroGeneralUF: number;
  /** 3.6 d): en zonas PDA se admite un subsidio térmico previo hasta este año. */
  anioMaxSubsidioPrevioPDA: number | null;
  /** 3.6 f): las copropiedades tipo A no son viviendas objeto del llamado. */
  excluirCopropiedadA: boolean;

  // Recursos y servicios
  /** 2: recursos disponibles en la región (UF) por tipo de proyecto. */
  recursosRegionUF: { pda: number; regular: number };
  /** 8.1: asistencia técnica y FTO por beneficiario (UF). */
  asistenciaTecnicaUF: number;
  /** 3.8: sobre este monto de obras por proyecto, la FTO la realiza el SERVIU. */
  montoFTOServiuUF: number | null;

  // Incremento por vulnerabilidad (5.4)
  vulnTramo1RshMax: number;
  vulnTramo2RshMax: number;
  vulnAdultoMayorTramo1: boolean;

  // Puntajes 7.1
  puntosRsh: FilaPuntos[];
  /** Escalones: se usa la fila con mayor `valor` ≤ integrantes. */
  puntosGrupoFamiliar: FilaPuntos[];
  puntosAdultoMayor: number;
  puntosDiscapacidad: FilaPuntos[];
  puntosMonoparental: number;
  puntosPrisionPolitica: number;
  puntosSeguridadOportunidades: number;
  /** puntos = min(máximo, (anioCorte − año recepción) × puntosPorAnio). */
  antiguedad: { anioCorte: number; puntosPorAnio: number; maximo: number };

  // Puntaje 7.2 (solo PDA)
  puntosRecambioMMA: number;

  factoresExtra: FactorExtra[];
  documentos: DocumentoExigido[];
}

// ---------- Valores de la Res. Ex. N°1048 del 14.07.2026 (Maule) ----------

export const PARAMETROS_RES_1048_2026: Parametros = {
  anioLlamado: 2026,
  comunas: [
    'Cauquenes', 'Chanco', 'Colbún', 'Constitución', 'Curepto', 'Curicó', 'Empedrado',
    'Hualañé', 'Licantén', 'Linares', 'Longaví', 'Maule', 'Molina', 'Parral', 'Pelarco',
    'Pelluhue', 'Pencahue', 'Rauco', 'Retiro', 'Río Claro', 'Romeral', 'Sagrada Familia',
    'San Clemente', 'San Javier', 'San Rafael', 'Talca', 'Teno', 'Vichuquén',
    'Villa Alegre', 'Yerbas Buenas',
  ],
  zonas: [
    { zona: 'D', base: 164, vulnerabilidadTramo1: 72, vulnerabilidadTramo2: 51, regularizacion: 38, pisosVentilados: 40, techoSinAsbesto: 24, techoConAsbesto: 48, maximo: 362 },
    { zona: 'E/F', base: 176, vulnerabilidadTramo1: 143, vulnerabilidadTramo2: 101, regularizacion: 38, pisosVentilados: 40, techoSinAsbesto: 24, techoConAsbesto: 48, maximo: 445 },
    { zona: 'G', base: 201, vulnerabilidadTramo1: 156, vulnerabilidadTramo2: 109, regularizacion: 38, pisosVentilados: 40, techoSinAsbesto: 24, techoConAsbesto: 48, maximo: 483 },
    { zona: 'H/I', base: 251, vulnerabilidadTramo1: 143, vulnerabilidadTramo2: 102, regularizacion: 48, pisosVentilados: 40, techoSinAsbesto: 48, techoConAsbesto: 96, maximo: 578 },
  ],
  zonaPorComuna: [
    { comuna: 'Constitución', zona: 'E/F' },
    { comuna: 'Cauquenes', zona: 'E/F' },
  ],
  comunasPDA: ['Talca', 'Maule', 'Curicó', 'Teno', 'Romeral', 'Molina', 'Rauco', 'Sagrada Familia'],

  rshMaxIndividual: 70,
  rshMaxGrupal: 80,
  rshTramoPrioritario: 60,
  porcentajeMinPrioritario: 60,
  grupoMin: 10,
  grupoMax: 70,
  avaluoMaxUF: 1375,
  anioMaxPermiso: 2009,
  antiguedadMinAnios: 5,
  ahorroAdultoMayorUF: 1,
  ahorroGeneralUF: 3,
  anioMaxSubsidioPrevioPDA: 2009,
  excluirCopropiedadA: true,

  recursosRegionUF: { pda: 205816, regular: 88207 },
  asistenciaTecnicaUF: 9,
  montoFTOServiuUF: 11000,

  vulnTramo1RshMax: 60,
  vulnTramo2RshMax: 70,
  vulnAdultoMayorTramo1: true,

  puntosRsh: [
    { valor: 40, puntos: 100 }, { valor: 50, puntos: 75 }, { valor: 60, puntos: 50 },
    { valor: 70, puntos: 35 }, { valor: 80, puntos: 10 },
  ],
  puntosGrupoFamiliar: [
    { valor: 1, puntos: 0 }, { valor: 2, puntos: 10 }, { valor: 3, puntos: 35 },
    { valor: 4, puntos: 50 }, { valor: 5, puntos: 75 }, { valor: 6, puntos: 100 },
  ],
  puntosAdultoMayor: 100,
  puntosDiscapacidad: [{ valor: 0, puntos: 0 }, { valor: 1, puntos: 50 }, { valor: 2, puntos: 100 }],
  puntosMonoparental: 100,
  puntosPrisionPolitica: 100,
  puntosSeguridadOportunidades: 20,
  antiguedad: { anioCorte: 2010, puntosPorAnio: 3, maximo: 100 },

  puntosRecambioMMA: 100,

  factoresExtra: [],
  documentos: [
    { clave: 'ci', etiqueta: 'CI postulante', exigir: 'siempre' },
    { clave: 'titulo_dominio', etiqueta: 'Título de dominio', exigir: 'siempre' },
    { clave: 'antecedentes_propiedad', etiqueta: 'Antecedentes propiedad', exigir: 'siempre' },
    { clave: 'vivienda_social', etiqueta: 'Acredita vivienda social', exigir: 'vivienda_social' },
    { clave: 'avaluo_fiscal', etiqueta: 'Certificado avalúo fiscal', exigir: 'no_vivienda_social' },
    { clave: 'recepcion_final', etiqueta: 'Recepción final DOM', exigir: 'siempre' },
    { clave: 'permiso_edificacion', etiqueta: 'Permiso de edificación', exigir: 'siempre' },
    { clave: 'informe_tecnico', etiqueta: 'Informe Técnico Survey123', exigir: 'siempre' },
    { clave: 'declaracion_jurada', etiqueta: 'Declaración jurada simple', exigir: 'siempre' },
    { clave: 'ahorro', etiqueta: 'Ahorro acreditado', exigir: 'siempre' },
  ],
};

/**
 * Completa con los valores iniciales las claves que falten (p. ej. parámetros guardados antes de
 * que la app agregara un criterio nuevo). No mezcla valores dentro de listas ni tablas.
 */
export function completarParametros(guardados: unknown): Parametros {
  const base = structuredClone(PARAMETROS_RES_1048_2026);
  if (!guardados || typeof guardados !== 'object') return base;
  const g = guardados as Partial<Parametros>;
  return {
    ...base,
    ...Object.fromEntries(Object.entries(g).filter(([k, v]) => k in base && v !== undefined)),
    antiguedad: { ...base.antiguedad, ...(g.antiguedad ?? {}) },
    recursosRegionUF: { ...base.recursosRegionUF, ...(g.recursosRegionUF ?? {}) },
  };
}

// ---------- Aplicación de las reglas ----------

export function puntosExactos(tabla: FilaPuntos[], valor: number | null): number {
  if (valor == null) return 0;
  return tabla.find((f) => f.valor === valor)?.puntos ?? 0;
}

export function puntosEscalon(tabla: FilaPuntos[], valor: number | null): number {
  if (valor == null) return 0;
  const filas = tabla.filter((f) => f.valor <= valor).sort((a, b) => b.valor - a.valor);
  return filas[0]?.puntos ?? 0;
}

export function puntajeAntiguedad(anioRecepcion: number | null, par: Parametros): number {
  if (anioRecepcion == null) return 0;
  const { anioCorte, puntosPorAnio, maximo } = par.antiguedad;
  return Math.max(0, Math.min(maximo, (anioCorte - anioRecepcion) * puntosPorAnio));
}

export function ahorroRequeridoUF(adultoMayor: boolean, par: Parametros): number {
  return adultoMayor ? par.ahorroAdultoMayorUF : par.ahorroGeneralUF;
}

export function montosDeZona(par: Parametros, zona: ZonaTermica): MontosZona | undefined {
  return par.zonas.find((z) => z.zona === zona);
}

export function zonaSugerida(par: Parametros, comuna: string): ZonaTermica | undefined {
  return par.zonaPorComuna.find((z) => z.comuna === comuna)?.zona;
}

/** Cuántos postulantes de un grupo de tamaño n deben estar en el tramo prioritario. */
export function minimoTramoPrioritario(n: number, par: Parametros): number {
  if (par.porcentajeMinPrioritario == null) return 0;
  return Math.ceil((n * par.porcentajeMinPrioritario) / 100 - 1e-9);
}

export function documentosExigidos(par: Parametros, esViviendaSocial: boolean): DocumentoExigido[] {
  return par.documentos.filter(
    (d) =>
      d.exigir === 'siempre' ||
      (d.exigir === 'vivienda_social' && esViviendaSocial) ||
      (d.exigir === 'no_vivienda_social' && !esViviendaSocial),
  );
}

/** 7.1 N°3: adulto mayor = 60 o más años durante el año calendario del llamado. */
export function esAdultoMayorPorFecha(fechaNacimiento: string | null, par: Parametros): boolean | null {
  if (!fechaNacimiento) return null;
  const anio = Number(fechaNacimiento.slice(0, 4));
  return Number.isFinite(anio) && anio > 1800 ? par.anioLlamado - anio >= 60 : null;
}

/** Convierte una etiqueta en una clave estable para guardar en la base de datos. */
export function claveDesde(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export interface DatosCalculo {
  rsh_tramo: number | null;
  integrantes: number | null;
  adulto_mayor: boolean;
  integrantes_discapacidad: number;
  monoparental: boolean;
  prision_politica: boolean;
  seguridad_oportunidades: boolean;
  recambio_calefactor_mma: boolean;
  anio_recepcion: number | null;
  requiere_regularizacion: boolean;
  pisos_ventilados: boolean;
  techumbre: Techumbre;
  factores_extra: Record<string, boolean>;
}

export interface DatosProyecto {
  zona_termica: ZonaTermica;
  tipo_proyecto: TipoProyecto;
}

export interface Calculo {
  pRsh: number;
  pGrupoFamiliar: number;
  pAdultoMayor: number;
  pDiscapacidad: number;
  pMonoparental: number;
  pPrisionPolitica: number;
  pSeguridadOportunidades: number;
  pAntiguedad: number;
  pExtra: number;
  puntaje71: number;
  puntaje72: number;
  puntajeTotal: number;
  ufBase: number;
  ufVulnerabilidad: number;
  ufRegularizacion: number;
  ufPisosVentilados: number;
  ufTechumbre: number;
  subsidioUF: number;
  ahorroUF: number;
  zonaDefinida: boolean;
}

export function montoVulnerabilidad(rsh: number | null, adultoMayor: boolean, m: MontosZona, par: Parametros): number {
  if ((par.vulnAdultoMayorTramo1 && adultoMayor) || (rsh != null && rsh <= par.vulnTramo1RshMax))
    return m.vulnerabilidadTramo1;
  if (rsh != null && rsh <= par.vulnTramo2RshMax) return m.vulnerabilidadTramo2;
  return 0;
}

export function calcular(d: DatosCalculo, proyecto: DatosProyecto, par: Parametros): Calculo {
  const pRsh = puntosExactos(par.puntosRsh, d.rsh_tramo);
  const pGrupoFamiliar = puntosEscalon(par.puntosGrupoFamiliar, d.integrantes);
  const pAdultoMayor = d.adulto_mayor ? par.puntosAdultoMayor : 0;
  const pDiscapacidad = puntosEscalon(par.puntosDiscapacidad, d.integrantes_discapacidad);
  const pMonoparental = d.monoparental ? par.puntosMonoparental : 0;
  const pPrisionPolitica = d.prision_politica ? par.puntosPrisionPolitica : 0;
  const pSeguridadOportunidades = d.seguridad_oportunidades ? par.puntosSeguridadOportunidades : 0;
  const pAntiguedad = puntajeAntiguedad(d.anio_recepcion, par);
  const pExtra = par.factoresExtra.reduce((s, f) => s + (d.factores_extra?.[f.clave] ? f.puntos : 0), 0);
  const puntaje71 =
    pRsh + pGrupoFamiliar + pAdultoMayor + pDiscapacidad + pMonoparental +
    pPrisionPolitica + pSeguridadOportunidades + pAntiguedad + pExtra;
  const puntaje72 = proyecto.tipo_proyecto === 'pda' && d.recambio_calefactor_mma ? par.puntosRecambioMMA : 0;

  const m = montosDeZona(par, proyecto.zona_termica);
  const ufBase = m?.base ?? 0;
  const ufVulnerabilidad = m ? montoVulnerabilidad(d.rsh_tramo, d.adulto_mayor, m, par) : 0;
  const ufRegularizacion = m && d.requiere_regularizacion ? m.regularizacion : 0;
  const ufPisosVentilados = m && d.pisos_ventilados ? m.pisosVentilados : 0;
  const ufTechumbre = !m ? 0 : d.techumbre === 'sin_asbesto' ? m.techoSinAsbesto : d.techumbre === 'con_asbesto' ? m.techoConAsbesto : 0;
  const suma = ufBase + ufVulnerabilidad + ufRegularizacion + ufPisosVentilados + ufTechumbre;

  return {
    pRsh, pGrupoFamiliar, pAdultoMayor, pDiscapacidad, pMonoparental, pPrisionPolitica,
    pSeguridadOportunidades, pAntiguedad, pExtra, puntaje71, puntaje72, puntajeTotal: puntaje71 + puntaje72,
    ufBase, ufVulnerabilidad, ufRegularizacion, ufPisosVentilados, ufTechumbre,
    subsidioUF: m && m.maximo > 0 ? Math.min(m.maximo, suma) : suma,
    ahorroUF: ahorroRequeridoUF(d.adulto_mayor, par),
    zonaDefinida: !!m,
  };
}

/** 7.4: puntaje grupal = suma de puntajes individuales / N° total de postulantes del grupo. */
export function puntajeGrupal(puntajes: number[]): number {
  if (puntajes.length === 0) return 0;
  return puntajes.reduce((a, b) => a + b, 0) / puntajes.length;
}

// Módulo Filtro DS27 Cap. IV, traído desde la app «Filtro de calificación por grupo».
import {
  calcular, completarParametros, documentosExigidos, esAdultoMayorPorFecha, minimoTramoPrioritario, puntajeGrupal,
  zonaSugerida, type Calculo, type Parametros,
} from './reglas';
import { limpiarRut, rutValido } from './rut';
import type { Grupo, Llamado, Postulante } from './tipos';

export type Severidad = 'bloqueante' | 'pendiente' | 'observacion';
export interface Hallazgo {
  severidad: Severidad;
  mensaje: string;
}

export const ESTADOS = ['Listo', 'Observado', 'Incompleto', 'No admisible'] as const;
export type Estado = (typeof ESTADOS)[number];

export interface Evaluado extends Postulante {
  grupo: Grupo;
  parametros: Parametros;
  calculo: Calculo;
  hallazgos: Hallazgo[];
  estado: Estado;
  documentosFaltantes: string[];
  /** 5.6: diferencia entre el costo del proyecto y el subsidio, que la familia debe aportar. */
  aporteAdicionalUF: number;
}

const fmtUF = (n: number) => n.toLocaleString('es-CL');

function estadoDesde(hallazgos: Hallazgo[]): Estado {
  if (hallazgos.some((h) => h.severidad === 'bloqueante')) return 'No admisible';
  if (hallazgos.some((h) => h.severidad === 'pendiente')) return 'Incompleto';
  if (hallazgos.length > 0) return 'Observado';
  return 'Listo';
}

export function esTramoPrioritario(p: Pick<Postulante, 'rsh_tramo'>, par: Parametros): boolean {
  return p.rsh_tramo != null && p.rsh_tramo <= par.rshTramoPrioritario;
}

function revisarPostulante(p: Postulante, grupo: Grupo, par: Parametros, calculo: Calculo, repetidoEn: string[]): Hallazgo[] {
  const h: Hallazgo[] = [];
  const bloquea = (mensaje: string) => h.push({ severidad: 'bloqueante', mensaje });
  const falta = (mensaje: string) => h.push({ severidad: 'pendiente', mensaje });
  const observa = (mensaje: string) => h.push({ severidad: 'observacion', mensaje });

  if (!p.rut.trim()) bloquea('Sin RUT');
  else if (!rutValido(p.rut)) bloquea('RUT inválido (dígito verificador)');
  if (repetidoEn.length > 0) bloquea(`RUT repetido en: ${repetidoEn.join(', ')}`);

  if (!calculo.zonaDefinida) bloquea(`La zona térmica «${grupo.zona_termica}» no está definida en los criterios del llamado`);

  const rshMax = grupo.modalidad === 'grupal' ? par.rshMaxGrupal : par.rshMaxIndividual;
  if (p.rsh_tramo == null) falta('Falta tramo RSH');
  else if (rshMax != null && p.rsh_tramo > rshMax)
    bloquea(`RSH ${p.rsh_tramo}% supera el máximo para postulación ${grupo.modalidad} (${rshMax}%)`);
  else if (calculo.ufVulnerabilidad === 0 && calculo.zonaDefinida) observa('Sin incremento por vulnerabilidad (por tramo RSH)');

  if (p.integrantes == null) falta('Falta tamaño del grupo familiar');

  const amPorFecha = esAdultoMayorPorFecha(p.fecha_nacimiento, par);
  if (amPorFecha != null && amPorFecha !== p.adulto_mayor)
    observa(`Fecha de nacimiento indica que ${amPorFecha ? 'sí' : 'no'} es adulto mayor en ${par.anioLlamado}, pero está marcado al revés`);

  if (par.excluirCopropiedadA && p.copropiedad_tipo_a) bloquea('Copropiedad tipo A: no es vivienda objeto del llamado (3.6 f)');

  const anioMaxRecepcion = par.antiguedadMinAnios != null ? par.anioLlamado - par.antiguedadMinAnios : null;
  if (p.anio_recepcion == null) falta('Falta año de recepción final');
  else if (anioMaxRecepcion != null && p.anio_recepcion > anioMaxRecepcion && !p.recepcion_ley_20898)
    observa(`Recepción final ${p.anio_recepcion}: menos de ${par.antiguedadMinAnios} años de antigüedad. Verificar excepción (p. ej. Ley 20.898)`);

  if (par.anioMaxPermiso != null && p.anio_permiso != null && p.anio_permiso > par.anioMaxPermiso && !p.permiso_excepcion)
    observa(`Permiso de edificación ${p.anio_permiso}: posterior a ${par.anioMaxPermiso}. Requiere acreditar excepción`);

  if (p.subsidio_termico_previo_anio != null) {
    if (grupo.tipo_proyecto === 'pda' && par.anioMaxSubsidioPrevioPDA != null) {
      if (p.subsidio_termico_previo_anio > par.anioMaxSubsidioPrevioPDA)
        observa(`Subsidio térmico previo ${p.subsidio_termico_previo_anio}: en zona PDA solo se admite hasta ${par.anioMaxSubsidioPrevioPDA} (3.6 d)`);
    } else observa(`Tiene subsidio térmico previo (${p.subsidio_termico_previo_anio}): verificar impedimentos del D.S. 27`);
  }

  if (p.ahorro_uf != null && p.ahorro_uf < calculo.ahorroUF)
    falta(`Ahorro acreditado ${fmtUF(p.ahorro_uf)} UF, se exigen ${fmtUF(calculo.ahorroUF)} UF`);

  if (p.costo_proyecto_uf != null && p.costo_proyecto_uf > calculo.subsidioUF)
    observa(`Costo sobre el subsidio: requiere aporte adicional de ${fmtUF(Math.round((p.costo_proyecto_uf - calculo.subsidioUF) * 100) / 100)} UF (5.6)`);

  if (par.avaluoMaxUF != null && !p.es_vivienda_social) {
    if (p.avaluo_fiscal_uf == null) falta('Falta avalúo fiscal (no es vivienda social)');
    else if (p.avaluo_fiscal_uf > par.avaluoMaxUF)
      bloquea(`Avalúo fiscal ${fmtUF(p.avaluo_fiscal_uf)} UF supera ${fmtUF(par.avaluoMaxUF)} UF`);
  }

  return h;
}

/** Evalúa a todos los postulantes de una vez para detectar RUT repetidos dentro de un mismo llamado. */
export function evaluarTodos(postulantes: Postulante[], grupos: Grupo[], llamados: Llamado[]): Evaluado[] {
  const gruposPorId = new Map(grupos.map((g) => [g.id, g]));
  const parametrosPorLlamado = new Map(llamados.map((l) => [l.id, completarParametros(l.parametros)]));
  const porRut = new Map<string, Postulante[]>();
  for (const p of postulantes) {
    const g = gruposPorId.get(p.grupo_id);
    const clave = limpiarRut(p.rut);
    if (!g || !clave) continue;
    const k = `${g.llamado_id}|${clave}`;
    porRut.set(k, [...(porRut.get(k) ?? []), p]);
  }

  const evaluados: Evaluado[] = [];
  for (const p of postulantes) {
    const grupo = gruposPorId.get(p.grupo_id);
    const par = grupo && parametrosPorLlamado.get(grupo.llamado_id);
    if (!grupo || !par) continue;
    const repetidoEn = (porRut.get(`${grupo.llamado_id}|${limpiarRut(p.rut)}`) ?? [])
      .filter((o) => o.id !== p.id)
      .map((o) => gruposPorId.get(o.grupo_id)?.nombre ?? '¿?');
    const calculo = calcular(p, grupo, par);
    const hallazgos = revisarPostulante(p, grupo, par, calculo, repetidoEn);

    const documentosFaltantes = documentosExigidos(par, p.es_vivienda_social)
      .filter((d) => !p.documentos?.[d.clave])
      .map((d) => d.etiqueta);
    if (documentosFaltantes.length > 0)
      hallazgos.push({ severidad: 'pendiente', mensaje: `Faltan documentos: ${documentosFaltantes.join(', ')}` });

    evaluados.push({
      ...p, grupo, parametros: par, calculo, hallazgos, estado: estadoDesde(hallazgos), documentosFaltantes,
      aporteAdicionalUF: p.costo_proyecto_uf != null ? Math.max(0, p.costo_proyecto_uf - calculo.subsidioUF) : 0,
    });
  }
  return evaluados;
}

export interface RequisitoGrupo {
  cumple: boolean;
  texto: string;
}

export interface ResumenGrupo {
  grupo: Grupo;
  total: number;
  incluidos: number;
  porEstado: Record<Estado, number>;
  tramoPrioritario: number;
  minimoTramoPrioritario: number;
  /** Puntaje grupal (suma / N° de postulantes) sobre los incluidos. */
  puntajeGrupal: number;
  subsidioTotalUF: number;
  /** 8.1: asistencia técnica y FTO del grupo. */
  asistenciaTecnicaUF: number;
  aporteAdicionalUF: number;
  /** Requisitos del grupo (localidad, representación, tamaño y tramos). */
  requisitos: RequisitoGrupo[];
  cumpleRequisitos: boolean;
  /** Cumple requisitos de grupo y ningún incluido está incompleto o no admisible. */
  listoParaPostular: boolean;
  alertas: string[];
}

export function resumirGrupo(grupo: Grupo, evaluados: Evaluado[], par: Parametros): ResumenGrupo {
  const delGrupo = evaluados.filter((e) => e.grupo_id === grupo.id);
  const incluidos = delGrupo.filter((e) => e.incluido);
  const n = incluidos.length;
  const porEstado = Object.fromEntries(ESTADOS.map((s) => [s, 0])) as Record<Estado, number>;
  for (const e of incluidos) porEstado[e.estado]++;

  const tramoPrioritario = incluidos.filter((e) => esTramoPrioritario(e, par)).length;
  const minimo = minimoTramoPrioritario(n, par);
  const requisitos: RequisitoGrupo[] = [
    {
      cumple: grupo.localidad_mas_5000,
      texto: `Localidad urbana de más de 5.000 habitantes verificada${grupo.localidad ? ` (${grupo.localidad})` : ''}`,
    },
  ];
  if (grupo.modalidad === 'grupal') {
    requisitos.push({
      cumple: grupo.representacion != null && grupo.personalidad_juridica_vigente,
      texto: `Representado por ${grupo.representacion === 'organizacion_funcional' ? 'organización funcional' : grupo.representacion === 'junta_vecinos' ? 'junta de vecinos' : 'junta de vecinos u organización funcional'} con personalidad jurídica vigente (3.13)`,
    });
    if (par.grupoMin != null || par.grupoMax != null) {
      const min = par.grupoMin ?? 1;
      const max = par.grupoMax ?? Infinity;
      requisitos.push({
        cumple: n >= min && n <= max,
        texto: par.grupoMax != null ? `Entre ${min} y ${par.grupoMax} postulantes: ${n}` : `Al menos ${min} postulantes: ${n}`,
      });
    }
    if (par.porcentajeMinPrioritario != null)
      requisitos.push({
        cumple: n > 0 && tramoPrioritario >= minimo,
        texto: `Al menos ${par.porcentajeMinPrioritario}% en tramo RSH ≤${par.rshTramoPrioritario}%: ${tramoPrioritario} de ${minimo} necesarios`,
      });
    if (par.rshMaxGrupal != null)
      requisitos.push({
        cumple: incluidos.every((e) => e.rsh_tramo == null || e.rsh_tramo <= par.rshMaxGrupal!),
        texto: `Ningún postulante sobre tramo ${par.rshMaxGrupal}% RSH`,
      });
  }
  const cumpleRequisitos = requisitos.every((r) => r.cumple);

  const alertas: string[] = [];
  const zona = zonaSugerida(par, grupo.comuna);
  if (zona && zona !== grupo.zona_termica) alertas.push(`${grupo.comuna} corresponde a la Zona Térmica ${zona} según los criterios del llamado`);
  if (grupo.tipo_proyecto === 'pda' && !par.comunasPDA.includes(grupo.comuna))
    alertas.push(`${grupo.comuna} no figura entre las comunas con PDA: verificar en el visor MINVU`);
  if (grupo.tipo_proyecto === 'regular' && par.comunasPDA.includes(grupo.comuna))
    alertas.push(`${grupo.comuna} tiene PDA vigente: el proyecto regular no aplica en zonas con PDA`);
  const subsidioTotalUF = incluidos.reduce((s, e) => s + e.calculo.subsidioUF, 0);
  if (par.montoFTOServiuUF != null && subsidioTotalUF > par.montoFTOServiuUF)
    alertas.push(`Monto del proyecto sobre ${fmtUF(par.montoFTOServiuUF)} UF: la fiscalización técnica (FTO) la realiza el SERVIU (3.8)`);

  return {
    grupo,
    total: delGrupo.length,
    incluidos: n,
    porEstado,
    tramoPrioritario,
    minimoTramoPrioritario: minimo,
    puntajeGrupal: puntajeGrupal(incluidos.map((e) => e.calculo.puntajeTotal)),
    subsidioTotalUF,
    asistenciaTecnicaUF: n * par.asistenciaTecnicaUF,
    aporteAdicionalUF: incluidos.reduce((s, e) => s + e.aporteAdicionalUF, 0),
    requisitos,
    cumpleRequisitos,
    listoParaPostular: n > 0 && cumpleRequisitos && porEstado['No admisible'] === 0 && porEstado['Incompleto'] === 0,
    alertas,
  };
}

// ---------- Promedios por ítem ----------

export interface PromedioItem {
  item: string;
  promedio: number;
  maximo: number;
  /** Postulantes que obtienen puntaje en el ítem. */
  conPuntaje: number;
}

const maxTabla = (filas: { puntos: number }[]) => Math.max(0, ...filas.map((f) => f.puntos));
const promedio = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0);

/** Promedio de cada variable de puntaje en un conjunto de postulantes (p. ej. los incluidos de un grupo). */
export function promediosPorItem(lista: Evaluado[], par: Parametros, esPDA: boolean): PromedioItem[] {
  const item = (nombre: string, valor: (e: Evaluado) => number, maximo: number): PromedioItem => ({
    item: nombre,
    promedio: promedio(lista.map(valor)),
    maximo,
    conPuntaje: lista.filter((e) => valor(e) > 0).length,
  });
  const items = [
    item('RSH', (e) => e.calculo.pRsh, maxTabla(par.puntosRsh)),
    item('Tamaño grupo familiar', (e) => e.calculo.pGrupoFamiliar, maxTabla(par.puntosGrupoFamiliar)),
    item('Adulto mayor', (e) => e.calculo.pAdultoMayor, par.puntosAdultoMayor),
    item('Discapacidad', (e) => e.calculo.pDiscapacidad, maxTabla(par.puntosDiscapacidad)),
    item('Familia monoparental', (e) => e.calculo.pMonoparental, par.puntosMonoparental),
    item('Prisión política y tortura', (e) => e.calculo.pPrisionPolitica, par.puntosPrisionPolitica),
    item('Seguridad y Oportunidades', (e) => e.calculo.pSeguridadOportunidades, par.puntosSeguridadOportunidades),
    item('Antigüedad vivienda', (e) => e.calculo.pAntiguedad, par.antiguedad.maximo),
    ...par.factoresExtra.map((f) => item(f.etiqueta, (e) => (e.factores_extra?.[f.clave] ? f.puntos : 0), f.puntos)),
  ];
  if (esPDA) items.push(item('7.2 Recambio calefactor MMA', (e) => e.calculo.puntaje72, par.puntosRecambioMMA));
  items.push(item('PUNTAJE TOTAL', (e) => e.calculo.puntajeTotal, items.reduce((s, i) => s + i.maximo, 0)));
  return items;
}

export interface PromediosDatos {
  rsh: number | null;
  integrantes: number | null;
  anioRecepcion: number | null;
  m2: number | null;
  subsidioUF: number;
  pctAdultoMayor: number;
  pctViviendaSocial: number;
}

const promedioNoNulo = (valores: (number | null)[]) => {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? promedio(v) : null;
};

export function promediosDatos(lista: Evaluado[]): PromediosDatos {
  const pct = (f: (e: Evaluado) => boolean) => (lista.length ? (lista.filter(f).length / lista.length) * 100 : 0);
  return {
    rsh: promedioNoNulo(lista.map((e) => e.rsh_tramo)),
    integrantes: promedioNoNulo(lista.map((e) => e.integrantes)),
    anioRecepcion: promedioNoNulo(lista.map((e) => e.anio_recepcion)),
    m2: promedioNoNulo(lista.map((e) => e.m2_vivienda)),
    subsidioUF: promedio(lista.map((e) => e.calculo.subsidioUF)),
    pctAdultoMayor: pct((e) => e.adulto_mayor),
    pctViviendaSocial: pct((e) => e.es_vivienda_social),
  };
}

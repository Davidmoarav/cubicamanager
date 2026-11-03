// Módulo Filtro DS27 Cap. IV, traído desde la app «Filtro de calificación por grupo».
// SheetJS se carga solo al importar/exportar para no engordar la carga inicial.
const cargarXLSX = () => import('xlsx');
import { promediosPorItem, type Evaluado } from './evaluacion';
import { TRAMOS_RSH, type Parametros, type Techumbre } from './reglas';
import { formatearRut } from './rut';
import { postulanteVacio, type PostulanteNuevo } from './tipos';
import { guardarExcel } from '../nativo';

// ---------- Importación ----------

function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

type Campo =
  | 'nombre' | 'rut' | 'direccion' | 'telefono' | 'zona' | 'pda' | 'rsh' | 'integrantes'
  | 'adulto_mayor' | 'discapacidad' | 'monoparental' | 'prision_politica' | 'seguridad'
  | 'recambio' | 'anio_recepcion' | 'anio_permiso' | 'regularizacion' | 'pisos' | 'techumbre'
  | 'avaluo_uf' | 'observaciones' | 'fecha_nacimiento' | 'm2' | 'copropiedad_a' | 'subsidio_previo'
  | 'costo_uf' | 'ahorro_uf' | `doc:${string}` | `extra:${string}`;

// Encabezados aceptados (normalizados). Coinciden con la "Matriz DS27 Capítulo IV Maule 2026".
// Además se reconoce cualquier columna con el nombre de un documento o factor adicional del llamado.
const ENCABEZADOS: Record<string, Campo> = {
  nombrebeneficiario: 'nombre', nombre: 'nombre', nombrepostulante: 'nombre',
  rut: 'rut',
  direccion: 'direccion',
  telefono: 'telefono',
  zonatermica: 'zona',
  proyectopda: 'pda',
  rsh: 'rsh', tramorsh: 'rsh',
  tamanogrupofamiliar: 'integrantes', integrantes: 'integrantes',
  adultomayor60: 'adulto_mayor', adultomayor: 'adulto_mayor',
  discapacidadgrupofamiliar: 'discapacidad',
  familiamonoparental: 'monoparental',
  victimaprisionpoliticatortura: 'prision_politica',
  perteneceaseguridadyoportunidades: 'seguridad',
  beneficiadorecambiocalefactoresmma: 'recambio',
  anorecepcionobraoriginal: 'anio_recepcion', anorecepcion: 'anio_recepcion',
  anopermisoedificacion: 'anio_permiso', anopermiso: 'anio_permiso',
  regularizacionnecesaria: 'regularizacion',
  pisosventilados: 'pisos',
  cambiotechumbre: 'techumbre',
  avaluofiscaluf: 'avaluo_uf',
  fechanacimiento: 'fecha_nacimiento', fechadenacimiento: 'fecha_nacimiento',
  m2: 'm2', m2vivienda: 'm2', metroscuadrados: 'm2', superficiem2: 'm2', superficie: 'm2',
  copropiedadtipoa: 'copropiedad_a',
  anosubsidiotermicoprevio: 'subsidio_previo', subsidiotermicoprevio: 'subsidio_previo',
  costoproyectouf: 'costo_uf', costouf: 'costo_uf', costototaluf: 'costo_uf',
  ahorrouf: 'ahorro_uf', ahorroacreditadouf: 'ahorro_uf',
  observaciones: 'observaciones',
  cipostulante: 'doc:ci',
  avaluofiscal: 'doc:avaluo_fiscal',
  antecedentespropiedad: 'doc:antecedentes_propiedad',
  viviendasocial: 'doc:vivienda_social',
  titulodominio: 'doc:titulo_dominio',
};

function encabezadosDelLlamado(par: Parametros): Record<string, Campo> {
  const propios: Record<string, Campo> = {};
  for (const d of par.documentos) propios[normalizar(d.etiqueta)] = `doc:${d.clave}`;
  for (const f of par.factoresExtra) propios[normalizar(f.etiqueta)] = `extra:${f.clave}`;
  return { ...propios, ...ENCABEZADOS };
}

export interface FilaImportada {
  fila: number;
  datos: PostulanteNuevo;
  avisos: string[];
}

export interface ResultadoImportacion {
  hoja: string;
  filas: FilaImportada[];
  columnasReconocidas: string[];
  /** Zona y PDA declarados en el archivo (para comparar con el grupo). */
  zonasEnArchivo: string[];
  pdaEnArchivo: boolean;
}

function siNo(v: unknown): boolean {
  const n = normalizar(v);
  return ['si', 's', 'x', 'true', '1', 'ok'].includes(n);
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function integrantes(v: unknown, avisos: string[]): number | null {
  const n = normalizar(v);
  if (!n) return null;
  if (n.includes('unipersonal')) return 1;
  const valor = numero(v);
  if (valor == null) return null;
  if (valor <= 0) {
    avisos.push(`Tamaño grupo familiar "${v}" → se registra como unipersonal (1). Verificar.`);
    return 1;
  }
  return Math.round(valor);
}

function discapacidad(v: unknown): number {
  const n = normalizar(v);
  if (!n || n === 'ninguna' || n === 'no') return 0;
  if (n.startsWith('2omas')) return 2;
  return Math.max(0, Math.round(numero(v) ?? (siNo(v) ? 1 : 0)));
}

function tramoRsh(v: unknown, avisos: string[]): number | null {
  let valor = numero(v);
  if (valor == null) return null;
  if (valor > 0 && valor <= 1) valor = valor * 100;
  const tramo = TRAMOS_RSH.find((t) => valor! <= t) ?? 100;
  if (tramo !== valor) avisos.push(`RSH "${v}" → tramo ${tramo}%`);
  return tramo;
}

function techumbre(v: unknown): Techumbre {
  const n = normalizar(v);
  if (n.includes('sinasbesto')) return 'sin_asbesto';
  if (n.includes('conasbesto')) return 'con_asbesto';
  return 'no_aplica';
}

/** Devuelve la fecha como AAAA-MM-DD (acepta fechas de Excel y textos dd-mm-aaaa o aaaa-mm-dd). */
function fecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const t = String(v ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function anio(v: unknown): number | null {
  if (v instanceof Date) return v.getFullYear();
  const n = numero(v);
  return n != null && n >= 1800 && n <= 2100 ? Math.round(n) : null;
}

export async function leerExcel(archivo: ArrayBuffer, grupoId: string, par: Parametros): Promise<ResultadoImportacion> {
  const encabezados = encabezadosDelLlamado(par);
  const XLSX = await cargarXLSX();
  const libro = XLSX.read(archivo, { cellDates: true });
  for (const hoja of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja], { header: 1, defval: null });
    const iEncabezado = filas.slice(0, 15).findIndex((f) => f?.some((c) => normalizar(c) === 'rut'));
    if (iEncabezado < 0) continue;

    const columnas = new Map<number, Campo>();
    filas[iEncabezado].forEach((c, i) => {
      const campo = encabezados[normalizar(c)];
      if (campo && ![...columnas.values()].includes(campo)) columnas.set(i, campo);
    });

    const zonas = new Set<string>();
    let pda = false;
    const resultado: FilaImportada[] = [];
    filas.slice(iEncabezado + 1).forEach((fila, i) => {
      const v: Partial<Record<Campo, unknown>> = {};
      columnas.forEach((campo, col) => (v[campo] = fila?.[col]));
      if (!v.nombre && !v.rut) return;

      const avisos: string[] = [];
      const d = postulanteVacio(grupoId);
      d.nombre = String(v.nombre ?? '').trim();
      d.rut = formatearRut(String(v.rut ?? ''));
      d.direccion = v.direccion ? String(v.direccion).trim() : null;
      d.telefono = v.telefono ? String(v.telefono).trim() : null;
      d.rsh_tramo = tramoRsh(v.rsh, avisos);
      d.integrantes = integrantes(v.integrantes, avisos);
      d.adulto_mayor = siNo(v.adulto_mayor);
      d.integrantes_discapacidad = discapacidad(v.discapacidad);
      d.monoparental = siNo(v.monoparental);
      d.prision_politica = siNo(v.prision_politica);
      d.seguridad_oportunidades = siNo(v.seguridad);
      d.recambio_calefactor_mma = siNo(v.recambio);
      d.anio_recepcion = anio(v.anio_recepcion);
      d.anio_permiso = anio(v.anio_permiso);
      d.requiere_regularizacion = siNo(v.regularizacion);
      d.pisos_ventilados = siNo(v.pisos);
      d.techumbre = techumbre(v.techumbre);
      d.avaluo_fiscal_uf = numero(v.avaluo_uf);
      d.fecha_nacimiento = fecha(v.fecha_nacimiento);
      d.m2_vivienda = numero(v.m2);
      d.copropiedad_tipo_a = siNo(v.copropiedad_a);
      d.subsidio_termico_previo_anio = anio(v.subsidio_previo);
      d.costo_proyecto_uf = numero(v.costo_uf);
      d.ahorro_uf = numero(v.ahorro_uf);
      d.observaciones = v.observaciones ? String(v.observaciones).trim() : null;
      columnas.forEach((campo) => {
        if (campo.startsWith('doc:') && siNo(v[campo])) d.documentos[campo.slice(4)] = true;
        if (campo.startsWith('extra:') && siNo(v[campo])) d.factores_extra[campo.slice(6)] = true;
      });
      d.es_vivienda_social = !!d.documentos.vivienda_social;

      if (v.zona) zonas.add(String(v.zona).trim());
      if (siNo(v.pda)) pda = true;
      resultado.push({ fila: iEncabezado + i + 2, datos: d, avisos });
    });

    return {
      hoja,
      filas: resultado,
      columnasReconocidas: [...columnas.keys()].map((i) => String(filas[iEncabezado][i])),
      zonasEnArchivo: [...zonas],
      pdaEnArchivo: pda,
    };
  }
  throw new Error('No se encontró una hoja con una columna "RUT" en las primeras 15 filas.');
}

// ---------- Exportación ----------

const siNoTexto = (b: boolean) => (b ? 'Sí' : 'No');

export async function exportarExcel(evaluados: Evaluado[], nombreArchivo: string) {
  const XLSX = await cargarXLSX();
  const filas = evaluados.map((e) => ({
    Grupo: e.grupo.nombre,
    Comuna: e.grupo.comuna,
    'Zona térmica': e.grupo.zona_termica,
    Tipo: e.grupo.tipo_proyecto === 'pda' ? 'PDA' : 'Regular',
    Incluido: siNoTexto(e.incluido),
    Estado: e.estado,
    Nombre: e.nombre,
    RUT: e.rut,
    Dirección: e.direccion ?? '',
    Teléfono: e.telefono ?? '',
    '% RSH': e.rsh_tramo ?? '',
    'Integrantes': e.integrantes ?? '',
    'Adulto mayor': siNoTexto(e.adulto_mayor),
    'Integrantes c/discapacidad': e.integrantes_discapacidad,
    Monoparental: siNoTexto(e.monoparental),
    'Prisión política/tortura': siNoTexto(e.prision_politica),
    'Seguridad y Oportunidades': siNoTexto(e.seguridad_oportunidades),
    'Recambio calefactor MMA': siNoTexto(e.recambio_calefactor_mma),
    'Año recepción': e.anio_recepcion ?? '',
    'Año permiso': e.anio_permiso ?? '',
    'Vivienda social': siNoTexto(e.es_vivienda_social),
    'Avalúo fiscal UF': e.avaluo_fiscal_uf ?? '',
    'Fecha nacimiento': e.fecha_nacimiento ?? '',
    'M2 vivienda': e.m2_vivienda ?? '',
    'Copropiedad tipo A': siNoTexto(e.copropiedad_tipo_a),
    'Año subsidio térmico previo': e.subsidio_termico_previo_anio ?? '',
    'Ahorro acreditado UF': e.ahorro_uf ?? '',
    'Costo proyecto UF': e.costo_proyecto_uf ?? '',
    'Aporte adicional UF': e.aporteAdicionalUF || '',
    'Pts RSH': e.calculo.pRsh,
    'Pts grupo familiar': e.calculo.pGrupoFamiliar,
    'Pts adulto mayor': e.calculo.pAdultoMayor,
    'Pts discapacidad': e.calculo.pDiscapacidad,
    'Pts monoparental': e.calculo.pMonoparental,
    'Pts prisión política': e.calculo.pPrisionPolitica,
    'Pts Seg. y Oport.': e.calculo.pSeguridadOportunidades,
    'Pts antigüedad': e.calculo.pAntiguedad,
    'Pts factores adicionales': e.calculo.pExtra,
    'Puntaje 7.1': e.calculo.puntaje71,
    'Puntaje 7.2': e.calculo.puntaje72,
    'PUNTAJE TOTAL': e.calculo.puntajeTotal,
    'Base UF': e.calculo.ufBase,
    'Vulnerabilidad UF': e.calculo.ufVulnerabilidad,
    'Regularización UF': e.calculo.ufRegularizacion,
    'Pisos ventilados UF': e.calculo.ufPisosVentilados,
    'Techumbre UF': e.calculo.ufTechumbre,
    'SUBSIDIO UF': e.calculo.subsidioUF,
    'Ahorro exigido UF': e.calculo.ahorroUF,
    'Documentos faltantes': e.documentosFaltantes.join(', '),
    Hallazgos: e.hallazgos.map((h) => h.mensaje).join(' | '),
    Observaciones: e.observaciones ?? '',
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Postulantes');

  // Promedios por ítem de los incluidos de cada grupo.
  const porGrupo = new Map<string, Evaluado[]>();
  for (const e of evaluados) if (e.incluido) porGrupo.set(e.grupo_id, [...(porGrupo.get(e.grupo_id) ?? []), e]);
  const promedios = [...porGrupo.values()].map((lista) => {
    const g = lista[0].grupo;
    const items = promediosPorItem(lista, lista[0].parametros, g.tipo_proyecto === 'pda');
    return {
      Grupo: g.nombre,
      'Incluidos': lista.length,
      ...Object.fromEntries(items.map((i) => [`${i.item} (máx. ${i.maximo})`, Math.round(i.promedio * 10) / 10])),
    };
  });
  if (promedios.length > 0) XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(promedios), 'Promedios por ítem');
  await guardarExcel(XLSX, libro, nombreArchivo);
}

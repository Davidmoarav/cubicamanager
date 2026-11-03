// Módulo Filtro DS27 Cap. IV: pasar un grupo terminado a una obra de Cubica Manager.
// La obra queda en UF y cada vivienda incluida es una partida, para llevar el avance casa por casa.
import type { Evaluado } from './evaluacion';
import { TIPOS_PROYECTO } from './reglas';
import type { Grupo, Llamado } from './tipos';

const IVA = 0.19;

export interface ViviendaObra {
  postulante_id: string;
  descripcion: string;
  /** Monto de obra de la vivienda: el costo del proyecto si está cargado; si no, el subsidio. */
  montoUF: number;
}

export interface ObraDesdeGrupo {
  viviendas: ViviendaObra[];
  totalUF: number;
  subsidioUF: number;
  asistenciaTecnicaUF: number;
  descripcion: string;
}

const redondearUF = (n: number) => Math.round(n * 100) / 100;
const fmtUF = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function obraDesdeGrupo(grupo: Grupo, llamado: Llamado, evaluados: Evaluado[]): ObraDesdeGrupo {
  const incluidos = evaluados
    .filter((e) => e.grupo_id === grupo.id && e.incluido)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const viviendas = incluidos.map((e) => ({
    postulante_id: e.id,
    descripcion: [`Vivienda ${e.nombre}`, e.direccion?.trim()].filter(Boolean).join(' – '),
    montoUF: redondearUF(e.costo_proyecto_uf ?? e.calculo.subsidioUF),
  }));
  const totalUF = redondearUF(viviendas.reduce((s, v) => s + v.montoUF, 0));
  const subsidioUF = redondearUF(incluidos.reduce((s, e) => s + e.calculo.subsidioUF, 0));
  const asistenciaTecnicaUF = redondearUF(incluidos.length * (llamado.parametros.asistenciaTecnicaUF ?? 0));

  const tipo = TIPOS_PROYECTO.find((t) => t.valor === grupo.tipo_proyecto)?.etiqueta ?? 'Acondicionamiento Térmico';
  const descripcion = [
    `DS27 Cap. IV · ${tipo}. Grupo ${grupo.nombre}${grupo.codigo ? ` (código ${grupo.codigo})` : ''}, ${grupo.comuna}, zona térmica ${grupo.zona_termica}.`,
    `Llamado: ${llamado.nombre}${llamado.resolucion ? ` · ${llamado.resolucion}` : ''}.`,
    `${viviendas.length} viviendas. Subsidio ${fmtUF(subsidioUF)} UF; obra ${fmtUF(totalUF)} UF.`,
    `Asistencia técnica ${fmtUF(asistenciaTecnicaUF)} UF, fuera del valor de la obra.`,
    grupo.organizacion ? `Organización: ${grupo.organizacion}.` : '',
  ].filter(Boolean).join('\n');

  return { viviendas, totalUF, subsidioUF, asistenciaTecnicaUF, descripcion };
}

/** Precio neto en pesos de una vivienda (las partidas de Cubica van netas; el valor de la obra, con IVA). */
export function netoPesos(montoUF: number, valorUF: number): number {
  return Math.round((montoUF * valorUF) / (1 + IVA));
}

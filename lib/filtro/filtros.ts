// Módulo Filtro DS27 Cap. IV: filtros de la lista de postulantes (función pura, sin pantalla).
import type { Evaluado } from './evaluacion';
import { limpiarRut } from './rut';

export const CLAVES = [
  'q', 'grupo', 'comuna', 'estado', 'incl', 'docs',
  'rshDesde', 'rshHasta', 'ptsDesde', 'ptsHasta', 'intDesde', 'intHasta', 'anioDesde', 'anioHasta', 'ufDesde', 'ufHasta',
  'am', 'disc', 'mono', 'pris', 'sego', 'mma', 'vs',
] as const;
export type Filtros = Record<(typeof CLAVES)[number], string>;

function enRango(valor: number | null, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  if (valor == null) return false;
  return (!desde || valor >= Number(desde)) && (!hasta || valor <= Number(hasta));
}

const siNo = (filtro: string, valor: boolean) => !filtro || valor === (filtro === 'si');

export function filtrar(evaluados: Evaluado[], f: Filtros): Evaluado[] {
  const q = f.q.trim().toLowerCase();
  const qRut = limpiarRut(f.q);
  return evaluados.filter(
    (e) =>
      (!q || e.nombre.toLowerCase().includes(q) || (qRut.length >= 3 && limpiarRut(e.rut).includes(qRut))) &&
      (!f.grupo || e.grupo_id === f.grupo) &&
      (!f.comuna || e.grupo.comuna === f.comuna) &&
      (!f.estado || e.estado === f.estado) &&
      siNo(f.incl, e.incluido) &&
      (!f.docs || (f.docs === 'faltan' ? e.documentosFaltantes.length > 0 : e.documentosFaltantes.length === 0)) &&
      enRango(e.rsh_tramo, f.rshDesde, f.rshHasta) &&
      enRango(e.calculo.puntajeTotal, f.ptsDesde, f.ptsHasta) &&
      enRango(e.integrantes, f.intDesde, f.intHasta) &&
      enRango(e.anio_recepcion, f.anioDesde, f.anioHasta) &&
      enRango(e.calculo.subsidioUF, f.ufDesde, f.ufHasta) &&
      siNo(f.am, e.adulto_mayor) &&
      siNo(f.disc, e.integrantes_discapacidad > 0) &&
      siNo(f.mono, e.monoparental) &&
      siNo(f.pris, e.prision_politica) &&
      siNo(f.sego, e.seguridad_oportunidades) &&
      siNo(f.mma, e.recambio_calefactor_mma) &&
      siNo(f.vs, e.es_vivienda_social),
  );
}

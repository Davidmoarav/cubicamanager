// Módulo Filtro DS27 Cap. IV, traído desde la app «Filtro de calificación por grupo».
// Sugerencia de qué postulantes incluir en un grupo: para cada tamaño posible elige el conjunto
// con mayor puntaje grupal que cumpla el mínimo en tramo prioritario y el rango de tamaño del llamado.
import { esTramoPrioritario, type Evaluado } from './evaluacion';
import { minimoTramoPrioritario, type Parametros } from './reglas';

export interface OpcionSeleccion {
  tamano: number;
  promedio: number;
  ids: string[];
  /** Postulantes en tramo prioritario dentro de la selección. */
  prioritarios: number;
}

/** Candidatos: sin causales bloqueantes (los incompletos sí, porque se pueden completar). */
export function candidatos(evaluados: Evaluado[]): Evaluado[] {
  return evaluados.filter((e) => e.estado !== 'No admisible');
}

const porPuntaje = (a: Evaluado, b: Evaluado) => b.calculo.puntajeTotal - a.calculo.puntajeTotal;

export function opcionesSeleccion(evaluados: Evaluado[], par: Parametros): OpcionSeleccion[] {
  const base = candidatos(evaluados);
  const prioritarios = base.filter((e) => esTramoPrioritario(e, par)).sort(porPuntaje);
  const resto = base.filter((e) => !esTramoPrioritario(e, par)).sort(porPuntaje);
  const acumular = (lista: Evaluado[]) =>
    lista.reduce<number[]>((acc, e) => [...acc, acc[acc.length - 1] + e.calculo.puntajeTotal], [0]);
  const sumaP = acumular(prioritarios);
  const sumaR = acumular(resto);

  const opciones: OpcionSeleccion[] = [];
  const minimo = Math.max(1, par.grupoMin ?? 1);
  const maximo = Math.min(par.grupoMax ?? base.length, base.length);
  for (let k = minimo; k <= maximo; k++) {
    let mejor: { nP: number; suma: number } | null = null;
    for (let nP = minimoTramoPrioritario(k, par); nP <= Math.min(k, prioritarios.length); nP++) {
      const nR = k - nP;
      if (nR > resto.length) continue;
      const suma = sumaP[nP] + sumaR[nR];
      if (!mejor || suma > mejor.suma) mejor = { nP, suma };
    }
    if (!mejor) continue;
    opciones.push({
      tamano: k,
      promedio: mejor.suma / k,
      prioritarios: mejor.nP,
      ids: [...prioritarios.slice(0, mejor.nP), ...resto.slice(0, k - mejor.nP)].map((e) => e.id),
    });
  }
  return opciones;
}

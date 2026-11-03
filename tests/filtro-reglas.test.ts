// tests/filtro-reglas.test.ts
// Pruebas del módulo Filtro DS27, traídas de la app original.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filtrar } from '../lib/filtro/filtros';
import { DOCUMENTO_RES_1048_2026 } from '../lib/filtro/documentoRes1048';
import { evaluarTodos, promediosPorItem, resumirGrupo } from '../lib/filtro/evaluacion';
import {
  calcular, completarParametros, esAdultoMayorPorFecha, minimoTramoPrioritario, PARAMETROS_RES_1048_2026, puntajeAntiguedad,
  type Parametros,
} from '../lib/filtro/reglas';
import { digitoVerificador, formatearRut, rutValido } from '../lib/filtro/rut';
import { opcionesSeleccion } from '../lib/filtro/seleccion';
import { postulanteVacio, type Grupo, type Llamado, type Postulante } from '../lib/filtro/tipos';

const par = PARAMETROS_RES_1048_2026;

function llamado(parametros: Parametros = par, id = 'l1'): Llamado {
  return { id, nombre: 'Llamado', resolucion: null, region: null, parametros, documento: null, bloqueado: false, created_at: '', updated_at: '' };
}

const grupo: Grupo = {
  id: 'g1', llamado_id: 'l1', nombre: 'Villa Prueba', codigo: null, comuna: 'Talca', zona_termica: 'D',
  tipo_proyecto: 'pda', modalidad: 'grupal', organizacion: null, estado: 'En preparación',
  representacion: 'junta_vecinos', personalidad_juridica_vigente: true, localidad: 'Talca', localidad_mas_5000: true,
  observaciones: null, created_at: '', updated_at: '',
};

let correlativo = 1_000_000;
function postulante(cambios: Partial<Postulante> = {}): Postulante {
  const cuerpo = String(correlativo++);
  const todos = Object.fromEntries(par.documentos.map((d) => [d.clave, true]));
  return {
    ...postulanteVacio('g1'),
    id: `p${cuerpo}`, nombre: `Persona ${cuerpo}`, rut: formatearRut(cuerpo + digitoVerificador(cuerpo)),
    rsh_tramo: 40, integrantes: 2, anio_recepcion: 1990, es_vivienda_social: true,
    documentos: todos, created_at: '', updated_at: '',
    ...cambios,
  };
}

const evaluar = (lista: Postulante[], parametros: Parametros = par) => evaluarTodos(lista, [grupo], [llamado(parametros)]);
const D_PDA = { zona_termica: 'D', tipo_proyecto: 'pda' as const };
const D_REG = { zona_termica: 'D', tipo_proyecto: 'regular' as const };

describe('RUT', () => {
  it('valida dígito verificador, incluida K', () => {
    expect(rutValido('8.114.309-9')).toBe(true);
    expect(rutValido('8.114.309-8')).toBe(false);
    expect(digitoVerificador('10000013')).toBe('K');
    expect(formatearRut('81143099')).toBe('8.114.309-9');
  });
});

describe('Res. 1048 – puntajes 7.1 / 7.2', () => {
  it('antigüedad: 3 pts por año desde 2009, 100 si ≤1976', () => {
    expect(puntajeAntiguedad(2009, par)).toBe(3);
    expect(puntajeAntiguedad(1989, par)).toBe(63);
    expect(puntajeAntiguedad(1977, par)).toBe(99);
    expect(puntajeAntiguedad(1976, par)).toBe(100);
    expect(puntajeAntiguedad(2015, par)).toBe(0);
  });

  it('grupo familiar por escalones (6 o más = 100)', () => {
    const pts = (n: number) => calcular(postulante({ integrantes: n }), D_REG, par).pGrupoFamiliar;
    expect([1, 2, 3, 4, 5, 6, 9].map(pts)).toEqual([0, 10, 35, 50, 75, 100, 100]);
  });

  it('suma factores y aplica 7.2 solo en proyectos PDA', () => {
    const p = postulante({
      rsh_tramo: 40, integrantes: 4, adulto_mayor: true, integrantes_discapacidad: 1,
      seguridad_oportunidades: true, anio_recepcion: 1989, recambio_calefactor_mma: true,
    });
    const pda = calcular(p, D_PDA, par);
    expect(pda.puntaje71).toBe(100 + 50 + 100 + 50 + 20 + 63);
    expect(pda.puntaje72).toBe(100);
    expect(calcular(p, D_REG, par).puntaje72).toBe(0);
  });
});

describe('Res. 1048 – montos 5.4', () => {
  it('el subsidio máximo de cada zona es la suma de base e incrementos máximos', () => {
    for (const m of par.zonas)
      expect(m.base + m.vulnerabilidadTramo1 + m.regularizacion + m.pisosVentilados + m.techoConAsbesto).toBe(m.maximo);
  });

  it('vulnerabilidad: tramo 1 hasta 60% o adulto mayor, tramo 2 de 61% a 70%, nada sobre 70%', () => {
    expect(calcular(postulante({ rsh_tramo: 70 }), D_REG, par).ufVulnerabilidad).toBe(51);
    expect(calcular(postulante({ rsh_tramo: 80, adulto_mayor: true }), D_REG, par).ufVulnerabilidad).toBe(72);
    expect(calcular(postulante({ rsh_tramo: 80 }), D_REG, par).ufVulnerabilidad).toBe(0);
    const completo = postulante({ requiere_regularizacion: true, pisos_ventilados: true, techumbre: 'con_asbesto' });
    expect(calcular(completo, D_REG, par).subsidioUF).toBe(362);
  });

  it('ahorro: 1 UF adulto mayor, 3 UF el resto (3.12)', () => {
    expect(calcular(postulante({ adulto_mayor: true }), D_REG, par).ahorroUF).toBe(1);
    expect(calcular(postulante(), D_REG, par).ahorroUF).toBe(3);
  });
});

describe('Res. 1048 – admisibilidad', () => {
  it('RSH sobre 80% no admisible en grupos', () => {
    expect(evaluar([postulante({ rsh_tramo: 90 })])[0].estado).toBe('No admisible');
  });

  it('RUT repetido solo cuenta dentro del mismo llamado', () => {
    const otroGrupo: Grupo = { ...grupo, id: 'g2', nombre: 'Otro grupo' };
    const otroLlamado: Grupo = { ...grupo, id: 'g3', llamado_id: 'l2', nombre: 'Grupo 2027' };
    const a = postulante();
    const b = { ...postulante(), rut: a.rut, grupo_id: 'g2' };
    const c = { ...postulante(), rut: a.rut, grupo_id: 'g3' };
    const ev = evaluarTodos([a, b, c], [grupo, otroGrupo, otroLlamado], [llamado(), llamado(par, 'l2')]);
    const ea = ev.find((e) => e.id === a.id)!;
    expect(ea.hallazgos.find((h) => h.mensaje.startsWith('RUT repetido'))?.mensaje).toBe('RUT repetido en: Otro grupo');
    expect(ev.find((e) => e.id === c.id)!.estado).toBe('Listo');
  });

  it('avalúo ≤1.375 UF solo si no es vivienda social', () => {
    expect(evaluar([postulante({ es_vivienda_social: false, avaluo_fiscal_uf: 1400 })])[0].estado).toBe('No admisible');
    expect(evaluar([postulante({ avaluo_fiscal_uf: 1400 })])[0].estado).toBe('Listo');
  });

  it('pendiente si faltan documentos', () => {
    expect(evaluar([postulante({ documentos: {} })])[0].estado).toBe('Incompleto');
  });

  it('60% mínimo en tramo ≤60% y 10 a 70 postulantes', () => {
    expect([10, 11, 15].map((n) => minimoTramoPrioritario(n, par))).toEqual([6, 7, 9]);
    const pocos = Array.from({ length: 9 }, () => postulante());
    expect(resumirGrupo(grupo, evaluar(pocos), par).cumpleRequisitos).toBe(false);
    const mitad = [
      ...Array.from({ length: 5 }, () => postulante({ rsh_tramo: 40 })),
      ...Array.from({ length: 5 }, () => postulante({ rsh_tramo: 70 })),
    ];
    expect(resumirGrupo(grupo, evaluar(mitad), par).cumpleRequisitos).toBe(false);
  });
});

describe('Criterios modificados (otra resolución)', () => {
  it('cambiar puntajes y montos cambia el resultado', () => {
    const nuevo: Parametros = {
      ...par,
      puntosAdultoMayor: 50,
      zonas: par.zonas.map((z) => (z.zona === 'D' ? { ...z, base: 200, maximo: 400 } : z)),
    };
    const p = postulante({ adulto_mayor: true });
    expect(calcular(p, D_REG, nuevo).pAdultoMayor).toBe(50);
    expect(calcular(p, D_REG, nuevo).ufBase).toBe(200);
  });

  it('un requisito en null deja de exigirse', () => {
    const sinTope: Parametros = { ...par, rshMaxGrupal: null, grupoMin: null, grupoMax: null, porcentajeMinPrioritario: null };
    expect(evaluar([postulante({ rsh_tramo: 90 })], sinTope)[0].estado).toBe('Observado'); // sin vulnerabilidad, pero admisible
    expect(resumirGrupo(grupo, evaluar([postulante()], sinTope), sinTope).cumpleRequisitos).toBe(true);
  });

  it('factores adicionales suman puntaje', () => {
    const conFactor: Parametros = { ...par, factoresExtra: [{ clave: 'cuidador', etiqueta: 'Cuidador/a', puntos: 30 }] };
    expect(calcular(postulante({ factores_extra: { cuidador: true } }), D_REG, conFactor).pExtra).toBe(30);
  });

  it('documentos nuevos se exigen', () => {
    const conDoc: Parametros = { ...par, documentos: [...par.documentos, { clave: 'rsh', etiqueta: 'Cartola RSH', exigir: 'siempre' }] };
    expect(evaluar([postulante()], conDoc)[0].documentosFaltantes).toEqual(['Cartola RSH']);
  });

  it('zona eliminada del llamado deja al postulante no admisible', () => {
    const sinD: Parametros = { ...par, zonas: par.zonas.filter((z) => z.zona !== 'D') };
    expect(evaluar([postulante()], sinD)[0].estado).toBe('No admisible');
  });

  it('completarParametros rellena claves faltantes sin pisar las guardadas', () => {
    const p = completarParametros({ puntosAdultoMayor: 80, antiguedad: { anioCorte: 2015 } });
    expect(p.puntosAdultoMayor).toBe(80);
    expect(p.antiguedad).toEqual({ anioCorte: 2015, puntosPorAnio: 3, maximo: 100 });
    expect(p.grupoMax).toBe(70);
    expect(completarParametros(null)).toEqual(par);
  });

  it('la tabla de postulantes del módulo tiene cada dato que guarda la app', () => {
    const sql = readFileSync(new URL('../sql/50_filtro_ds27.sql', import.meta.url), 'utf8');
    const tabla = sql.slice(sql.indexOf('create table if not exists filtro_postulantes'), sql.indexOf('create index'));
    for (const columna of Object.keys(postulanteVacio('g1'))) expect(tabla).toMatch(new RegExp(`\\n\\s+${columna}\\s`));
  });
});

describe('Variables adicionales de la resolución', () => {
  it('copropiedad tipo A no admisible (3.6 f)', () => {
    expect(evaluar([postulante({ copropiedad_tipo_a: true })])[0].estado).toBe('No admisible');
    expect(evaluar([postulante({ copropiedad_tipo_a: true })], { ...par, excluirCopropiedadA: false })[0].estado).toBe('Listo');
  });

  it('Ley 20.898 y excepción de permiso quitan la observación', () => {
    expect(evaluar([postulante({ anio_recepcion: 2024 })])[0].estado).toBe('Observado');
    expect(evaluar([postulante({ anio_recepcion: 2024, recepcion_ley_20898: true })])[0].estado).toBe('Listo');
    expect(evaluar([postulante({ anio_permiso: 2012 })])[0].estado).toBe('Observado');
    expect(evaluar([postulante({ anio_permiso: 2012, permiso_excepcion: true })])[0].estado).toBe('Listo');
  });

  it('ahorro insuficiente queda pendiente y el costo sobre el subsidio calcula el aporte (3.12 y 5.6)', () => {
    expect(evaluar([postulante({ ahorro_uf: 2 })])[0].estado).toBe('Incompleto');
    expect(evaluar([postulante({ ahorro_uf: 3 })])[0].estado).toBe('Listo');
    const [e] = evaluar([postulante({ costo_proyecto_uf: 300 })]);
    expect(e.aporteAdicionalUF).toBe(300 - e.calculo.subsidioUF);
  });

  it('fecha de nacimiento: adulto mayor si cumple 60 durante el año del llamado', () => {
    expect(esAdultoMayorPorFecha('1966-12-31', par)).toBe(true);
    expect(esAdultoMayorPorFecha('1967-01-01', par)).toBe(false);
    expect(evaluar([postulante({ fecha_nacimiento: '1950-05-01', adulto_mayor: false })])[0].estado).toBe('Observado');
  });

  it('subsidio térmico previo en PDA solo hasta 2009 (3.6 d)', () => {
    expect(evaluar([postulante({ subsidio_termico_previo_anio: 2008 })])[0].estado).toBe('Listo');
    expect(evaluar([postulante({ subsidio_termico_previo_anio: 2012 })])[0].estado).toBe('Observado');
  });

  it('localidad y representación son requisitos del grupo', () => {
    const sinLocalidad = { ...grupo, localidad_mas_5000: false };
    const lista = Array.from({ length: 10 }, () => postulante());
    expect(resumirGrupo(sinLocalidad, evaluarTodos(lista, [sinLocalidad], [llamado()]), par).cumpleRequisitos).toBe(false);
    expect(resumirGrupo(grupo, evaluar(lista), par).cumpleRequisitos).toBe(true);
    expect(resumirGrupo(grupo, evaluar(lista), par).asistenciaTecnicaUF).toBe(90);
  });
});

describe('Promedios por ítem', () => {
  it('promedia cada variable y el total sobre la lista', () => {
    const lista = evaluar([
      postulante({ rsh_tramo: 40, adulto_mayor: true }),
      postulante({ rsh_tramo: 60, adulto_mayor: false }),
    ]);
    const items = promediosPorItem(lista, par, true);
    const rsh = items.find((i) => i.item === 'RSH')!;
    expect(rsh.promedio).toBe(75);
    expect(rsh.maximo).toBe(100);
    const am = items.find((i) => i.item === 'Adulto mayor')!;
    expect(am.conPuntaje).toBe(1);
    expect(items.at(-1)!.promedio).toBe((lista[0].calculo.puntajeTotal + lista[1].calculo.puntajeTotal) / 2);
  });
});

describe('Filtros por rango', () => {
  it('RSH desde–hasta y características', () => {
    const lista = evaluar([postulante({ rsh_tramo: 40 }), postulante({ rsh_tramo: 60 }), postulante({ rsh_tramo: 80, adulto_mayor: true })]);
    const vacio = Object.fromEntries(Object.keys({ q: 0 }).map((k) => [k, ''])) as Record<string, string>;
    const f = (cambios: Record<string, string>) => ({ ...vacio, ...cambios }) as Parameters<typeof filtrar>[1];
    expect(filtrar(lista, f({ rshDesde: '50', rshHasta: '80' })).map((e) => e.rsh_tramo)).toEqual([60, 80]);
    expect(filtrar(lista, f({ rshHasta: '60' })).length).toBe(2);
    expect(filtrar(lista, f({ am: 'si' })).map((e) => e.rsh_tramo)).toEqual([80]);
  });
});

describe('Texto de la resolución', () => {
  it('cada sección tiene id único y contenido', () => {
    const ids = DOCUMENTO_RES_1048_2026.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DOCUMENTO_RES_1048_2026.every((s) => s.titulo && s.contenido.length > 50)).toBe(true);
  });
});

describe('Sugerencia de selección', () => {
  it('maximiza el promedio respetando el 60% en tramo ≤60%', () => {
    const bajos = Array.from({ length: 6 }, () => postulante({ rsh_tramo: 60, integrantes: 1, anio_recepcion: 2009 }));
    const altos = Array.from({ length: 8 }, () => postulante({ rsh_tramo: 70, integrantes: 6, adulto_mayor: true, anio_recepcion: 1970 }));
    const opciones = opcionesSeleccion(evaluar([...bajos, ...altos]), par);
    expect(opciones.map((o) => o.tamano)).toEqual([10]);
    expect(opciones[0].prioritarios).toBe(6);
    const ids = new Set(opciones[0].ids);
    expect(bajos.every((b) => ids.has(b.id))).toBe(true);
  });

  it('respeta el rango de tamaño definido en el llamado', () => {
    const lista = Array.from({ length: 12 }, () => postulante());
    const chico: Parametros = { ...par, grupoMin: 3, grupoMax: 5 };
    expect(opcionesSeleccion(evaluar(lista, chico), chico).map((o) => o.tamano)).toEqual([3, 4, 5]);
  });
});

describe('Acceso al módulo dentro de Cubica', () => {
  it('lo ven el administrador y el jefe de obra, no el contador', async () => {
    const { rutaPermitida, menuPorRol } = await import('../lib/nav');
    expect(rutaPermitida('/filtro', 'admin')).toBe(true);
    expect(rutaPermitida('/filtro/grupos/x', 'jefe_obra')).toBe(true);
    expect(rutaPermitida('/filtro/postulantes', 'contador')).toBe(false);
    expect(menuPorRol('contador').some((m) => m.href === '/filtro')).toBe(false);
  });
});

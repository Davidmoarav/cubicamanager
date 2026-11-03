// tests/filtro-proyecto.test.ts
// Paso de un grupo del Filtro DS27 a una obra de Cubica Manager.
import { describe, expect, it } from 'vitest';
import { evaluarTodos } from '../lib/filtro/evaluacion';
import { netoPesos, obraDesdeGrupo } from '../lib/filtro/proyecto';
import { PARAMETROS_RES_1048_2026 } from '../lib/filtro/reglas';
import { postulanteVacio, type Grupo, type Llamado, type Postulante } from '../lib/filtro/tipos';

const llamado: Llamado = {
  id: 'l1', nombre: 'DS27 Cap. IV 2026 – Maule', resolucion: 'Res. Ex. N°1048', region: 'Maule',
  parametros: PARAMETROS_RES_1048_2026, documento: null, bloqueado: false, created_at: '', updated_at: '',
};
const grupo: Grupo = {
  id: 'g1', llamado_id: 'l1', nombre: 'Villa Prueba', codigo: 'AT-12', comuna: 'Talca', zona_termica: 'D',
  tipo_proyecto: 'pda', modalidad: 'grupal', organizacion: 'JJVV Villa Prueba', estado: 'Seleccionado',
  representacion: 'junta_vecinos', personalidad_juridica_vigente: true, localidad: 'Talca', localidad_mas_5000: true,
  observaciones: null, created_at: '', updated_at: '',
};
const persona = (id: string, nombre: string, cambios: Partial<Postulante> = {}): Postulante => ({
  ...postulanteVacio('g1'), id, nombre, rut: '11.111.111-1', rsh_tramo: 40, integrantes: 2, anio_recepcion: 1990,
  created_at: '', updated_at: '', ...cambios,
});

describe('Pasar un grupo a obra', () => {
  const lista = [
    persona('p1', 'Rosa Soto', { direccion: 'Pasaje 1 #120' }),
    persona('p2', 'Ana Pérez', { costo_proyecto_uf: 250 }),
    persona('p3', 'Luis Díaz', { incluido: false }),
  ];
  const evaluados = evaluarTodos(lista, [grupo], [llamado]);
  const obra = obraDesdeGrupo(grupo, llamado, evaluados);
  const subsidio = (id: string) => evaluados.find((e) => e.id === id)!.calculo.subsidioUF;

  it('una partida por vivienda incluida, ordenadas por nombre', () => {
    expect(obra.viviendas.map((v) => v.postulante_id)).toEqual(['p2', 'p1']);
    expect(obra.viviendas[1].descripcion).toBe('Vivienda Rosa Soto – Pasaje 1 #120');
    expect(obra.viviendas[0].descripcion).toBe('Vivienda Ana Pérez');
  });

  it('el monto es el costo del proyecto si está cargado; si no, el subsidio', () => {
    expect(obra.viviendas[0].montoUF).toBe(250);
    expect(obra.viviendas[1].montoUF).toBe(subsidio('p1'));
    expect(obra.totalUF).toBeCloseTo(250 + subsidio('p1'), 2);
    expect(obra.subsidioUF).toBeCloseTo(subsidio('p1') + subsidio('p2'), 2);
    expect(obra.asistenciaTecnicaUF).toBe(2 * PARAMETROS_RES_1048_2026.asistenciaTecnicaUF);
  });

  it('la descripción identifica el grupo y el llamado', () => {
    expect(obra.descripcion).toContain('Villa Prueba (código AT-12), Talca, zona térmica D');
    expect(obra.descripcion).toContain('Res. Ex. N°1048');
    expect(obra.descripcion).toContain('2 viviendas');
  });

  it('las partidas van netas en pesos', () => {
    expect(netoPesos(119, 40_000)).toBe(4_000_000);
  });

  it('sin incluidos no hay viviendas', () => {
    const nadie = evaluarTodos([persona('p9', 'X', { incluido: false })], [grupo], [llamado]);
    expect(obraDesdeGrupo(grupo, llamado, nadie).viviendas).toEqual([]);
  });
});

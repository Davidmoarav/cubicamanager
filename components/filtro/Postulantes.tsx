'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useMemo, useState } from 'react';
import { filtrar, FiltrosPostulantes, useFiltros } from './FiltrosPostulantes';
import { PostulanteForm } from './PostulanteForm';
import { TablaPostulantes } from './TablaPostulantes';
import { Boton } from './ui';
import { useDatos } from './DataProvider';
import type { Evaluado } from '@/lib/filtro/evaluacion';
import { exportarExcel } from '@/lib/filtro/excel';

export function Postulantes() {
  const { evaluados: todos, grupos: todosLosGrupos, llamado, marcarIncluidos } = useDatos();
  const grupos = useMemo(() => todosLosGrupos.filter((g) => g.llamado_id === llamado?.id), [todosLosGrupos, llamado]);
  const evaluados = useMemo(() => todos.filter((e) => e.grupo.llamado_id === llamado?.id), [todos, llamado]);
  const filtros = useFiltros();
  const [editando, setEditando] = useState<Evaluado | null>(null);

  const comunas = [...new Set(grupos.map((g) => g.comuna))].sort();
  const filas = useMemo(() => filtrar(evaluados, filtros.f), [evaluados, filtros.f]);
  const editandoGrupo = editando && grupos.find((g) => g.id === editando.grupo_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Postulantes</h1>
          <p className="text-sm text-muted">{filas.length} de {evaluados.length} postulantes</p>
        </div>
        <Boton onClick={() => exportarExcel(filas, 'postulantes_filtrados.xlsx')} disabled={filas.length === 0}>
          Exportar filtrados
        </Boton>
      </div>

      <FiltrosPostulantes filtros={filtros} grupos={grupos} comunas={comunas} esPDA={grupos.some((g) => g.tipo_proyecto === 'pda')} />

      <TablaPostulantes filas={filas} mostrarGrupo onEditar={setEditando} onIncluir={(e, v) => marcarIncluidos([e.id], v)} />

      {editando && editandoGrupo && (
        <PostulanteForm grupo={editandoGrupo} par={editando.parametros} postulante={editando} onCerrar={() => setEditando(null)} />
      )}
    </div>
  );
}

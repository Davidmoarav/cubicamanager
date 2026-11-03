'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useState } from 'react';
import { useDatos } from './DataProvider';
import { leerExcel, type ResultadoImportacion } from '@/lib/filtro/excel';
import { limpiarRut } from '@/lib/filtro/rut';
import type { Parametros } from '@/lib/filtro/reglas';
import type { Grupo } from '@/lib/filtro/tipos';
import { Boton, Modal } from './ui';

export function ImportarExcel({ grupo, par, onCerrar }: { grupo: Grupo; par: Parametros; onCerrar: () => void }) {
  const { postulantes, insertarPostulantes } = useDatos();
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [omitirExistentes, setOmitirExistentes] = useState(true);
  const [importando, setImportando] = useState(false);

  const rutsDelGrupo = new Set(postulantes.filter((p) => p.grupo_id === grupo.id).map((p) => limpiarRut(p.rut)));
  const filas = resultado?.filas ?? [];
  const yaEnGrupo = filas.filter((f) => rutsDelGrupo.has(limpiarRut(f.datos.rut)));
  const aImportar = omitirExistentes ? filas.filter((f) => !rutsDelGrupo.has(limpiarRut(f.datos.rut))) : filas;
  const conAvisos = filas.filter((f) => f.avisos.length > 0);

  async function leer(archivo: File) {
    setError(null);
    try {
      setResultado(await leerExcel(await archivo.arrayBuffer(), grupo.id, par));
    } catch (e) {
      setResultado(null);
      setError((e as Error).message);
    }
  }

  async function importar() {
    setImportando(true);
    try {
      await insertarPostulantes(aImportar.map((f) => f.datos));
      onCerrar();
    } catch (e) {
      setError((e as Error).message);
      setImportando(false);
    }
  }

  const zonaDistinta = resultado && resultado.zonasEnArchivo.some((z) => z !== grupo.zona_termica);
  const pdaDistinto = resultado && resultado.pdaEnArchivo !== (grupo.tipo_proyecto === 'pda');

  return (
    <Modal titulo={`Importar Excel a «${grupo.nombre}»`} onCerrar={onCerrar}>
      <p className="text-sm text-muted">
        Acepta la «Matriz DS27 Capítulo IV Maule 2026» u otra planilla con columnas de nombres similares (la fila de
        encabezados debe tener una columna «RUT»). También reconoce columnas con el nombre de los documentos y factores
        adicionales definidos en Criterios. Las columnas de puntaje no se leen: se recalculan.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="mt-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-om file:px-3 file:py-1.5 file:text-white"
        onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])}
      />
      {error && <p className="mt-4 rounded bg-danger-bg p-2 text-sm text-danger">{error}</p>}

      {resultado && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            Hoja <b>{resultado.hoja}</b>: <b>{filas.length}</b> postulantes. Columnas reconocidas:{' '}
            <span className="text-muted">{resultado.columnasReconocidas.join(', ')}</span>
          </p>
          {zonaDistinta && (
            <p className="rounded bg-warning-bg p-2 text-warning">
              El archivo indica zona {resultado.zonasEnArchivo.join(', ')} y el grupo es zona {grupo.zona_termica}. Se usa la del grupo.
            </p>
          )}
          {pdaDistinto && (
            <p className="rounded bg-warning-bg p-2 text-warning">
              El archivo {resultado.pdaEnArchivo ? 'marca' : 'no marca'} proyecto PDA y el grupo es{' '}
              {grupo.tipo_proyecto === 'pda' ? 'PDA' : 'Regular'}. Se usa el tipo del grupo.
            </p>
          )}
          {yaEnGrupo.length > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-om" checked={omitirExistentes} onChange={(e) => setOmitirExistentes(e.target.checked)} />
              Omitir {yaEnGrupo.length} RUT que ya están en este grupo
            </label>
          )}
          {conAvisos.length > 0 && (
            <details className="rounded bg-canvas p-2">
              <summary className="cursor-pointer text-ink">{conAvisos.length} filas con ajustes al importar</summary>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted">
                {conAvisos.map((f) => (
                  <li key={f.fila}>
                    Fila {f.fila} ({f.datos.nombre}): {f.avisos.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" onClick={importar} disabled={!resultado || aImportar.length === 0 || importando}>
          {importando ? 'Importando…' : `Importar ${aImportar.length} postulantes`}
        </Boton>
      </div>
    </Modal>
  );
}

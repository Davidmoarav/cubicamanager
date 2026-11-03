'use client'
// Módulo Filtro DS27 Cap. IV: pasa un grupo terminado a una obra de Cubica Manager.
// Cada vivienda incluida queda como partida de la obra; el grupo queda enlazado a ella.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boton, Campo, claseInput, fmt, Modal } from './ui';
import { useDatos } from './DataProvider';
import type { Evaluado } from '@/lib/filtro/evaluacion';
import { obraDesdeGrupo } from '@/lib/filtro/proyecto';
import type { Grupo, Llamado } from '@/lib/filtro/tipos';

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

export function PasarAProyecto({
  grupo, llamado, evaluados, onCerrar,
}: {
  grupo: Grupo; llamado: Llamado; evaluados: Evaluado[]; onCerrar: () => void;
}) {
  const { recargar } = useDatos();
  const router = useRouter();
  const obra = useMemo(() => obraDesdeGrupo(grupo, llamado, evaluados), [grupo, llamado, evaluados]);
  const [nombre, setNombre] = useState(grupo.nombre);
  const [cliente, setCliente] = useState(llamado.region ? `SERVIU Región de ${llamado.region}` : 'SERVIU');
  const [valorUF, setValorUF] = useState<number | ''>('');
  const [inicio, setInicio] = useState(hoyChile);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  // UF del día para pasar las partidas a pesos; se puede corregir a mano
  useEffect(() => {
    fetch('/api/indicadores')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.uf) setValorUF((v) => (v === '' ? j.uf : v)); })
      .catch(() => {});
  }, []);

  async function crear() {
    setError(null);
    setCreando(true);
    try {
      const res = await fetch('/api/filtro/proyecto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupo_id: grupo.id, nombre: nombre.trim(), cliente: cliente.trim(), valor_uf: Number(valorUF), inicio }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        if (j?.proyecto_id) {
          recargar();
          return router.push(`/obra/${j.proyecto_id}`);
        }
        throw new Error(j?.error || 'No se pudo crear la obra.');
      }
      recargar();
      router.push(`/obra/${j.proyecto_id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreando(false);
    }
  }

  const sinViviendas = obra.viviendas.length === 0;

  return (
    <Modal titulo="Pasar a proyecto" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-[13px] text-muted">
        Se crea una obra en UF con las {obra.viviendas.length} viviendas incluidas. Cada vivienda queda como una partida,
        para llevar el avance casa por casa. El monto de cada vivienda es su costo de
        proyecto si está cargado; si no, su subsidio.
      </p>

      {grupo.estado !== 'Seleccionado' && (
        <p className="mt-3 rounded-lg bg-warning-bg p-3 text-[13px] text-warning">
          El grupo está «{grupo.estado}». Normalmente se pasa a proyecto cuando ya está seleccionado.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre de la obra">
          <input className={claseInput} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Cliente">
          <input className={claseInput} value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </Campo>
        <Campo etiqueta="Valor UF (pesos)" ayuda="Para pasar las partidas a pesos. Se trae la UF de hoy.">
          <input
            type="number"
            className={claseInput}
            value={valorUF}
            onChange={(e) => setValorUF(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Campo>
        <Campo etiqueta="Inicio">
          <input type="date" className={claseInput} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
      </div>

      <div className="mt-4 rounded-card border border-line">
        <div className="flex flex-wrap justify-between gap-2 border-b border-line bg-canvas px-4 py-2.5 text-[13px]">
          <span className="font-bold text-ink">Valor de la obra: {fmt(obra.totalUF, 2)} UF</span>
          <span className="text-muted">
            Subsidio {fmt(obra.subsidioUF, 2)} UF · asistencia técnica {fmt(obra.asistenciaTecnicaUF, 2)} UF (fuera de la obra)
          </span>
        </div>
        <ul className="max-h-56 divide-y divide-line overflow-y-auto text-[13px]">
          {obra.viviendas.map((v) => (
            <li key={v.postulante_id} className="flex justify-between gap-3 px-4 py-1.5">
              <span className="text-ink">{v.descripcion}</span>
              <span className="whitespace-nowrap tabular-nums text-muted">{fmt(v.montoUF, 2)} UF</span>
            </li>
          ))}
          {sinViviendas && <li className="px-4 py-3 text-muted">No hay postulantes incluidos en el grupo.</li>}
        </ul>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-bg p-2 text-[13px] text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton
          variante="primario"
          onClick={crear}
          disabled={sinViviendas || !nombre.trim() || !cliente.trim() || !(Number(valorUF) > 0) || creando}
        >
          {creando ? 'Creando obra…' : 'Crear obra'}
        </Boton>
      </div>
    </Modal>
  );
}

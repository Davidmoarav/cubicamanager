'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useMemo, useState } from 'react';
import { ESTADOS, type Evaluado } from '@/lib/filtro/evaluacion';
import { fmt, InsigniaEstado } from './ui';

type Columna = {
  clave: string;
  titulo: string;
  valor: (e: Evaluado) => string | number;
  derecha?: boolean;
  titulo_largo?: string;
};

const COLUMNAS: Columna[] = [
  { clave: 'nombre', titulo: 'Postulante', valor: (e) => e.nombre },
  { clave: 'grupo', titulo: 'Grupo', valor: (e) => e.grupo.nombre },
  { clave: 'rsh', titulo: 'RSH', valor: (e) => e.rsh_tramo ?? 999, derecha: true },
  { clave: 'integrantes', titulo: 'Int.', valor: (e) => e.integrantes ?? 0, derecha: true, titulo_largo: 'Integrantes del grupo familiar' },
  { clave: 'am', titulo: 'AM', valor: (e) => (e.adulto_mayor ? 1 : 0), titulo_largo: 'Adulto mayor' },
  { clave: 'anio', titulo: 'Recep.', valor: (e) => e.anio_recepcion ?? 9999, derecha: true, titulo_largo: 'Año recepción final' },
  { clave: 'p71', titulo: '7.1', valor: (e) => e.calculo.puntaje71, derecha: true },
  { clave: 'p72', titulo: '7.2', valor: (e) => e.calculo.puntaje72, derecha: true },
  { clave: 'total', titulo: 'Total', valor: (e) => e.calculo.puntajeTotal, derecha: true },
  { clave: 'uf', titulo: 'Subsidio UF', valor: (e) => e.calculo.subsidioUF, derecha: true },
  { clave: 'estado', titulo: 'Estado', valor: (e) => ESTADOS.indexOf(e.estado) },
];

export function TablaPostulantes({
  filas,
  mostrarGrupo = false,
  onEditar,
  onIncluir,
}: {
  filas: Evaluado[];
  mostrarGrupo?: boolean;
  onEditar: (e: Evaluado) => void;
  onIncluir?: (e: Evaluado, incluido: boolean) => void;
}) {
  const [orden, setOrden] = useState<{ clave: string; asc: boolean }>({ clave: 'total', asc: false });
  const columnas = COLUMNAS.filter((c) => mostrarGrupo || c.clave !== 'grupo');

  const ordenadas = useMemo(() => {
    const col = COLUMNAS.find((c) => c.clave === orden.clave)!;
    return [...filas].sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return orden.asc ? r : -r;
    });
  }, [filas, orden]);

  if (filas.length === 0)
    return <p className="rounded-card bg-white shadow-card p-8 text-center text-sm text-muted border border-line">Sin postulantes.</p>;

  return (
    <div className="overflow-x-auto rounded-card bg-white border border-line shadow-card">
      <table className="min-w-full text-sm">
        <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {onIncluir && <th className="w-8 px-3 py-2" title="Incluido en la postulación">Incl.</th>}
            <th className="w-8 px-2 py-2 text-right">#</th>
            {columnas.map((c) => (
              <th
                key={c.clave}
                title={c.titulo_largo}
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-ink ${c.derecha ? 'text-right' : ''}`}
                onClick={() => setOrden((o) => ({ clave: c.clave, asc: o.clave === c.clave ? !o.asc : c.clave === 'nombre' }))}
              >
                {c.titulo}
                {orden.clave === c.clave && (orden.asc ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ordenadas.map((e, i) => (
            <tr
              key={e.id}
              onClick={() => onEditar(e)}
              className={`cursor-pointer hover:bg-om-bg/50 ${e.incluido ? '' : 'bg-canvas text-subtle'}`}
            >
              {onIncluir && (
                <td className="px-3 py-1.5" onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" className="size-4 accent-om" checked={e.incluido} onChange={(ev) => onIncluir(e, ev.target.checked)} />
                </td>
              )}
              <td className="px-2 py-1.5 text-right text-xs tabular-nums text-subtle">{i + 1}</td>
              <td className="min-w-48 px-3 py-1.5">
                <div className={`font-medium ${e.incluido ? 'text-ink' : ''}`}>{e.nombre}</div>
                <div className="text-xs text-muted">{e.rut}</div>
              </td>
              {mostrarGrupo && <td className="px-3 py-1.5 text-muted">{e.grupo.nombre}</td>}
              <td className={`px-3 py-1.5 text-right tabular-nums ${e.rsh_tramo != null && e.rsh_tramo <= 60 ? 'font-medium text-om-dark' : ''}`}>
                {e.rsh_tramo != null ? `${e.rsh_tramo}%` : '—'}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.integrantes ?? '—'}</td>
              <td className="px-3 py-1.5">{e.adulto_mayor ? 'Sí' : ''}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.anio_recepcion ?? '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.calculo.puntaje71}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.calculo.puntaje72 || ''}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{e.calculo.puntajeTotal}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(e.calculo.subsidioUF)}</td>
              <td className="px-3 py-1.5">
                <InsigniaEstado estado={e.estado} title={e.hallazgos.map((h) => '• ' + h.mensaje).join('\n')} />
                {e.hallazgos.some((h) => h.severidad === 'bloqueante') && (
                  <div className="mt-0.5 max-w-56 truncate text-xs text-danger">
                    {e.hallazgos.find((h) => h.severidad === 'bloqueante')!.mensaje}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-line bg-canvas text-xs font-medium text-muted">
          <PieDePromedios filas={filas} conIncluir={!!onIncluir} mostrarGrupo={mostrarGrupo} />
        </tfoot>
      </table>
    </div>
  );
}

function PieDePromedios({ filas, conIncluir, mostrarGrupo }: { filas: Evaluado[]; conIncluir: boolean; mostrarGrupo: boolean }) {
  const prom = (valores: (number | null)[], decimales = 1, esAnio = false) => {
    const v = valores.filter((x): x is number => x != null);
    if (!v.length) return '—';
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return esAnio ? String(Math.round(m)) : fmt(m, decimales);
  };
  const am = filas.length ? (filas.filter((e) => e.adulto_mayor).length / filas.length) * 100 : 0;
  const celda = 'px-3 py-2 text-right tabular-nums';
  return (
    <tr>
      {conIncluir && <td />}
      <td />
      <td className="px-3 py-2 uppercase tracking-wide">Promedio ({filas.length})</td>
      {mostrarGrupo && <td />}
      <td className={celda}>{prom(filas.map((e) => e.rsh_tramo))}%</td>
      <td className={celda}>{prom(filas.map((e) => e.integrantes))}</td>
      <td className="px-3 py-2 tabular-nums" title="Porcentaje de adultos mayores">{fmt(am)}%</td>
      <td className={celda}>{prom(filas.map((e) => e.anio_recepcion), 0, true)}</td>
      <td className={celda}>{prom(filas.map((e) => e.calculo.puntaje71))}</td>
      <td className={celda}>{prom(filas.map((e) => e.calculo.puntaje72))}</td>
      <td className={`${celda} font-semibold text-ink`}>{prom(filas.map((e) => e.calculo.puntajeTotal))}</td>
      <td className={celda}>{prom(filas.map((e) => e.calculo.subsidioUF), 0)}</td>
      <td />
    </tr>
  );
}

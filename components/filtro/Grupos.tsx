'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GrupoForm } from './GrupoForm';
import { Boton, fmt } from './ui';
import { useDatos } from './DataProvider';
import { resumirGrupo } from '@/lib/filtro/evaluacion';

export function Grupos() {
  const { grupos, evaluados, llamado, parametros } = useDatos();
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const resumenes = grupos
    .filter((g) => g.llamado_id === llamado?.id)
    .map((g) => resumirGrupo(g, evaluados, parametros))
    .sort((a, b) => b.puntajeGrupal - a.puntajeGrupal);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Grupos</h1>
          <p className="text-sm text-muted">{llamado?.nombre} · ordenados por puntaje grupal de los postulantes incluidos.</p>
        </div>
        <Boton variante="primario" onClick={() => setCreando(true)}>+ Nuevo grupo</Boton>
      </div>

      {resumenes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['pda', 'regular'] as const).map((tipo) => {
            const disponibles = parametros.recursosRegionUF[tipo];
            const delTipo = resumenes.filter((r) => r.grupo.tipo_proyecto === tipo);
            const comprometido = delTipo.reduce((s, r) => s + r.subsidioTotalUF, 0);
            if (delTipo.length === 0 && !disponibles) return null;
            const pct = disponibles > 0 ? (comprometido / disponibles) * 100 : 0;
            return (
              <div key={tipo} className="rounded-card bg-white p-4 border border-line shadow-card">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">Recursos {tipo === 'pda' ? 'AT PDA' : 'AT Regular'} de la región</span>
                  <span className="text-xs text-muted">{delTipo.length} grupo(s)</span>
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {fmt(comprometido)} <span className="text-sm font-normal text-muted">de {fmt(disponibles)} UF</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-canvas">
                  <div className={`h-2 rounded-full ${pct > 100 ? 'bg-danger' : 'bg-om'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {fmt(pct, 1)}% del presupuesto {tipo === 'pda' ? 'AT PDA' : 'AT Regular'}
                  {llamado?.region ? ` del ${llamado.region}` : ' de la región'}
                  {llamado?.resolucion ? ` (${llamado.resolucion}, punto 2)` : ' (punto 2 de la resolución)'}, que compiten todas
                  las entidades patrocinantes de la región. Se calcula con los subsidios de tus postulantes incluidos.
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resumenes.length === 0 ? (
        <div className="rounded-card bg-white shadow-card p-10 text-center border border-line">
          <p className="text-muted">Aún no hay grupos.</p>
          <p className="mt-1 text-sm text-muted">Crea uno y luego importa tu Excel de beneficiarios dentro del grupo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card bg-white border border-line shadow-card">
          <table className="min-w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Grupo</th>
                <th className="px-3 py-2">Comuna / zona</th>
                <th className="px-3 py-2 text-right">Incluidos</th>
                <th className="px-3 py-2 text-right">Tramo ≤{parametros.rshTramoPrioritario}%</th>
                <th className="px-3 py-2 text-right">Puntaje grupal</th>
                <th className="px-3 py-2 text-right">Subsidio UF</th>
                <th className="px-3 py-2">Requisitos</th>
                <th className="px-3 py-2">Postulantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {resumenes.map((r, i) => (
                <tr key={r.grupo.id} className="cursor-pointer hover:bg-om-bg/50" onClick={() => router.push(`/filtro/grupos/${r.grupo.id}`)}>
                  <td className="px-3 py-2 tabular-nums text-subtle">{i + 1}</td>
                  <td className="min-w-44 px-3 py-2">
                    <Link href={`/filtro/grupos/${r.grupo.id}`} className="font-medium text-ink hover:text-om">{r.grupo.nombre}</Link>
                    <div className="text-xs text-muted">
                      {r.grupo.tipo_proyecto === 'pda' ? 'PDA' : 'Regular'} · {r.grupo.modalidad} · {r.grupo.estado}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.grupo.comuna} · {r.grupo.zona_termica}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.incluidos} / {r.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.incluidos > 0 ? `${fmt((r.tramoPrioritario / r.incluidos) * 100)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.puntajeGrupal, 1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.subsidioTotalUF)}</td>
                  <td className="px-3 py-2">
                    {r.cumpleRequisitos ? (
                      <span className="text-success">✓ Cumple</span>
                    ) : (
                      <span className="text-danger" title={r.requisitos.filter((q) => !q.cumple).map((q) => q.texto).join('\n')}>
                        ✗ {r.requisitos.filter((q) => !q.cumple).length} sin cumplir
                      </span>
                    )}
                    {r.alertas.length > 0 && <span className="ml-2 text-warning" title={r.alertas.join('\n')}>⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.porEstado.Listo} listos · {r.porEstado.Incompleto} incompl. · {r.porEstado['No admisible']} no adm.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <GrupoForm onCerrar={() => setCreando(false)} onGuardado={(g) => router.push(`/filtro/grupos/${g.id}`)} />}
    </div>
  );
}

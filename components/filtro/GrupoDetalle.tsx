'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { confirmar } from '@/lib/avisos';
import { filtrar, FiltrosPostulantes, useFiltros } from './FiltrosPostulantes';
import { GrupoForm } from './GrupoForm';
import { ImportarExcel } from './ImportarExcel';
import { PasarAProyecto } from './PasarAProyecto';
import { PostulanteForm } from './PostulanteForm';
import { TablaPostulantes } from './TablaPostulantes';
import { Boton, Cumple, fmt, Tarjeta } from './ui';
import { useDatos } from './DataProvider';
import { promediosDatos, promediosPorItem, resumirGrupo, type Evaluado } from '@/lib/filtro/evaluacion';
import { exportarExcel } from '@/lib/filtro/excel';
import { TIPOS_PROYECTO, type Parametros } from '@/lib/filtro/reglas';
import { opcionesSeleccion } from '@/lib/filtro/seleccion';
import type { Postulante } from '@/lib/filtro/tipos';

export function GrupoDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { grupos, evaluados, llamados, eliminarGrupo, marcarIncluidos } = useDatos();
  const grupo = grupos.find((g) => g.id === id);
  const llamadoDelGrupo = llamados.find((l) => l.id === grupo?.llamado_id);
  const [editandoGrupo, setEditandoGrupo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [editando, setEditando] = useState<Postulante | 'nuevo' | null>(null);
  const [verSeleccion, setVerSeleccion] = useState(false);
  const [pasando, setPasando] = useState(false);

  const delGrupo = useMemo(() => evaluados.filter((e) => e.grupo_id === id), [evaluados, id]);
  const filtros = useFiltros();
  const filtradas = useMemo(() => filtrar(delGrupo, filtros.f), [delGrupo, filtros.f]);
  if (!grupo || !llamadoDelGrupo)
    return <p className="text-muted">Grupo no encontrado. <Link className="text-om underline" href="/filtro">Volver</Link></p>;
  const par = llamadoDelGrupo.parametros;
  const r = resumirGrupo(grupo, evaluados, par);

  async function eliminar() {
    if (!grupo) return;
    if (!(await confirmar(`¿Eliminar el grupo «${grupo.nombre}» y sus ${r.total} postulantes? No se puede deshacer.`))) return;
    await eliminarGrupo(grupo.id);
    router.push('/filtro');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/filtro" className="text-sm text-om hover:underline">← Grupos</Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{grupo.nombre}</h1>
          <p className="text-sm text-muted">
            {grupo.comuna} · Zona {grupo.zona_termica} · {TIPOS_PROYECTO.find((t) => t.valor === grupo.tipo_proyecto)?.etiqueta} ·{' '}
            {grupo.modalidad === 'grupal' ? 'Grupal' : 'Individual'} · {grupo.estado}
            {grupo.localidad && ` · ${grupo.localidad}`}
            {grupo.organizacion && ` · ${grupo.organizacion}`} · {llamadoDelGrupo.nombre}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton onClick={() => setEditandoGrupo(true)}>Editar grupo</Boton>
          <Boton onClick={() => setImportando(true)}>Importar Excel</Boton>
          <Boton onClick={() => exportarExcel(delGrupo, `${grupo.nombre}.xlsx`)} disabled={delGrupo.length === 0}>Exportar</Boton>
          <Boton variante="primario" onClick={() => setEditando('nuevo')}>+ Postulante</Boton>
          {grupo.proyecto_id ? (
            <Link
              href={`/obra/${grupo.proyecto_id}`}
              className="inline-flex items-center rounded-lg border border-success/40 bg-success-bg px-3.5 py-2 text-[13px] font-semibold text-success hover:underline"
            >
              Ver obra →
            </Link>
          ) : (
            <Boton variante={grupo.estado === 'Seleccionado' ? 'primario' : 'secundario'} onClick={() => setPasando(true)} disabled={r.incluidos === 0}>
              Pasar a proyecto
            </Boton>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Postulantes incluidos" valor={`${r.incluidos} / ${r.total}`} detalle={`${r.tramoPrioritario} en tramo RSH ≤${par.rshTramoPrioritario}%`} />
        <Tarjeta titulo="Puntaje grupal" valor={fmt(r.puntajeGrupal, 1)} detalle="Promedio de los incluidos" />
        <Tarjeta
          titulo="Subsidio total"
          valor={`${fmt(r.subsidioTotalUF)} UF`}
          detalle={`Asistencia técnica ${fmt(r.asistenciaTecnicaUF)} UF${r.aporteAdicionalUF > 0 ? ` · aporte familias ${fmt(r.aporteAdicionalUF, 1)} UF` : ''}`}
        />
        <Tarjeta
          titulo="Estado"
          valor={
            <span className={r.listoParaPostular ? 'text-success' : 'text-warning'}>
              {r.listoParaPostular ? 'Listo para postular' : 'Pendiente'}
            </span>
          }
          detalle={`${r.porEstado.Listo} listos · ${r.porEstado.Observado} observados · ${r.porEstado.Incompleto} incompletos · ${r.porEstado['No admisible']} no admisibles`}
        />
      </div>

      {(r.requisitos.length > 0 || r.alertas.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {r.requisitos.length > 0 && (
            <div className="rounded-card bg-white p-4 border border-line shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-ink">Requisitos del grupo</h2>
                <Boton variante="fantasma" onClick={() => setVerSeleccion((v) => !v)}>
                  {verSeleccion ? 'Ocultar sugerencia' : 'Sugerir selección →'}
                </Boton>
              </div>
              <ul className="space-y-1">
                {r.requisitos.map((q) => (
                  <Cumple key={q.texto} ok={q.cumple}>{q.texto}</Cumple>
                ))}
              </ul>
            </div>
          )}
          {r.alertas.length > 0 && (
            <div className="rounded-lg bg-warning-bg p-4 ring-1 ring-warning/30">
              <h2 className="mb-2 font-semibold text-warning">Alertas</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
                {r.alertas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {verSeleccion && grupo.modalidad === 'grupal' && <PanelSeleccion grupoId={grupo.id} evaluados={delGrupo} par={par} />}

      <PanelPromedios delGrupo={delGrupo} filtradas={filtradas} hayFiltros={filtros.activos > 0} par={par} esPDA={grupo.tipo_proyecto === 'pda'} />

      <FiltrosPostulantes filtros={filtros} esPDA={grupo.tipo_proyecto === 'pda'} />

      <TablaPostulantes
        filas={filtradas}
        onEditar={(e) => setEditando(e)}
        onIncluir={(e, v) => marcarIncluidos([e.id], v)}
      />

      {editandoGrupo && <GrupoForm grupo={grupo} onCerrar={() => setEditandoGrupo(false)} />}
      {pasando && <PasarAProyecto grupo={grupo} llamado={llamadoDelGrupo} evaluados={delGrupo} onCerrar={() => setPasando(false)} />}
      {importando && <ImportarExcel grupo={grupo} par={par} onCerrar={() => setImportando(false)} />}
      {editando && (
        <PostulanteForm
          grupo={grupo}
          par={par}
          postulante={editando === 'nuevo' ? undefined : editando}
          onCerrar={() => setEditando(null)}
        />
      )}
      <div className="pt-4">
        <Boton variante="peligro" onClick={eliminar}>Eliminar grupo</Boton>
      </div>
    </div>
  );
}

function PanelPromedios({
  delGrupo, filtradas, hayFiltros, par, esPDA,
}: {
  delGrupo: Evaluado[]; filtradas: Evaluado[]; hayFiltros: boolean; par: Parametros; esPDA: boolean;
}) {
  const [base, setBase] = useState<'incluidos' | 'todos' | 'filtrados'>('incluidos');
  const [abierto, setAbierto] = useState(true);
  const lista = base === 'incluidos' ? delGrupo.filter((e) => e.incluido) : base === 'todos' ? delGrupo : filtradas;
  const items = promediosPorItem(lista, par, esPDA);
  const datos = promediosDatos(lista);
  const n = lista.length;

  return (
    <div className="rounded-card bg-white p-4 border border-line shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="font-semibold text-ink" onClick={() => setAbierto((v) => !v)}>
          {abierto ? '▾' : '▸'} Promedios del grupo por ítem
        </button>
        <div className="inline-flex overflow-hidden rounded-md text-xs border border-line2">
          {([['incluidos', 'Incluidos'], ['todos', 'Todos'], ...(hayFiltros ? [['filtrados', 'Filtrados']] : [])] as [typeof base, string][]).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setBase(v)} className={`px-2.5 py-1 ${base === v ? 'bg-om text-white' : 'bg-white text-muted hover:bg-canvas'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {abierto && (
        n === 0 ? (
          <p className="mt-3 text-sm text-muted">Sin postulantes en esta selección.</p>
        ) : (
          <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_260px]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 pr-2">Ítem</th>
                  <th className="py-1 pr-2 text-right">Promedio</th>
                  <th className="py-1 pr-2 text-right">Máx.</th>
                  <th className="hidden py-1 pr-2 sm:table-cell" />
                  <th className="py-1 text-right">Con puntaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => {
                  const total = i.item === 'PUNTAJE TOTAL';
                  const pct = i.maximo > 0 ? Math.min(100, (i.promedio / i.maximo) * 100) : 0;
                  return (
                    <tr key={i.item} className={total ? 'font-semibold text-ink' : 'text-ink'}>
                      <td className="py-1 pr-2">{i.item}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(i.promedio, 1)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-subtle">{fmt(i.maximo)}</td>
                      <td className="hidden w-1/3 py-1 pr-2 sm:table-cell">
                        <div className="h-2 rounded-full bg-canvas">
                          <div className={`h-2 rounded-full ${total ? 'bg-om' : 'bg-om'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="py-1 text-right text-xs tabular-nums text-muted">
                        {total ? '' : `${i.conPuntaje} de ${n} (${fmt((i.conPuntaje / n) * 100)}%)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <dl className="grid grid-cols-2 gap-2 self-start text-sm lg:grid-cols-1">
              {[
                ['Tramo RSH promedio', datos.rsh != null ? `${fmt(datos.rsh, 1)}%` : '—'],
                ['Integrantes promedio', datos.integrantes != null ? fmt(datos.integrantes, 1) : '—'],
                ['Año de recepción promedio', datos.anioRecepcion != null ? String(Math.round(datos.anioRecepcion)) : '—'],
                ['Superficie promedio', datos.m2 != null ? `${fmt(datos.m2, 1)} m²` : '—'],
                ['Adultos mayores', `${fmt(datos.pctAdultoMayor)}%`],
                ['Viviendas sociales', `${fmt(datos.pctViviendaSocial)}%`],
                ['Subsidio promedio', `${fmt(datos.subsidioUF, 1)} UF`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-canvas px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )
      )}
    </div>
  );
}

function PanelSeleccion({ grupoId, evaluados, par }: { grupoId: string; evaluados: Evaluado[]; par: Parametros }) {
  const { aplicarSeleccion } = useDatos();
  const opciones = useMemo(() => opcionesSeleccion(evaluados, par), [evaluados, par]);
  const [tamano, setTamano] = useState(() => opciones.at(-1)?.tamano ?? 0);
  const [aplicando, setAplicando] = useState(false);

  if (opciones.length === 0)
    return (
      <div className="rounded-lg bg-danger-bg p-4 text-sm text-danger ring-1 ring-danger/30">
        No hay combinación posible con los criterios del llamado: se necesitan al menos {par.grupoMin ?? 1} postulantes
        admisibles{par.porcentajeMinPrioritario != null && `, con ${par.porcentajeMinPrioritario}% o más en tramo RSH ≤${par.rshTramoPrioritario}%`}.
      </div>
    );

  const opcion = opciones.find((o) => o.tamano === tamano) ?? opciones.at(-1)!;
  const elegidos = new Set(opcion.ids);
  const salen = evaluados.filter((e) => e.incluido && !elegidos.has(e.id));
  const entran = evaluados.filter((e) => !e.incluido && elegidos.has(e.id));
  const mejor = opciones.reduce((a, b) => (b.promedio > a.promedio ? b : a));

  async function aplicar() {
    if (!(await confirmar(`¿Aplicar la selección? Quedarán incluidos ${opcion.tamano} postulantes (${salen.length} salen, ${entran.length} entran).`))) return;
    setAplicando(true);
    try {
      await aplicarSeleccion(grupoId, opcion.ids);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="rounded-card bg-white shadow-card p-4 ring-1 ring-om/30">
      <h2 className="font-semibold text-ink">Selección sugerida</h2>
      <p className="mt-1 text-sm text-muted">
        Para cada tamaño de grupo se elige la combinación de postulantes admisibles con mayor puntaje grupal que cumple
        los requisitos del llamado. Más familias suele bajar el promedio: elige el equilibrio.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Familias:</span>
          <input
            type="range"
            min={opciones[0].tamano}
            max={opciones.at(-1)!.tamano}
            value={opcion.tamano}
            onChange={(e) => setTamano(Number(e.target.value))}
            className="w-56 accent-om"
          />
          <b className="w-8 tabular-nums">{opcion.tamano}</b>
        </label>
        <div className="text-sm">
          Puntaje grupal: <b className="tabular-nums">{fmt(opcion.promedio, 1)}</b>
          <span className="text-muted"> · {opcion.prioritarios} en tramo ≤{par.rshTramoPrioritario}%</span>
        </div>
        <Boton variante="fantasma" onClick={() => setTamano(mejor.tamano)}>
          Máximo puntaje ({mejor.tamano} familias, {fmt(mejor.promedio, 1)})
        </Boton>
      </div>
      <Curva opciones={opciones} actual={opcion.tamano} onElegir={setTamano} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-muted">
          {salen.length === 0 && entran.length === 0 ? (
            'La selección actual ya coincide.'
          ) : (
            <>
              Salen <b>{salen.length}</b>
              {salen.length > 0 && <span className="text-subtle"> ({salen.slice(0, 4).map((e) => e.nombre).join(', ')}{salen.length > 4 ? '…' : ''})</span>}
              {' · '}Entran <b>{entran.length}</b>
            </>
          )}
        </div>
        <Boton variante="primario" onClick={aplicar} disabled={aplicando || (salen.length === 0 && entran.length === 0)}>
          {aplicando ? 'Aplicando…' : 'Aplicar selección'}
        </Boton>
      </div>
    </div>
  );
}

function Curva({
  opciones,
  actual,
  onElegir,
}: {
  opciones: { tamano: number; promedio: number }[];
  actual: number;
  onElegir: (n: number) => void;
}) {
  const min = Math.min(...opciones.map((o) => o.promedio));
  const max = Math.max(...opciones.map((o) => o.promedio));
  const rango = Math.max(1, max - min);
  return (
    <div className="mt-4">
      <div className="flex h-20 items-end gap-px">
        {opciones.map((o) => (
          <button
            key={o.tamano}
            title={`${o.tamano} familias: ${fmt(o.promedio, 1)} pts`}
            onClick={() => onElegir(o.tamano)}
            className={`flex-1 rounded-t-sm ${o.tamano === actual ? 'bg-om' : 'bg-om/30 hover:bg-om'}`}
            style={{ height: `${15 + ((o.promedio - min) / rango) * 85}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-subtle">
        <span>{opciones[0].tamano} familias · {fmt(opciones[0].promedio, 1)} pts</span>
        <span>{opciones.at(-1)!.tamano} familias · {fmt(opciones.at(-1)!.promedio, 1)} pts</span>
      </div>
    </div>
  );
}

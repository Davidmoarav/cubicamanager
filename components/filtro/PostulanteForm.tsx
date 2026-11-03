'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useMemo, useState } from 'react';
import { useDatos } from './DataProvider';
import { confirmar } from '@/lib/avisos';
import { evaluarTodos } from '@/lib/filtro/evaluacion';
import {
  calcular, documentosExigidos, esAdultoMayorPorFecha, TECHUMBRES, TRAMOS_RSH, type Parametros, type Techumbre,
} from '@/lib/filtro/reglas';
import { formatearRut } from '@/lib/filtro/rut';
import { postulanteVacio, type Grupo, type Postulante, type PostulanteNuevo } from '@/lib/filtro/tipos';
import { Boton, Campo, Casilla, claseInput, fmt, InsigniaEstado, Modal, Seccion } from './ui';

function aEditable(p: Postulante): PostulanteNuevo {
  const { id: _id, created_at: _c, updated_at: _u, ...resto } = p;
  return resto;
}

const numeroONulo = (v: string) => (v.trim() === '' ? null : Number(v));

export function PostulanteForm({
  grupo,
  par,
  postulante,
  onCerrar,
}: {
  grupo: Grupo;
  par: Parametros;
  postulante?: Postulante;
  onCerrar: () => void;
}) {
  const { postulantes, grupos, llamados, guardarPostulante, eliminarPostulante } = useDatos();
  const [p, setP] = useState<PostulanteNuevo>(() => (postulante ? aEditable(postulante) : postulanteVacio(grupo.id)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = <K extends keyof PostulanteNuevo>(campo: K, valor: PostulanteNuevo[K]) =>
    setP((x) => ({ ...x, [campo]: valor }));

  const calculo = calcular(p, grupo, par);
  const evaluado = useMemo(() => {
    const id = postulante?.id ?? '__nuevo__';
    const borrador = { ...p, id, created_at: '', updated_at: '' };
    const otros = postulantes.filter((x) => x.id !== id);
    return evaluarTodos([...otros, borrador], grupos, llamados).find((e) => e.id === id)!;
  }, [p, postulante?.id, postulantes, grupos, llamados]);

  async function guardar() {
    if (!p.nombre.trim()) return setError('Ingresa el nombre.');
    setGuardando(true);
    setError(null);
    try {
      await guardarPostulante({ ...p, nombre: p.nombre.trim(), rut: formatearRut(p.rut) }, postulante?.id);
      onCerrar();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!postulante || !(await confirmar(`¿Eliminar a ${postulante.nombre}? Esta acción no se puede deshacer.`))) return;
    await eliminarPostulante(postulante.id);
    onCerrar();
  }

  return (
    <Modal titulo={postulante ? 'Editar postulante' : 'Nuevo postulante'} onCerrar={onCerrar} ancho="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Seccion titulo="Identificación">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre">
                <input className={claseInput} value={p.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoFocus />
              </Campo>
              <Campo etiqueta="RUT">
                <input
                  className={claseInput}
                  value={p.rut}
                  onChange={(e) => cambiar('rut', e.target.value)}
                  onBlur={() => cambiar('rut', formatearRut(p.rut))}
                  placeholder="12.345.678-9"
                />
              </Campo>
              <Campo etiqueta="Dirección">
                <input className={claseInput} value={p.direccion ?? ''} onChange={(e) => cambiar('direccion', e.target.value || null)} />
              </Campo>
              <Campo etiqueta="Teléfono">
                <input className={claseInput} value={p.telefono ?? ''} onChange={(e) => cambiar('telefono', e.target.value || null)} />
              </Campo>
              <Campo etiqueta="Fecha de nacimiento" ayuda="Si la ingresas, marca «Adulto mayor» automáticamente (7.1 N°3)">
                <input
                  type="date"
                  className={claseInput}
                  value={p.fecha_nacimiento ?? ''}
                  onChange={(e) => {
                    const fecha = e.target.value || null;
                    const am = esAdultoMayorPorFecha(fecha, par);
                    setP((x) => ({ ...x, fecha_nacimiento: fecha, adulto_mayor: am ?? x.adulto_mayor }));
                  }}
                />
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Factores de puntaje (7.1)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Tramo RSH">
                <select
                  className={claseInput}
                  value={p.rsh_tramo ?? ''}
                  onChange={(e) => cambiar('rsh_tramo', numeroONulo(e.target.value))}
                >
                  <option value="">—</option>
                  {TRAMOS_RSH.map((t) => (
                    <option key={t} value={t}>{t}%</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Integrantes grupo familiar" ayuda="Contando al postulante (1 = unipersonal)">
                <input
                  type="number" min={1} className={claseInput} value={p.integrantes ?? ''}
                  onChange={(e) => cambiar('integrantes', numeroONulo(e.target.value))}
                />
              </Campo>
              <Campo etiqueta="Integrantes con discapacidad">
                <input
                  type="number" min={0} className={claseInput} value={p.integrantes_discapacidad}
                  onChange={(e) => cambiar('integrantes_discapacidad', Number(e.target.value) || 0)}
                />
              </Campo>
              <Campo etiqueta="Año recepción final (DOM)">
                <input
                  type="number" className={claseInput} value={p.anio_recepcion ?? ''}
                  onChange={(e) => cambiar('anio_recepcion', numeroONulo(e.target.value))}
                />
              </Campo>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Casilla etiqueta="Adulto mayor" detalle={`(cumple 60+ durante ${par.anioLlamado})`} checked={p.adulto_mayor} onChange={(v) => cambiar('adulto_mayor', v)} />
              <Casilla etiqueta="Familia monoparental" checked={p.monoparental} onChange={(v) => cambiar('monoparental', v)} />
              <Casilla etiqueta="Víctima prisión política / tortura" checked={p.prision_politica} onChange={(v) => cambiar('prision_politica', v)} />
              <Casilla etiqueta="Subsistema Seguridad y Oportunidades" checked={p.seguridad_oportunidades} onChange={(v) => cambiar('seguridad_oportunidades', v)} />
              {grupo.tipo_proyecto === 'pda' && (
                <Casilla
                  etiqueta="Beneficiado recambio calefactores MMA"
                  detalle="(7.2)"
                  checked={p.recambio_calefactor_mma}
                  onChange={(v) => cambiar('recambio_calefactor_mma', v)}
                />
              )}
              {par.factoresExtra.map((f) => (
                <Casilla
                  key={f.clave}
                  etiqueta={f.etiqueta}
                  detalle={`(${f.puntos} pts)`}
                  checked={!!p.factores_extra?.[f.clave]}
                  onChange={(v) => cambiar('factores_extra', { ...p.factores_extra, [f.clave]: v })}
                />
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Vivienda (3.6) e incrementos (5.4)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Año permiso de edificación">
                <input
                  type="number" className={claseInput} value={p.anio_permiso ?? ''}
                  onChange={(e) => cambiar('anio_permiso', numeroONulo(e.target.value))}
                />
              </Campo>
              <Campo
                etiqueta="Avalúo fiscal (UF)"
                ayuda={par.avaluoMaxUF != null ? `Máx. ${par.avaluoMaxUF.toLocaleString('es-CL')} UF si no es vivienda social` : undefined}
              >
                <input
                  type="number" step="0.01" className={claseInput} value={p.avaluo_fiscal_uf ?? ''}
                  onChange={(e) => cambiar('avaluo_fiscal_uf', numeroONulo(e.target.value))}
                />
              </Campo>
              <Campo etiqueta="Cambio de techumbre">
                <select className={claseInput} value={p.techumbre} onChange={(e) => cambiar('techumbre', e.target.value as Techumbre)}>
                  {TECHUMBRES.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Superficie de la vivienda (m²)" ayuda="Se valida en Habilitación (14.3 h)">
                <input
                  type="number" step="0.01" className={claseInput} value={p.m2_vivienda ?? ''}
                  onChange={(e) => cambiar('m2_vivienda', numeroONulo(e.target.value))}
                />
              </Campo>
              <Campo etiqueta="Año de subsidio térmico previo" ayuda="Vacío si no tuvo (3.6 d)">
                <input
                  type="number" className={claseInput} value={p.subsidio_termico_previo_anio ?? ''}
                  onChange={(e) => cambiar('subsidio_termico_previo_anio', numeroONulo(e.target.value))}
                />
              </Campo>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Casilla etiqueta="Es vivienda social / SERVIU" checked={p.es_vivienda_social} onChange={(v) => cambiar('es_vivienda_social', v)} />
              <Casilla etiqueta="Requiere regularización" checked={p.requiere_regularizacion} onChange={(v) => cambiar('requiere_regularizacion', v)} />
              <Casilla etiqueta="Pisos ventilados" checked={p.pisos_ventilados} onChange={(v) => cambiar('pisos_ventilados', v)} />
              <Casilla etiqueta="Forma parte de copropiedad tipo A" detalle="(3.6 f: no admisible)" checked={p.copropiedad_tipo_a} onChange={(v) => cambiar('copropiedad_tipo_a', v)} />
              <Casilla etiqueta="Recepción por regularización Ley 20.898" detalle="(exime antigüedad 5 años, 3.6 e)" checked={p.recepcion_ley_20898} onChange={(v) => cambiar('recepcion_ley_20898', v)} />
              <Casilla etiqueta="Excepción de permiso acreditada" detalle="(OGUC 4.1.10 o informe complementario, 3.6 c)" checked={p.permiso_excepcion} onChange={(v) => cambiar('permiso_excepcion', v)} />
            </div>
          </Seccion>

          <Seccion titulo="Financiamiento (3.12 y 5.6)">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Ahorro acreditado (UF)" ayuda={`Exigido: ${calculo.ahorroUF} UF`}>
                <input
                  type="number" step="0.01" className={claseInput} value={p.ahorro_uf ?? ''}
                  onChange={(e) => cambiar('ahorro_uf', numeroONulo(e.target.value))}
                />
              </Campo>
              <Campo
                etiqueta="Costo total del proyecto (UF)"
                ayuda={p.costo_proyecto_uf != null ? `Aporte adicional: ${fmt(Math.max(0, p.costo_proyecto_uf - calculo.subsidioUF), 2)} UF` : 'Si supera el subsidio, la diferencia es aporte de la familia'}
              >
                <input
                  type="number" step="0.01" className={claseInput} value={p.costo_proyecto_uf ?? ''}
                  onChange={(e) => cambiar('costo_proyecto_uf', numeroONulo(e.target.value))}
                />
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Documentos recibidos">
            <div className="grid gap-2 sm:grid-cols-2">
              {documentosExigidos(par, p.es_vivienda_social).map((d) => (
                <Casilla
                  key={d.clave}
                  etiqueta={d.etiqueta}
                  detalle={d.clave === 'ahorro' ? `(${calculo.ahorroUF} UF)` : undefined}
                  checked={!!p.documentos[d.clave]}
                  onChange={(v) => cambiar('documentos', { ...p.documentos, [d.clave]: v })}
                />
              ))}
            </div>
          </Seccion>

          <Campo etiqueta="Observaciones">
            <textarea
              rows={2}
              className={claseInput}
              value={p.observaciones ?? ''}
              onChange={(e) => cambiar('observaciones', e.target.value || null)}
            />
          </Campo>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg bg-canvas p-4 border border-line">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Resultado</span>
              <InsigniaEstado estado={evaluado.estado} />
            </div>
            <dl className="mt-3 space-y-1 text-sm tabular-nums">
              {[
                ['RSH', calculo.pRsh],
                ['Grupo familiar', calculo.pGrupoFamiliar],
                ['Adulto mayor', calculo.pAdultoMayor],
                ['Discapacidad', calculo.pDiscapacidad],
                ['Monoparental', calculo.pMonoparental],
                ['Prisión política', calculo.pPrisionPolitica],
                ['Seg. y Oportunidades', calculo.pSeguridadOportunidades],
                ['Antigüedad', calculo.pAntiguedad],
                ...(par.factoresExtra.length > 0 ? [['Factores adicionales', calculo.pExtra]] : []),
                ['7.2 PDA', calculo.puntaje72],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line2 pt-1 font-semibold text-ink">
                <dt>Puntaje total</dt>
                <dd>{calculo.puntajeTotal}</dd>
              </div>
              <div className="flex justify-between pt-2 font-semibold text-om-dark">
                <dt>Subsidio estimado</dt>
                <dd>{fmt(calculo.subsidioUF)} UF</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Ahorro exigido</dt>
                <dd>{calculo.ahorroUF} UF</dd>
              </div>
            </dl>
          </div>
          {evaluado.hallazgos.length > 0 && (
            <ul className="space-y-1.5 text-xs">
              {evaluado.hallazgos.map((h, i) => (
                <li
                  key={i}
                  className={
                    h.severidad === 'bloqueante'
                      ? 'text-danger'
                      : h.severidad === 'pendiente'
                        ? 'text-muted'
                        : 'text-warning'
                  }
                >
                  • {h.mensaje}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {error && <p className="mt-4 rounded bg-danger-bg p-2 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-between border-t border-line pt-4">
        <div>{postulante && <Boton variante="peligro" onClick={eliminar}>Eliminar</Boton>}</div>
        <div className="flex gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

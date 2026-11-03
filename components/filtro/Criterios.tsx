'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useMemo, useState, type ReactNode } from 'react';
import { Boton, Campo, Casilla, claseInput, fmt, Modal } from './ui';
import { useDatos } from './DataProvider';
import { NuevoLlamado } from './NuevoLlamado';
import { avisar, confirmar } from '@/lib/avisos';
import { evaluarTodos, resumirGrupo } from '@/lib/filtro/evaluacion';
import {
  claveDesde, EXIGENCIAS, PARAMETROS_RES_1048_2026, puntajeAntiguedad, type Exigencia, type FilaPuntos,
  type MontosZona, type Parametros,
} from '@/lib/filtro/reglas';
import type { Llamado } from '@/lib/filtro/tipos';

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function Criterios() {
  const { llamado } = useDatos();
  if (!llamado) return <PrimerLlamado />;
  return <Editor key={llamado.id + llamado.updated_at} llamado={llamado} />;
}

function PrimerLlamado() {
  const [creando, setCreando] = useState(false);
  return (
    <div className="rounded-card bg-white shadow-card p-8 text-center border border-line">
      <p className="text-ink">No hay llamados creados.</p>
      <p className="mt-1 text-[13px] text-muted">Parte de los criterios de la Res. 1048/2026 y ajústalos a tu región o resolución.</p>
      <Boton variante="primario" className="mt-4" onClick={() => setCreando(true)}>
        Crear llamado
      </Boton>
      {creando && <NuevoLlamado onCerrar={() => setCreando(false)} />}
    </div>
  );
}

function Editor({ llamado }: { llamado: Llamado }) {
  const { guardarLlamado, eliminarLlamado, elegirLlamado, grupos, postulantes, llamados } = useDatos();
  const [p, setP] = useState<Parametros>(() => structuredClone(llamado.parametros));
  const [cabecera, setCabecera] = useState({ nombre: llamado.nombre, resolucion: llamado.resolucion ?? '', region: llamado.region ?? '' });
  const [duplicando, setDuplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = <K extends keyof Parametros>(k: K, v: Parametros[K]) => setP((x) => ({ ...x, [k]: v }));

  const gruposDelLlamado = grupos.filter((g) => g.llamado_id === llamado.id);
  const hayCambios =
    !igual(p, llamado.parametros) ||
    cabecera.nombre !== llamado.nombre ||
    cabecera.resolucion !== (llamado.resolucion ?? '') ||
    cabecera.region !== (llamado.region ?? '');

  const impacto = useMemo(() => {
    if (igual(p, llamado.parametros) || gruposDelLlamado.length === 0) return [];
    const ids = new Set(gruposDelLlamado.map((g) => g.id));
    const propios = postulantes.filter((x) => ids.has(x.grupo_id));
    const antes = evaluarTodos(propios, gruposDelLlamado, [llamado]);
    const despues = evaluarTodos(propios, gruposDelLlamado, [{ ...llamado, parametros: p }]);
    return gruposDelLlamado.map((g) => {
      const a = resumirGrupo(g, antes, llamado.parametros);
      const d = resumirGrupo(g, despues, p);
      const cambianEstado = despues.filter((e) => e.grupo_id === g.id && antes.find((x) => x.id === e.id)?.estado !== e.estado).length;
      return { grupo: g, a, d, cambianEstado };
    });
  }, [p, llamado, gruposDelLlamado, postulantes]);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      await guardarLlamado({
        nombre: cabecera.nombre.trim() || llamado.nombre, resolucion: cabecera.resolucion || null,
        region: cabecera.region || null, parametros: p, bloqueado: llamado.bloqueado, documento: llamado.documento,
      }, llamado.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarBloqueo() {
    const { nombre, resolucion, region, parametros, documento } = llamado;
    await guardarLlamado({ nombre, resolucion, region, parametros, documento, bloqueado: !llamado.bloqueado }, llamado.id);
  }

  async function eliminar() {
    if (gruposDelLlamado.length > 0) return avisar('Este llamado tiene grupos. Elimínalos o muévelos antes de borrar el llamado.');
    if (!(await confirmar(`¿Eliminar el llamado «${llamado.nombre}»?`))) return;
    await eliminarLlamado(llamado.id);
    const otro = llamados.find((l) => l.id !== llamado.id);
    if (otro) elegirLlamado(otro.id);
  }

  const bloqueado = llamado.bloqueado;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Criterios del llamado</h1>
          <p className="text-sm text-muted">
            Todo lo que define la resolución: requisitos, puntajes, montos, comunas y documentos. Al guardar se recalculan
            los {gruposDelLlamado.length} grupos de este llamado. Los demás llamados no cambian.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton onClick={() => setDuplicando(true)}>Duplicar como llamado nuevo</Boton>
          <Boton onClick={alternarBloqueo}>{bloqueado ? '🔒 Desbloquear' : 'Bloquear (llamado cerrado)'}</Boton>
          <Boton variante="peligro" onClick={eliminar}>Eliminar llamado</Boton>
        </div>
      </div>

      {bloqueado && (
        <p className="rounded-lg bg-line p-3 text-sm text-ink">
          Este llamado está bloqueado: sus criterios no se pueden modificar. Desbloquéalo si necesitas corregir algo,
          o duplícalo para una resolución nueva.
        </p>
      )}

      <fieldset disabled={bloqueado} className="space-y-5 disabled:opacity-70">
        <Bloque titulo="Llamado">
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Nombre">
              <input className={claseInput} value={cabecera.nombre} onChange={(e) => setCabecera({ ...cabecera, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Resolución">
              <input className={claseInput} value={cabecera.resolucion} onChange={(e) => setCabecera({ ...cabecera, resolucion: e.target.value })} />
            </Campo>
            <Campo etiqueta="Región">
              <input className={claseInput} value={cabecera.region} onChange={(e) => setCabecera({ ...cabecera, region: e.target.value })} />
            </Campo>
            <Campo etiqueta="Año del llamado" ayuda="Para adulto mayor y antigüedad mínima">
              <Numero valor={p.anioLlamado} onChange={(v) => cambiar('anioLlamado', v)} />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Requisitos de postulación" ayuda="Deja vacío lo que la resolución no exige.">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Campo etiqueta="RSH máx. individual (%)"><Opcional valor={p.rshMaxIndividual} onChange={(v) => cambiar('rshMaxIndividual', v)} /></Campo>
            <Campo etiqueta="RSH máx. grupal (%)"><Opcional valor={p.rshMaxGrupal} onChange={(v) => cambiar('rshMaxGrupal', v)} /></Campo>
            <Campo etiqueta="Tramo prioritario: RSH hasta (%)"><Numero valor={p.rshTramoPrioritario} onChange={(v) => cambiar('rshTramoPrioritario', v)} /></Campo>
            <Campo etiqueta="% mínimo del grupo en tramo prioritario"><Opcional valor={p.porcentajeMinPrioritario} onChange={(v) => cambiar('porcentajeMinPrioritario', v)} /></Campo>
            <Campo etiqueta="Mínimo postulantes por grupo"><Opcional valor={p.grupoMin} onChange={(v) => cambiar('grupoMin', v)} /></Campo>
            <Campo etiqueta="Máximo postulantes por grupo"><Opcional valor={p.grupoMax} onChange={(v) => cambiar('grupoMax', v)} /></Campo>
            <Campo etiqueta="Avalúo fiscal máx. (UF)" ayuda="No aplica a vivienda social"><Opcional valor={p.avaluoMaxUF} onChange={(v) => cambiar('avaluoMaxUF', v)} /></Campo>
            <Campo etiqueta="Permiso de edificación hasta el año"><Opcional valor={p.anioMaxPermiso} onChange={(v) => cambiar('anioMaxPermiso', v)} /></Campo>
            <Campo etiqueta="Antigüedad mínima (años desde recepción)"><Opcional valor={p.antiguedadMinAnios} onChange={(v) => cambiar('antiguedadMinAnios', v)} /></Campo>
            <Campo etiqueta="Ahorro adulto mayor (UF)"><Numero valor={p.ahorroAdultoMayorUF} onChange={(v) => cambiar('ahorroAdultoMayorUF', v)} /></Campo>
            <Campo etiqueta="Ahorro resto (UF)"><Numero valor={p.ahorroGeneralUF} onChange={(v) => cambiar('ahorroGeneralUF', v)} /></Campo>
            <Campo etiqueta="Subsidio térmico previo en PDA: hasta el año" ayuda="3.6 d)"><Opcional valor={p.anioMaxSubsidioPrevioPDA} onChange={(v) => cambiar('anioMaxSubsidioPrevioPDA', v)} /></Campo>
            <div className="flex items-end pb-2">
              <Casilla etiqueta="Copropiedad tipo A no admisible" checked={p.excluirCopropiedadA} onChange={(v) => cambiar('excluirCopropiedadA', v)} />
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Recursos y servicios">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo etiqueta="Recursos región AT PDA (UF)" ayuda="Resuelvo 2"><Numero valor={p.recursosRegionUF.pda} onChange={(v) => cambiar('recursosRegionUF', { ...p.recursosRegionUF, pda: v })} /></Campo>
            <Campo etiqueta="Recursos región AT Regular (UF)"><Numero valor={p.recursosRegionUF.regular} onChange={(v) => cambiar('recursosRegionUF', { ...p.recursosRegionUF, regular: v })} /></Campo>
            <Campo etiqueta="Asistencia técnica por beneficiario (UF)" ayuda="8.1"><Numero valor={p.asistenciaTecnicaUF} onChange={(v) => cambiar('asistenciaTecnicaUF', v)} /></Campo>
            <Campo etiqueta="FTO por SERVIU sobre (UF por proyecto)" ayuda="3.8"><Opcional valor={p.montoFTOServiuUF} onChange={(v) => cambiar('montoFTOServiuUF', v)} /></Campo>
          </div>
        </Bloque>

        <Bloque titulo="Puntajes (7.1 y 7.2)">
          <div className="grid gap-5 lg:grid-cols-3">
            <TablaPuntos titulo="Tramo RSH" ayuda="Coincidencia exacta del tramo" sufijo="%" filas={p.puntosRsh} onChange={(v) => cambiar('puntosRsh', v)} />
            <TablaPuntos titulo="Integrantes grupo familiar" ayuda="Desde N integrantes (la última fila vale «o más»)" filas={p.puntosGrupoFamiliar} onChange={(v) => cambiar('puntosGrupoFamiliar', v)} />
            <TablaPuntos titulo="Integrantes con discapacidad" ayuda="Desde N integrantes" filas={p.puntosDiscapacidad} onChange={(v) => cambiar('puntosDiscapacidad', v)} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Campo etiqueta="Adulto mayor"><Numero valor={p.puntosAdultoMayor} onChange={(v) => cambiar('puntosAdultoMayor', v)} /></Campo>
            <Campo etiqueta="Familia monoparental"><Numero valor={p.puntosMonoparental} onChange={(v) => cambiar('puntosMonoparental', v)} /></Campo>
            <Campo etiqueta="Prisión política y tortura"><Numero valor={p.puntosPrisionPolitica} onChange={(v) => cambiar('puntosPrisionPolitica', v)} /></Campo>
            <Campo etiqueta="Seguridad y Oportunidades"><Numero valor={p.puntosSeguridadOportunidades} onChange={(v) => cambiar('puntosSeguridadOportunidades', v)} /></Campo>
            <Campo etiqueta="7.2 Recambio calefactor MMA (PDA)"><Numero valor={p.puntosRecambioMMA} onChange={(v) => cambiar('puntosRecambioMMA', v)} /></Campo>
          </div>
          <div className="mt-5 rounded-md bg-canvas p-3">
            <div className="text-sm font-medium text-ink">Antigüedad de la vivienda</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Año de corte"><Numero valor={p.antiguedad.anioCorte} onChange={(v) => cambiar('antiguedad', { ...p.antiguedad, anioCorte: v })} /></Campo>
              <Campo etiqueta="Puntos por año"><Numero valor={p.antiguedad.puntosPorAnio} onChange={(v) => cambiar('antiguedad', { ...p.antiguedad, puntosPorAnio: v })} /></Campo>
              <Campo etiqueta="Máximo"><Numero valor={p.antiguedad.maximo} onChange={(v) => cambiar('antiguedad', { ...p.antiguedad, maximo: v })} /></Campo>
            </div>
            <p className="mt-2 text-xs text-muted">
              Puntos = (año de corte − año de recepción) × puntos por año, con tope. Ejemplos:{' '}
              {[1970, 1980, 1990, 2000, p.antiguedad.anioCorte - 1].map((a) => `${a} → ${puntajeAntiguedad(a, p)}`).join(' · ')}
            </p>
          </div>
        </Bloque>

        <Bloque titulo="Factores adicionales" ayuda="Criterios Sí/No que agregue una resolución nueva. Aparecen como casillas en la ficha del postulante.">
          <FactoresExtra p={p} onChange={(v) => cambiar('factoresExtra', v)} />
        </Bloque>

        <Bloque titulo="Montos de subsidio por zona térmica (UF)">
          <Zonas zonas={p.zonas} onChange={(v) => cambiar('zonas', v)} />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Vulnerabilidad tramo 1: RSH hasta (%)"><Numero valor={p.vulnTramo1RshMax} onChange={(v) => cambiar('vulnTramo1RshMax', v)} /></Campo>
            <Campo etiqueta="Vulnerabilidad tramo 2: RSH hasta (%)"><Numero valor={p.vulnTramo2RshMax} onChange={(v) => cambiar('vulnTramo2RshMax', v)} /></Campo>
            <div className="flex items-end pb-2">
              <Casilla etiqueta="Adulto mayor recibe tramo 1" checked={p.vulnAdultoMayorTramo1} onChange={(v) => cambiar('vulnAdultoMayorTramo1', v)} />
            </div>
          </div>
        </Bloque>

        <Bloque titulo="Comunas">
          <Comunas p={p} cambiar={cambiar} />
        </Bloque>

        <Bloque titulo="Documentos exigidos">
          <Documentos p={p} onChange={(v) => cambiar('documentos', v)} />
        </Bloque>
      </fieldset>

      {impacto.length > 0 && (
        <Bloque titulo="Vista previa del impacto">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-2 py-1">Grupo</th>
                  <th className="px-2 py-1 text-right">Puntaje antes</th>
                  <th className="px-2 py-1 text-right">Después</th>
                  <th className="px-2 py-1 text-right">Subsidio UF antes → después</th>
                  <th className="px-2 py-1">Requisitos</th>
                  <th className="px-2 py-1 text-right">Postulantes que cambian de estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {impacto.map(({ grupo, a, d, cambianEstado }) => (
                  <tr key={grupo.id}>
                    <td className="px-2 py-1">{grupo.nombre}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(a.puntajeGrupal, 1)}</td>
                    <td className={`px-2 py-1 text-right font-semibold tabular-nums ${d.puntajeGrupal > a.puntajeGrupal ? 'text-success' : d.puntajeGrupal < a.puntajeGrupal ? 'text-danger' : ''}`}>
                      {fmt(d.puntajeGrupal, 1)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(a.subsidioTotalUF)} → {fmt(d.subsidioTotalUF)}</td>
                    <td className="px-2 py-1">
                      {a.cumpleRequisitos === d.cumpleRequisitos ? (d.cumpleRequisitos ? 'Cumple' : 'No cumple') : d.cumpleRequisitos ? <span className="text-success">Pasa a cumplir</span> : <span className="text-danger">Deja de cumplir</span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{cambianEstado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloque>
      )}

      {!bloqueado && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="text-sm text-muted">
              {error ? <span className="text-danger">{error}</span> : hayCambios ? 'Hay cambios sin guardar.' : 'Sin cambios.'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="fantasma"
                onClick={async () => { if (await confirmar('¿Reemplazar todos los criterios por los de la Res. Ex. N°1048/2026? No se guarda hasta que presiones Guardar.')) setP(structuredClone(PARAMETROS_RES_1048_2026)) }}
              >
                Valores Res. 1048
              </Boton>
              <Boton disabled={!hayCambios} onClick={() => { setP(structuredClone(llamado.parametros)); setCabecera({ nombre: llamado.nombre, resolucion: llamado.resolucion ?? '', region: llamado.region ?? '' }); }}>
                Descartar
              </Boton>
              <Boton variante="primario" disabled={!hayCambios || guardando} onClick={guardar}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Boton>
            </div>
          </div>
        </div>
      )}

      {duplicando && <NuevoLlamado desde={{ llamadoId: llamado.id, parametros: p }} onCerrar={() => setDuplicando(false)} />}
    </div>
  );
}

// ---------- Piezas del editor ----------

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-white p-5 border border-line shadow-card">
      <h2 className="font-semibold text-ink">{titulo}</h2>
      {ayuda && <p className="text-xs text-muted">{ayuda}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Numero({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return <input type="number" step="any" className={claseInput} value={valor} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
}

function Opcional({ valor, onChange }: { valor: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      step="any"
      className={claseInput}
      placeholder="No se exige"
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

const botonQuitar = 'rounded px-1.5 text-subtle hover:bg-danger-bg hover:text-danger';
const botonAgregar = 'mt-2 text-sm font-medium text-om hover:underline';

function TablaPuntos({
  titulo, ayuda, sufijo = '', filas, onChange,
}: {
  titulo: string; ayuda: string; sufijo?: string; filas: FilaPuntos[]; onChange: (f: FilaPuntos[]) => void;
}) {
  const set = (i: number, cambio: Partial<FilaPuntos>) => onChange(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  return (
    <div>
      <div className="text-sm font-medium text-ink">{titulo}</div>
      <div className="mb-2 text-xs text-muted">{ayuda}</div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr><th className="text-left font-normal">Valor{sufijo && ` (${sufijo})`}</th><th className="text-left font-normal">Puntos</th><th /></tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td className="py-0.5 pr-2"><input type="number" className={claseInput} value={f.valor} onChange={(e) => set(i, { valor: Number(e.target.value) || 0 })} /></td>
              <td className="py-0.5 pr-2"><input type="number" className={claseInput} value={f.puntos} onChange={(e) => set(i, { puntos: Number(e.target.value) || 0 })} /></td>
              <td><button type="button" className={botonQuitar} onClick={() => onChange(filas.filter((_, j) => j !== i))} aria-label="Quitar fila">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className={botonAgregar} onClick={() => onChange([...filas, { valor: (filas.at(-1)?.valor ?? 0) + 1, puntos: 0 }])}>
        + Agregar fila
      </button>
    </div>
  );
}

const CAMPOS_ZONA: { clave: keyof Omit<MontosZona, 'zona'>; etiqueta: string }[] = [
  { clave: 'base', etiqueta: 'Base' },
  { clave: 'vulnerabilidadTramo1', etiqueta: 'Vuln. tramo 1' },
  { clave: 'vulnerabilidadTramo2', etiqueta: 'Vuln. tramo 2' },
  { clave: 'regularizacion', etiqueta: 'Regularización' },
  { clave: 'pisosVentilados', etiqueta: 'Pisos ventilados' },
  { clave: 'techoSinAsbesto', etiqueta: 'Techo s/asbesto' },
  { clave: 'techoConAsbesto', etiqueta: 'Techo c/asbesto' },
  { clave: 'maximo', etiqueta: 'Máximo' },
];

function Zonas({ zonas, onChange }: { zonas: MontosZona[]; onChange: (z: MontosZona[]) => void }) {
  const set = (i: number, cambio: Partial<MontosZona>) => onChange(zonas.map((z, j) => (j === i ? { ...z, ...cambio } : z)));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-1 text-left font-normal">Zona</th>
            {CAMPOS_ZONA.map((c) => <th key={c.clave} className="px-1 text-left font-normal">{c.etiqueta}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {zonas.map((z, i) => (
            <tr key={i}>
              <td className="px-1 py-0.5"><input className={`${claseInput} w-20`} value={z.zona} onChange={(e) => set(i, { zona: e.target.value })} /></td>
              {CAMPOS_ZONA.map((c) => (
                <td key={c.clave} className="px-1 py-0.5">
                  <input type="number" step="any" className={`${claseInput} w-24`} value={z[c.clave]} onChange={(e) => set(i, { [c.clave]: Number(e.target.value) || 0 })} />
                </td>
              ))}
              <td><button type="button" className={botonQuitar} onClick={() => onChange(zonas.filter((_, j) => j !== i))} aria-label="Quitar zona">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={botonAgregar}
        onClick={() => onChange([...zonas, { zona: '', base: 0, vulnerabilidadTramo1: 0, vulnerabilidadTramo2: 0, regularizacion: 0, pisosVentilados: 0, techoSinAsbesto: 0, techoConAsbesto: 0, maximo: 0 }])}
      >
        + Agregar zona
      </button>
      <p className="mt-1 text-xs text-muted">Máximo en 0 = sin tope (se suma base más incrementos).</p>
    </div>
  );
}

function FactoresExtra({ p, onChange }: { p: Parametros; onChange: (f: Parametros['factoresExtra']) => void }) {
  const filas = p.factoresExtra;
  const set = (i: number, cambio: Partial<Parametros['factoresExtra'][number]>) => onChange(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  return (
    <div>
      {filas.length === 0 && <p className="text-sm text-muted">Sin factores adicionales.</p>}
      {filas.map((f, i) => (
        <div key={f.clave} className="mb-1 flex items-center gap-2">
          <input className={claseInput} value={f.etiqueta} onChange={(e) => set(i, { etiqueta: e.target.value })} placeholder="Nombre del criterio" />
          <input type="number" className={`${claseInput} w-28`} value={f.puntos} onChange={(e) => set(i, { puntos: Number(e.target.value) || 0 })} />
          <span className="text-xs text-muted">pts</span>
          <button type="button" className={botonQuitar} onClick={() => onChange(filas.filter((_, j) => j !== i))} aria-label="Quitar factor">✕</button>
        </div>
      ))}
      <button
        type="button"
        className={botonAgregar}
        onClick={() => {
          const etiqueta = prompt('Nombre del nuevo criterio (p. ej. «Postulante cuidador/a»):');
          if (!etiqueta?.trim()) return;
          let clave = claveDesde(etiqueta) || 'factor';
          while (filas.some((f) => f.clave === clave)) clave += '_';
          onChange([...filas, { clave, etiqueta: etiqueta.trim(), puntos: 0 }]);
        }}
      >
        + Agregar factor
      </button>
    </div>
  );
}

function Documentos({ p, onChange }: { p: Parametros; onChange: (d: Parametros['documentos']) => void }) {
  const filas = p.documentos;
  const set = (i: number, cambio: Partial<Parametros['documentos'][number]>) => onChange(filas.map((d, j) => (j === i ? { ...d, ...cambio } : d)));
  return (
    <div>
      {filas.map((d, i) => (
        <div key={d.clave} className="mb-1 flex items-center gap-2">
          <input className={claseInput} value={d.etiqueta} onChange={(e) => set(i, { etiqueta: e.target.value })} />
          <select className={`${claseInput} w-64`} value={d.exigir} onChange={(e) => set(i, { exigir: e.target.value as Exigencia })}>
            {EXIGENCIAS.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
          </select>
          <button type="button" className={botonQuitar} onClick={() => onChange(filas.filter((_, j) => j !== i))} aria-label="Quitar documento">✕</button>
        </div>
      ))}
      <button
        type="button"
        className={botonAgregar}
        onClick={() => {
          const etiqueta = prompt('Nombre del documento:');
          if (!etiqueta?.trim()) return;
          let clave = claveDesde(etiqueta) || 'documento';
          while (filas.some((d) => d.clave === clave)) clave += '_';
          onChange([...filas, { clave, etiqueta: etiqueta.trim(), exigir: 'siempre' }]);
        }}
      >
        + Agregar documento
      </button>
    </div>
  );
}

function Comunas({ p, cambiar }: { p: Parametros; cambiar: <K extends keyof Parametros>(k: K, v: Parametros[K]) => void }) {
  const [texto, setTexto] = useState(p.comunas.join('\n'));
  const actualizarLista = (t: string) => {
    setTexto(t);
    cambiar('comunas', t.split('\n').map((c) => c.trim()).filter(Boolean));
  };
  const alternarPDA = (c: string, v: boolean) =>
    cambiar('comunasPDA', v ? [...p.comunasPDA, c] : p.comunasPDA.filter((x) => x !== c));
  const setExcepcion = (i: number, cambio: Partial<Parametros['zonaPorComuna'][number]>) =>
    cambiar('zonaPorComuna', p.zonaPorComuna.map((z, j) => (j === i ? { ...z, ...cambio } : z)));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Campo etiqueta="Comunas del llamado (una por línea)">
        <textarea rows={12} className={claseInput} value={texto} onChange={(e) => actualizarLista(e.target.value)} />
      </Campo>
      <div>
        <div className="mb-1 text-xs font-medium text-muted">Comunas con PDA vigente</div>
        <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-line p-2">
          {p.comunas.map((c) => (
            <Casilla key={c} etiqueta={c} checked={p.comunasPDA.includes(c)} onChange={(v) => alternarPDA(c, v)} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-muted">Comunas con zona térmica distinta</div>
        {p.zonaPorComuna.map((z, i) => (
          <div key={i} className="mb-1 flex items-center gap-2">
            <select className={claseInput} value={z.comuna} onChange={(e) => setExcepcion(i, { comuna: e.target.value })}>
              {p.comunas.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className={`${claseInput} w-28`} value={z.zona} onChange={(e) => setExcepcion(i, { zona: e.target.value })}>
              {p.zonas.map((x) => <option key={x.zona}>{x.zona}</option>)}
            </select>
            <button type="button" className={botonQuitar} onClick={() => cambiar('zonaPorComuna', p.zonaPorComuna.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
          </div>
        ))}
        <button
          type="button"
          className={botonAgregar}
          onClick={() => cambiar('zonaPorComuna', [...p.zonaPorComuna, { comuna: p.comunas[0] ?? '', zona: p.zonas[0]?.zona ?? '' }])}
        >
          + Agregar excepción
        </button>
      </div>
    </div>
  );
}

'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Boton, Campo, claseInput } from './ui';
import { useDatos } from './DataProvider';
import { confirmar } from '@/lib/avisos';
import { DOCUMENTO_RES_1048_2026 } from '@/lib/filtro/documentoRes1048';
import type { Llamado, SeccionDocumento } from '@/lib/filtro/tipos';

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function resaltar(texto: string, busqueda: string): ReactNode {
  const q = normalizar(busqueda.trim());
  if (!q) return texto;
  const base = normalizar(texto);
  const partes: ReactNode[] = [];
  let desde = 0;
  for (let i = base.indexOf(q); i >= 0; i = base.indexOf(q, i + q.length)) {
    partes.push(texto.slice(desde, i), <mark key={i} className="rounded bg-warning/30 px-0.5">{texto.slice(i, i + q.length)}</mark>);
    desde = i + q.length;
  }
  partes.push(texto.slice(desde));
  return partes;
}

/** Párrafos, viñetas («- ») y tablas («| a | b |», la primera fila es el encabezado). */
function Contenido({ texto, busqueda }: { texto: string; busqueda: string }) {
  const bloques: { tipo: 'p' | 'ul' | 'tabla'; lineas: string[] }[] = [];
  for (const cruda of texto.split('\n')) {
    const linea = cruda.trim();
    if (!linea) {
      bloques.push({ tipo: 'p', lineas: [] });
      continue;
    }
    const tipo = linea.startsWith('|') ? 'tabla' : linea.startsWith('- ') ? 'ul' : 'p';
    const ultimo = bloques.at(-1);
    if (ultimo && ultimo.tipo === tipo && tipo !== 'p') ultimo.lineas.push(linea);
    else bloques.push({ tipo, lineas: [linea] });
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      {bloques.map((b, i) => {
        if (b.lineas.length === 0) return null;
        if (b.tipo === 'ul')
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lineas.map((l, j) => <li key={j}>{resaltar(l.slice(2), busqueda)}</li>)}
            </ul>
          );
        if (b.tipo === 'tabla') {
          const filas = b.lineas.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
          return (
            <div key={i} className="overflow-x-auto">
              <table className="min-w-full border border-line text-xs">
                <thead className="bg-canvas text-muted">
                  <tr>{filas[0].map((c, j) => <th key={j} className="border border-line px-2 py-1 text-left font-semibold">{resaltar(c, busqueda)}</th>)}</tr>
                </thead>
                <tbody>
                  {filas.slice(1).map((f, j) => (
                    <tr key={j} className={f[0]?.toUpperCase().startsWith('TOTAL') ? 'bg-canvas font-semibold' : ''}>
                      {f.map((c, k) => <td key={k} className="border border-line px-2 py-1 tabular-nums">{resaltar(c, busqueda)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{b.lineas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{resaltar(l, busqueda)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export function Resolucion() {
  const { llamado } = useDatos();
  if (!llamado) return null;
  return <Vista key={llamado.id + llamado.updated_at} llamado={llamado} />;
}

function Vista({ llamado }: { llamado: Llamado }) {
  const { guardarLlamado, llamados } = useDatos();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<SeccionDocumento[]>(() => structuredClone(llamado.documento ?? []));
  const [error, setError] = useState<string | null>(null);

  const secciones = editando ? borrador : llamado.documento ?? [];
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return secciones;
    return secciones.filter((s) => normalizar(`${s.numeral} ${s.titulo} ${s.contenido} ${s.enApp ?? ''}`).includes(q));
  }, [secciones, busqueda]);

  async function guardarDocumento(documento: SeccionDocumento[] | null) {
    setError(null);
    try {
      const { nombre, resolucion, region, parametros, bloqueado } = llamado;
      await guardarLlamado({ nombre, resolucion, region, parametros, bloqueado, documento }, llamado.id);
      setEditando(false);
    } catch (e) {
      setError(`${(e as Error).message}. Si dice que falta una columna, avisa al administrador (sql/50_filtro_ds27.sql).`);
    }
  }

  const set = (i: number, cambio: Partial<SeccionDocumento>) => setBorrador((b) => b.map((s, j) => (j === i ? { ...s, ...cambio } : s)));
  const mover = (i: number, d: number) =>
    setBorrador((b) => {
      const c = [...b];
      const [s] = c.splice(i, 1);
      c.splice(Math.max(0, Math.min(c.length, i + d)), 0, s);
      return c;
    });

  if (!llamado.documento && !editando) {
    const otros = llamados.filter((l) => l.id !== llamado.id && l.documento?.length);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Resolución</h1>
        <div className="rounded-card bg-white shadow-card p-8 text-center border border-line">
          <p className="text-ink">Este llamado aún no tiene cargado el texto de su resolución.</p>
          {llamado.bloqueado ? (
            <p className="mt-2 text-sm text-muted">El llamado está bloqueado: desbloquéalo en Criterios para cargarlo.</p>
          ) : (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Boton variante="primario" onClick={() => guardarDocumento(structuredClone(DOCUMENTO_RES_1048_2026))}>
                Cargar texto de la Res. Ex. N°1048/2026
              </Boton>
              {otros.map((o) => (
                <Boton key={o.id} onClick={() => guardarDocumento(structuredClone(o.documento))}>Copiar desde «{o.nombre}»</Boton>
              ))}
              <Boton onClick={() => { setBorrador([]); setEditando(true); }}>Empezar en blanco</Boton>
            </div>
          )}
          {error && <p className="mt-4 rounded bg-danger-bg p-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Resolución</h1>
          <p className="text-sm text-muted">
            {llamado.resolucion ?? llamado.nombre} · resumen por capítulo y numeral. En cada uno se indica dónde se aplica en la app.
          </p>
        </div>
        {!llamado.bloqueado && !editando && <Boton onClick={() => { setBorrador(structuredClone(llamado.documento ?? [])); setEditando(true); }}>Editar texto</Boton>}
        {editando && (
          <div className="flex gap-2">
            <Boton onClick={() => setEditando(false)}>Cancelar</Boton>
            <Boton variante="primario" onClick={() => guardarDocumento(borrador)}>Guardar texto</Boton>
          </div>
        )}
      </div>
      {error && <p className="rounded bg-danger-bg p-2 text-sm text-danger">{error}</p>}

      <input
        className={claseInput}
        placeholder="Buscar en la resolución (p. ej. «avalúo», «ahorro», «70%», «copropiedad»)…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {busqueda && <p className="text-xs text-muted">{visibles.length} de {secciones.length} secciones contienen «{busqueda}».</p>}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <nav className="hidden lg:block">
          <ul className="sticky top-4 space-y-0.5 text-sm">
            {visibles.map((s) => (
              <li key={s.id}>
                <a href={`#sec-${s.id}`} className="block rounded px-2 py-1 text-muted hover:bg-white hover:text-om-dark">
                  <span className="font-medium text-ink">{s.numeral}</span> {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {visibles.map((s) => {
            const i = borrador.indexOf(s);
            return (
              <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-4 rounded-card bg-white p-5 border border-line shadow-card">
                {editando ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
                      <Campo etiqueta="Numeral"><input className={claseInput} value={s.numeral} onChange={(e) => set(i, { numeral: e.target.value })} /></Campo>
                      <Campo etiqueta="Título"><input className={claseInput} value={s.titulo} onChange={(e) => set(i, { titulo: e.target.value })} /></Campo>
                      <div className="flex items-end gap-1">
                        <Boton variante="fantasma" onClick={() => mover(i, -1)} aria-label="Subir">↑</Boton>
                        <Boton variante="fantasma" onClick={() => mover(i, 1)} aria-label="Bajar">↓</Boton>
                        <Boton variante="peligro" onClick={async () => { if (await confirmar(`¿Quitar «${s.titulo}»?`)) setBorrador((b) => b.filter((x) => x !== s)) }}>Quitar</Boton>
                      </div>
                    </div>
                    <Campo etiqueta="Contenido" ayuda="Línea en blanco = párrafo nuevo · «- » = viñeta · «| a | b |» = fila de tabla (la primera es el encabezado)">
                      <textarea rows={Math.min(24, Math.max(6, s.contenido.split('\n').length + 1))} className={`${claseInput} font-mono text-xs`} value={s.contenido} onChange={(e) => set(i, { contenido: e.target.value })} />
                    </Campo>
                    <Campo etiqueta="Dónde se aplica en la app (opcional)">
                      <input className={claseInput} value={s.enApp ?? ''} onChange={(e) => set(i, { enApp: e.target.value || undefined })} />
                    </Campo>
                  </div>
                ) : (
                  <>
                    <h2 className="text-base font-semibold text-ink">
                      <span className="mr-2 rounded bg-om-bg px-1.5 py-0.5 text-sm text-om-dark">{resaltar(s.numeral, busqueda)}</span>
                      {resaltar(s.titulo, busqueda)}
                    </h2>
                    <div className="mt-3"><Contenido texto={s.contenido} busqueda={busqueda} /></div>
                    {s.enApp && (
                      <p className="mt-3 rounded-md bg-om-bg px-3 py-2 text-xs text-om-dark">
                        <b>En la app:</b> {resaltar(s.enApp, busqueda)}
                      </p>
                    )}
                  </>
                )}
              </section>
            );
          })}
          {editando && (
            <Boton
              onClick={() => setBorrador((b) => [...b, { id: crypto.randomUUID(), numeral: '', titulo: 'Nueva sección', contenido: '' }])}
            >
              + Agregar sección
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

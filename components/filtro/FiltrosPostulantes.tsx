'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ESTADOS, type Evaluado } from '@/lib/filtro/evaluacion';
import { CLAVES, type Filtros } from '@/lib/filtro/filtros';

import { TRAMOS_RSH } from '@/lib/filtro/reglas';
import type { Grupo } from '@/lib/filtro/tipos';
import { Boton, claseInput } from './ui';

export { filtrar, type Filtros } from '@/lib/filtro/filtros';

/** Filtros guardados en la URL, para poder compartir o volver a una vista filtrada. */
export function useFiltros() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setParams = (p: URLSearchParams) => {
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const f = Object.fromEntries(CLAVES.map((k) => [k, params?.get(k) ?? ''])) as Filtros;
  const set = (k: keyof Filtros, v: string) => {
    const p = new URLSearchParams(params?.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };
  const limpiar = () => setParams(new URLSearchParams());
  const activos = CLAVES.filter((k) => f[k]).length;
  return { f, set, limpiar, activos };
}


function Rango({
  etiqueta, desde, hasta, onDesde, onHasta, opciones, sufijo,
}: {
  etiqueta: string; desde: string; hasta: string; onDesde: (v: string) => void; onHasta: (v: string) => void;
  opciones?: number[]; sufijo?: string;
}) {
  const campo = (valor: string, onChange: (v: string) => void, placeholder: string) =>
    opciones ? (
      <select className={claseInput} value={valor} onChange={(e) => onChange(e.target.value)} aria-label={`${etiqueta} ${placeholder}`}>
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o} value={o}>{o}{sufijo}</option>)}
      </select>
    ) : (
      <input type="number" className={claseInput} placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} aria-label={`${etiqueta} ${placeholder}`} />
    );
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{etiqueta}</div>
      <div className="flex items-center gap-1.5">
        {campo(desde, onDesde, 'desde')}
        <span className="text-subtle">–</span>
        {campo(hasta, onHasta, 'hasta')}
      </div>
    </div>
  );
}

function SiNo({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{etiqueta}</div>
      <div className="inline-flex overflow-hidden rounded-md border border-line2">
        {[['', 'Todos'], ['si', 'Sí'], ['no', 'No']].map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 text-xs ${valor === v ? 'bg-om text-white' : 'bg-white text-muted hover:bg-canvas'}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FiltrosPostulantes({
  filtros,
  grupos,
  comunas,
  esPDA = true,
}: {
  filtros: ReturnType<typeof useFiltros>;
  grupos?: Grupo[];
  comunas?: string[];
  esPDA?: boolean;
}) {
  const { f, set, limpiar, activos } = filtros;
  const [abierto, setAbierto] = useState(() => activos > 0 && !!(f.rshDesde || f.rshHasta || f.ptsDesde || f.am || f.intDesde));

  return (
    <div className="space-y-3 rounded-card bg-white p-3 border border-line shadow-card">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input className={`${claseInput} lg:col-span-2`} placeholder="Buscar nombre o RUT…" value={f.q} onChange={(e) => set('q', e.target.value)} />
        {grupos && (
          <select className={claseInput} value={f.grupo} onChange={(e) => set('grupo', e.target.value)}>
            <option value="">Todos los grupos</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
        {comunas && (
          <select className={claseInput} value={f.comuna} onChange={(e) => set('comuna', e.target.value)}>
            <option value="">Todas las comunas</option>
            {comunas.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <select className={claseInput} value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={claseInput} value={f.incl} onChange={(e) => set('incl', e.target.value)}>
          <option value="">Incluidos y excluidos</option>
          <option value="si">Solo incluidos</option>
          <option value="no">Solo excluidos</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="fantasma" onClick={() => setAbierto((v) => !v)}>
          {abierto ? '▾' : '▸'} Más filtros (rangos y características)
        </Boton>
        {activos > 0 && (
          <Boton variante="fantasma" onClick={limpiar}>
            Limpiar {activos} filtro{activos > 1 ? 's' : ''}
          </Boton>
        )}
      </div>

      {abierto && (
        <div className="space-y-4 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Rango etiqueta="Tramo RSH" opciones={TRAMOS_RSH} sufijo="%" desde={f.rshDesde} hasta={f.rshHasta} onDesde={(v) => set('rshDesde', v)} onHasta={(v) => set('rshHasta', v)} />
            <Rango etiqueta="Puntaje total" desde={f.ptsDesde} hasta={f.ptsHasta} onDesde={(v) => set('ptsDesde', v)} onHasta={(v) => set('ptsHasta', v)} />
            <Rango etiqueta="Integrantes del grupo familiar" desde={f.intDesde} hasta={f.intHasta} onDesde={(v) => set('intDesde', v)} onHasta={(v) => set('intHasta', v)} />
            <Rango etiqueta="Año de recepción" desde={f.anioDesde} hasta={f.anioHasta} onDesde={(v) => set('anioDesde', v)} onHasta={(v) => set('anioHasta', v)} />
            <Rango etiqueta="Subsidio (UF)" desde={f.ufDesde} hasta={f.ufHasta} onDesde={(v) => set('ufDesde', v)} onHasta={(v) => set('ufHasta', v)} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <SiNo etiqueta="Adulto mayor" valor={f.am} onChange={(v) => set('am', v)} />
            <SiNo etiqueta="Con discapacidad" valor={f.disc} onChange={(v) => set('disc', v)} />
            <SiNo etiqueta="Monoparental" valor={f.mono} onChange={(v) => set('mono', v)} />
            <SiNo etiqueta="Prisión política" valor={f.pris} onChange={(v) => set('pris', v)} />
            <SiNo etiqueta="Seg. y Oportunidades" valor={f.sego} onChange={(v) => set('sego', v)} />
            {esPDA && <SiNo etiqueta="Recambio MMA" valor={f.mma} onChange={(v) => set('mma', v)} />}
            <SiNo etiqueta="Vivienda social" valor={f.vs} onChange={(v) => set('vs', v)} />
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Documentos</div>
              <select className={`${claseInput} py-1 text-xs`} value={f.docs} onChange={(e) => set('docs', e.target.value)}>
                <option value="">Todos</option>
                <option value="faltan">Con faltantes</option>
                <option value="completos">Completos</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

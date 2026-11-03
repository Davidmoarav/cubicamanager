'use client'
// Módulo Filtro DS27 Cap. IV: crear un llamado distinto (otra región, otro año u otra resolución).
// Parte de los criterios de la Res. 1048 o de un llamado existente; después se ajustan en «Criterios».
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boton, Campo, claseInput, Modal } from './ui';
import { useDatos } from './DataProvider';
import { PARAMETROS_RES_1048_2026, type Parametros } from '@/lib/filtro/reglas';
import { DOCUMENTO_RES_1048_2026 } from '@/lib/filtro/documentoRes1048';

const RES_1048 = 'res1048';

export function NuevoLlamado({
  onCerrar,
  desde,
}: {
  onCerrar: () => void;
  /** Al duplicar desde «Criterios»: el llamado abierto, con los criterios que se ven en pantalla. */
  desde?: { llamadoId: string; parametros: Parametros };
}) {
  const { llamados, guardarLlamado, elegirLlamado } = useDatos();
  const router = useRouter();

  const datosBase = (base: string) => {
    const l = llamados.find((x) => x.id === base);
    if (!l) {
      return {
        parametros: PARAMETROS_RES_1048_2026, documento: DOCUMENTO_RES_1048_2026,
        resolucion: 'Res. Ex. N°1048 del 14.07.2026', region: 'Maule',
      };
    }
    return {
      parametros: desde?.llamadoId === l.id ? desde.parametros : l.parametros,
      documento: l.documento,
      // Un llamado nuevo es otra resolución: el número se escribe de nuevo
      resolucion: '',
      region: l.region ?? '',
    };
  };
  const sugerirNombre = (anio: number, region: string) => `DS27 Cap. IV ${anio} – ${region.trim() || 'Región'}`;

  const baseInicial = desde?.llamadoId ?? RES_1048;
  const inicial = datosBase(baseInicial);
  const [base, setBase] = useState(baseInicial);
  const [resolucion, setResolucion] = useState(inicial.resolucion);
  const [region, setRegion] = useState(inicial.region);
  const [anio, setAnio] = useState(inicial.parametros.anioLlamado);
  const [nombre, setNombre] = useState(sugerirNombre(inicial.parametros.anioLlamado, inicial.region));
  const [nombreEscrito, setNombreEscrito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nombreRepetido = llamados.some((l) => l.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

  function cambiarBase(b: string) {
    const d = datosBase(b);
    setBase(b);
    setResolucion(d.resolucion);
    setRegion(d.region);
    setAnio(d.parametros.anioLlamado);
    if (!nombreEscrito) setNombre(sugerirNombre(d.parametros.anioLlamado, d.region));
  }

  async function crear() {
    setError(null);
    setGuardando(true);
    try {
      const d = datosBase(base);
      const l = await guardarLlamado({
        nombre: nombre.trim(), resolucion: resolucion.trim() || null, region: region.trim() || null,
        parametros: { ...structuredClone(d.parametros), anioLlamado: anio }, bloqueado: false,
        documento: d.documento ? structuredClone(d.documento) : null,
      });
      elegirLlamado(l.id);
      onCerrar();
      router.push('/filtro/criterios');
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={desde ? 'Duplicar como llamado nuevo' : 'Nuevo llamado'} onCerrar={onCerrar} ancho="max-w-lg">
      <p className="text-[13px] text-muted">
        Cada llamado tiene sus propios criterios y sus propios grupos. Elige de dónde copiar los criterios y el texto
        de la resolución; después ajusta lo que cambie en «Criterios» y «Resolución». Los demás llamados no se tocan.
      </p>
      <div className="mt-4 space-y-3">
        <Campo etiqueta="Partir de">
          <select className={claseInput} value={base} onChange={(e) => cambiarBase(e.target.value)}>
            <option value={RES_1048}>Criterios de la Res. Ex. N°1048/2026</option>
            {llamados.map((l) => (
              <option key={l.id} value={l.id}>Copia de «{l.nombre}»</option>
            ))}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Región">
            <input
              className={claseInput}
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                if (!nombreEscrito) setNombre(sugerirNombre(anio, e.target.value));
              }}
            />
          </Campo>
          <Campo etiqueta="Año del llamado">
            <input
              type="number"
              className={claseInput}
              value={anio}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setAnio(v);
                if (!nombreEscrito) setNombre(sugerirNombre(v, region));
              }}
            />
          </Campo>
        </div>
        <Campo etiqueta="Resolución">
          <input className={claseInput} value={resolucion} onChange={(e) => setResolucion(e.target.value)} placeholder="Res. Ex. N°… del …" />
        </Campo>
        <Campo etiqueta="Nombre" ayuda={nombreRepetido ? 'Ya hay un llamado con este nombre.' : undefined}>
          <input
            className={claseInput}
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setNombreEscrito(true); }}
          />
        </Campo>
      </div>
      {error && <p className="mt-3 rounded-lg bg-danger-bg p-2 text-[13px] text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" onClick={crear} disabled={!nombre.trim() || nombreRepetido || guardando}>
          {guardando ? 'Creando…' : 'Crear llamado'}
        </Boton>
      </div>
    </Modal>
  );
}

'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { useState } from 'react';
import { useDatos } from './DataProvider';
import { completarParametros, TIPOS_PROYECTO, zonaSugerida, type Modalidad, type TipoProyecto } from '@/lib/filtro/reglas';
import { ESTADOS_GRUPO, type EstadoGrupo, type Grupo, type GrupoNuevo } from '@/lib/filtro/tipos';
import { Boton, Campo, Casilla, claseInput, Modal } from './ui';

export function GrupoForm({
  grupo,
  onCerrar,
  onGuardado,
}: {
  grupo?: Grupo;
  onCerrar: () => void;
  onGuardado?: (g: Grupo) => void;
}) {
  const { guardarGrupo, llamado, llamados } = useDatos();
  const [g, setG] = useState<GrupoNuevo>(() => {
    if (grupo) return {
          llamado_id: grupo.llamado_id,
          nombre: grupo.nombre, codigo: grupo.codigo, comuna: grupo.comuna, zona_termica: grupo.zona_termica,
          tipo_proyecto: grupo.tipo_proyecto, modalidad: grupo.modalidad, organizacion: grupo.organizacion,
          representacion: grupo.representacion ?? null, personalidad_juridica_vigente: grupo.personalidad_juridica_vigente ?? false,
          localidad: grupo.localidad ?? null, localidad_mas_5000: grupo.localidad_mas_5000 ?? false,
          estado: grupo.estado, observaciones: grupo.observaciones,
        };
    const inicial = completarParametros(llamado?.parametros);
    const comuna = inicial.comunas[0] ?? '';
    return {
      llamado_id: llamado?.id ?? '',
      nombre: '', codigo: null, comuna,
      zona_termica: zonaSugerida(inicial, comuna) ?? inicial.zonas[0]?.zona ?? '',
      tipo_proyecto: inicial.comunasPDA.includes(comuna) ? 'pda' : 'regular',
      modalidad: 'grupal', organizacion: null, estado: 'En preparación', observaciones: null,
      representacion: null, personalidad_juridica_vigente: false, localidad: null, localidad_mas_5000: false,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const cambiar = <K extends keyof GrupoNuevo>(campo: K, valor: GrupoNuevo[K]) => setG((x) => ({ ...x, [campo]: valor }));

  const par = completarParametros(llamados.find((l) => l.id === g.llamado_id)?.parametros);
  const comunas = par.comunas.includes(g.comuna) || !g.comuna ? par.comunas : [g.comuna, ...par.comunas];
  const zonas = par.zonas.map((z) => z.zona);
  if (g.zona_termica && !zonas.includes(g.zona_termica)) zonas.unshift(g.zona_termica);

  function cambiarComuna(comuna: string) {
    setG((x) => ({
      ...x,
      comuna,
      // Si la zona venía de una excepción de la comuna anterior, vuelve a la zona habitual (la primera).
      zona_termica:
        zonaSugerida(par, comuna) ??
        (zonaSugerida(par, x.comuna) === x.zona_termica ? par.zonas[0]?.zona ?? x.zona_termica : x.zona_termica),
      tipo_proyecto: par.comunasPDA.includes(comuna) ? 'pda' : 'regular',
    }));
  }

  async function guardar() {
    if (!g.nombre.trim()) return setError('Ingresa un nombre para el grupo.');
    if (!g.llamado_id) return setError('Primero crea un llamado en Criterios.');
    try {
      const guardado = await guardarGrupo({ ...g, nombre: g.nombre.trim() }, grupo?.id);
      onGuardado?.(guardado);
      onCerrar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal titulo={grupo ? 'Editar grupo' : 'Nuevo grupo'} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre del grupo / proyecto">
          <input className={claseInput} value={g.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoFocus />
        </Campo>
        <Campo etiqueta="Código (RUKAN u otro)">
          <input className={claseInput} value={g.codigo ?? ''} onChange={(e) => cambiar('codigo', e.target.value || null)} />
        </Campo>
        <Campo etiqueta="Comuna">
          <select className={claseInput} value={g.comuna} onChange={(e) => cambiarComuna(e.target.value)}>
            {comunas.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Zona térmica" ayuda="Validar localidad en visor MINVU (5.3)">
          <select className={claseInput} value={g.zona_termica} onChange={(e) => cambiar('zona_termica', e.target.value)}>
            {zonas.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de proyecto">
          <select className={claseInput} value={g.tipo_proyecto} onChange={(e) => cambiar('tipo_proyecto', e.target.value as TipoProyecto)}>
            {TIPOS_PROYECTO.map((t) => (
              <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Modalidad">
          <select className={claseInput} value={g.modalidad} onChange={(e) => cambiar('modalidad', e.target.value as Modalidad)}>
            <option value="grupal">Grupal</option>
            <option value="individual">Individual</option>
          </select>
        </Campo>
        <Campo etiqueta="Localidad urbana" ayuda="Según el visor MINVU de localidades (5.3)">
          <input className={claseInput} value={g.localidad ?? ''} onChange={(e) => cambiar('localidad', e.target.value || null)} placeholder="p. ej. Talca" />
        </Campo>
        <div className="flex items-end pb-2">
          <Casilla
            etiqueta="Localidad urbana de más de 5.000 hab. verificada"
            detalle="(1 y 14.3 c)"
            checked={g.localidad_mas_5000}
            onChange={(v) => cambiar('localidad_mas_5000', v)}
          />
        </div>
        <Campo etiqueta="Representación (3.13)">
          <select
            className={claseInput}
            value={g.representacion ?? ''}
            onChange={(e) => cambiar('representacion', (e.target.value || null) as GrupoNuevo['representacion'])}
          >
            <option value="">—</option>
            <option value="junta_vecinos">Junta de vecinos (comité de vecinos)</option>
            <option value="organizacion_funcional">Organización social funcional</option>
          </select>
        </Campo>
        <div className="flex items-end pb-2">
          <Casilla
            etiqueta="Personalidad jurídica vigente"
            checked={g.personalidad_juridica_vigente}
            onChange={(v) => cambiar('personalidad_juridica_vigente', v)}
          />
        </div>
        <Campo etiqueta="Nombre de la organización">
          <input
            className={claseInput}
            value={g.organizacion ?? ''}
            onChange={(e) => cambiar('organizacion', e.target.value || null)}
            placeholder="Junta de vecinos / organización funcional"
          />
        </Campo>
        <Campo etiqueta="Estado">
          <select className={claseInput} value={g.estado} onChange={(e) => cambiar('estado', e.target.value as EstadoGrupo)}>
            {ESTADOS_GRUPO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Llamado" ayuda="Define los criterios con que se evalúa el grupo">
          <select className={claseInput} value={g.llamado_id} onChange={(e) => cambiar('llamado_id', e.target.value)}>
            {llamados.map((l) => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo etiqueta="Observaciones">
            <textarea rows={2} className={claseInput} value={g.observaciones ?? ''} onChange={(e) => cambiar('observaciones', e.target.value || null)} />
          </Campo>
        </div>
      </div>
      {error && <p className="mt-4 rounded bg-danger-bg p-2 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" onClick={guardar}>Guardar</Boton>
      </div>
    </Modal>
  );
}

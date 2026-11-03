'use client'
// Módulo Filtro DS27 Cap. IV (pantallas con la estética de Cubica Manager).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { evaluarTodos, type Evaluado } from '@/lib/filtro/evaluacion';
import { completarParametros, type Parametros } from '@/lib/filtro/reglas';
import { createClient } from '@/lib/supabase';

// Tablas propias del módulo (sql/50_filtro_ds27.sql), separadas por empresa
const supabase = createClient();
import type { Grupo, GrupoNuevo, Llamado, LlamadoNuevo, Postulante, PostulanteNuevo } from '@/lib/filtro/tipos';

interface Datos {
  llamados: Llamado[];
  /** Llamado con el que se trabaja (selector de la barra superior). */
  llamado: Llamado | null;
  parametros: Parametros;
  elegirLlamado: (id: string) => void;
  guardarLlamado: (l: LlamadoNuevo, id?: string) => Promise<Llamado>;
  eliminarLlamado: (id: string) => Promise<void>;
  grupos: Grupo[];
  postulantes: Postulante[];
  evaluados: Evaluado[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  guardarGrupo: (g: GrupoNuevo, id?: string) => Promise<Grupo>;
  eliminarGrupo: (id: string) => Promise<void>;
  guardarPostulante: (p: PostulanteNuevo, id?: string) => Promise<void>;
  eliminarPostulante: (id: string) => Promise<void>;
  insertarPostulantes: (lista: PostulanteNuevo[]) => Promise<void>;
  marcarIncluidos: (ids: string[], incluido: boolean) => Promise<void>;
  /** Deja incluidos exactamente `ids` dentro del grupo. */
  aplicarSeleccion: (grupoId: string, ids: string[]) => Promise<void>;
}

const Contexto = createContext<Datos | null>(null);

const LOTE = 500;
const CLAVE_LLAMADO = 'filtro.llamado-actual';

function leerPreferencia(): string | null {
  try {
    return localStorage.getItem(CLAVE_LLAMADO);
  } catch {
    return null;
  }
}

function guardarPreferencia(id: string) {
  try {
    localStorage.setItem(CLAVE_LLAMADO, id);
  } catch {
    // sin almacenamiento local: se elige el más reciente en cada visita
  }
}
const LOTE_IDS = 100;

function trozos<T>(lista: T[], tamano: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) r.push(lista.slice(i, i + tamano));
  return r;
}

function falla(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function leerTodo<T>(tabla: string, orden: string, ascendente = true): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order(orden, { ascending: ascendente })
      .range(desde, desde + 999);
    falla(error);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [llamados, setLlamados] = useState<Llamado[]>([]);
  const [llamadoId, setLlamadoId] = useState<string | null>(leerPreferencia);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [postulantes, setPostulantes] = useState<Postulante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [l, g, p] = await Promise.all([
        leerTodo<Llamado>('filtro_llamados', 'created_at', false),
        leerTodo<Grupo>('filtro_grupos', 'nombre'),
        leerTodo<Postulante>('filtro_postulantes', 'nombre'),
      ]);
      setLlamados(l.map((x) => ({ ...x, parametros: completarParametros(x.parametros) })));
      setGrupos(g);
      setPostulantes(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const elegirLlamado = useCallback((id: string) => {
    setLlamadoId(id);
    guardarPreferencia(id);
  }, []);

  const guardarLlamado = useCallback(async (l: LlamadoNuevo, id?: string) => {
    const consulta = id
      ? supabase.from('filtro_llamados').update(l).eq('id', id).select().single()
      : supabase.from('filtro_llamados').insert(l).select().single();
    const { data, error } = await consulta;
    falla(error);
    const guardado = { ...(data as Llamado), parametros: completarParametros((data as Llamado).parametros) };
    setLlamados((lista) => (id ? lista.map((x) => (x.id === id ? guardado : x)) : [guardado, ...lista]));
    return guardado;
  }, []);

  const eliminarLlamado = useCallback(async (id: string) => {
    falla((await supabase.from('filtro_llamados').delete().eq('id', id)).error);
    setLlamados((l) => l.filter((x) => x.id !== id));
  }, []);

  const guardarGrupo = useCallback(async (g: GrupoNuevo, id?: string) => {
    const consulta = id
      ? supabase.from('filtro_grupos').update(g).eq('id', id).select().single()
      : supabase.from('filtro_grupos').insert(g).select().single();
    const { data, error } = await consulta;
    falla(error);
    const guardado = data as Grupo;
    setGrupos((lista) =>
      (id ? lista.map((x) => (x.id === id ? guardado : x)) : [...lista, guardado]).sort((a, b) =>
        a.nombre.localeCompare(b.nombre),
      ),
    );
    return guardado;
  }, []);

  const eliminarGrupo = useCallback(async (id: string) => {
    falla((await supabase.from('filtro_grupos').delete().eq('id', id)).error);
    setGrupos((l) => l.filter((g) => g.id !== id));
    setPostulantes((l) => l.filter((p) => p.grupo_id !== id));
  }, []);

  const guardarPostulante = useCallback(async (p: PostulanteNuevo, id?: string) => {
    const consulta = id
      ? supabase.from('filtro_postulantes').update(p).eq('id', id).select().single()
      : supabase.from('filtro_postulantes').insert(p).select().single();
    const { data, error } = await consulta;
    falla(error);
    const guardado = data as Postulante;
    setPostulantes((l) => (id ? l.map((x) => (x.id === id ? guardado : x)) : [...l, guardado]));
  }, []);

  const eliminarPostulante = useCallback(async (id: string) => {
    falla((await supabase.from('filtro_postulantes').delete().eq('id', id)).error);
    setPostulantes((l) => l.filter((p) => p.id !== id));
  }, []);

  const insertarPostulantes = useCallback(async (lista: PostulanteNuevo[]) => {
    const nuevos: Postulante[] = [];
    for (const lote of trozos(lista, LOTE)) {
      const { data, error } = await supabase.from('filtro_postulantes').insert(lote).select();
      falla(error);
      nuevos.push(...((data ?? []) as Postulante[]));
    }
    setPostulantes((l) => [...l, ...nuevos]);
  }, []);

  const marcarIncluidos = useCallback(async (ids: string[], incluido: boolean) => {
    for (const lote of trozos(ids, LOTE_IDS))
      falla((await supabase.from('filtro_postulantes').update({ incluido }).in('id', lote)).error);
    const conjunto = new Set(ids);
    setPostulantes((l) => l.map((p) => (conjunto.has(p.id) ? { ...p, incluido } : p)));
  }, []);

  const aplicarSeleccion = useCallback(async (grupoId: string, ids: string[]) => {
    falla((await supabase.from('filtro_postulantes').update({ incluido: false }).eq('grupo_id', grupoId)).error);
    for (const lote of trozos(ids, LOTE_IDS))
      falla((await supabase.from('filtro_postulantes').update({ incluido: true }).in('id', lote)).error);
    const conjunto = new Set(ids);
    setPostulantes((l) => l.map((p) => (p.grupo_id === grupoId ? { ...p, incluido: conjunto.has(p.id) } : p)));
  }, []);

  const evaluados = useMemo(() => evaluarTodos(postulantes, grupos, llamados), [postulantes, grupos, llamados]);
  const llamado = llamados.find((l) => l.id === llamadoId) ?? llamados[0] ?? null;
  const parametros = useMemo(() => completarParametros(llamado?.parametros), [llamado]);

  const valor: Datos = {
    llamados, llamado, parametros, elegirLlamado, guardarLlamado, eliminarLlamado,
    grupos, postulantes, evaluados, cargando, error, recargar, guardarGrupo, eliminarGrupo,
    guardarPostulante, eliminarPostulante, insertarPostulantes, marcarIncluidos, aplicarSeleccion,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDatos(): Datos {
  const d = useContext(Contexto);
  if (!d) throw new Error('useDatos fuera de DataProvider');
  return d;
}

'use client'
// components/FilaPartida.tsx
// Fila recursiva del árbol de partidas: se renderiza a sí misma para cada nivel.
// Soporta subproyecto (nivel 1) ▸ etapa (nivel 2) ▸ partida (nivel 3).
// Los grupos (es_grupo) agrupan y muestran el avance ponderado de sus hijos;
// las hojas (partidas reales) tienen el slider de avance y su costo.

import { fmt } from '@/lib/format'

function colorAvance(pct: number) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 50)  return '#2563eb'
  if (pct > 0)    return '#d97706'
  return '#94a3b8'
}

// Etiqueta jerárquica: 1, 1.1, 1.1.1
function indice(padres: number[]): string {
  return padres.join('.')
}

interface Props {
  nodo: any
  ruta: number[]                       // posición jerárquica (para el índice 1.2.3)
  valorDe: (n: any) => number
  avanceDe: (n: any) => number
  expanded: Set<string>
  soloLectura?: boolean
  onToggle: (id: string) => void
  onEdit: (nodo: any) => void
  onDel: (id: string) => void
  onAddHijo: (padre: any) => void      // agregar sub-nivel bajo este nodo
  onAvance: (nodo: any, val: number) => void
  onAvanceLocal: (id: string, val: number) => void
}

export default function FilaPartida(props: Props) {
  const { nodo, ruta, valorDe, avanceDe, expanded, soloLectura, onToggle, onEdit, onDel, onAddHijo, onAvance, onAvanceLocal } = props

  const hijos = nodo.children || []
  const esGrupo = hijos.length > 0 || nodo.es_grupo
  const nivel = ruta.length                       // 1, 2 o 3
  const isOpen = expanded.has(nodo.id)
  const avance = Math.round(avanceDe(nodo))
  const valor = valorDe(nodo)

  // Estilo por nivel: nivel 1 (beneficiario) destacado como título, se aclara hacia abajo
  const estiloNivel = [
    'bg-gradient-to-r from-[#eef5fd] to-white border border-[#c5ddf5]',  // nivel 1 (beneficiario)
    'bg-[#f7f9fc] border border-[#e2e9f2]',                              // nivel 2 (subproyecto)
    'bg-[#fafbfc] border border-[#eef1f5]',                             // nivel 3 (etapa)
    'bg-transparent',                                                    // nivel 4 (partida)
  ][Math.min(nivel - 1, 3)]

  const sangria = (nivel - 1) * 16

  // Etiqueta de qué contiene cada grupo: si sus hijos son a su vez grupos,
  // son "subproyectos"/"etapas"; si son hojas, son "partidas".
  const hijosSonGrupos = hijos.some((h: any) => (h.children?.length || 0) > 0 || h.es_grupo)
  const etiquetaHijos = hijosSonGrupos ? (nivel === 1 ? 'subproyecto' : 'etapa') : 'partida'

  return (
    <div className={`rounded-lg overflow-hidden ${nivel === 1 ? 'mb-2' : 'mb-1'}`}>
      <div
        onClick={() => esGrupo && onToggle(nodo.id)}
        className={`flex items-center gap-2.5 px-3 py-2.5 border-l-4 ${estiloNivel} ${esGrupo ? 'cursor-pointer' : ''}`}
        style={{ borderLeftColor: colorAvance(avance), marginLeft: sangria }}
      >
        {/* Flecha (solo grupos) */}
        {esGrupo
          ? <span className="text-[11px] text-muted flex-shrink-0 transition-transform duration-150"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          : <span className="w-[11px] flex-shrink-0" />}

        {/* Índice jerárquico */}
        <span className={`text-[11px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded ${
          nivel === 1 ? 'text-brand bg-[#e8f1fb]' : 'text-muted bg-[#eef2f7]'}`}>
          {indice(ruta)}
        </span>

        {/* Descripción */}
        <div className="flex-1 min-w-0">
          <div className={`${nivel === 1 ? 'text-[15px] font-extrabold' : nivel === 2 ? 'text-[13px] font-bold' : nivel === 3 ? 'text-[12px] font-semibold' : 'text-[12px]'} text-[#1a2535] truncate flex items-center gap-1.5`}>
            {nivel === 1 && <span className="text-[13px]">👤</span>}
            {nodo.descripcion}
          </div>
          <div className="flex gap-2.5 text-[10px] text-muted mt-0.5">
            {esGrupo
              ? <span>{hijos.length} {etiquetaHijos}{hijos.length !== 1 ? 's' : ''}</span>
              : <>
                  {nodo.cantidad > 0 && <span>{nodo.cantidad} {nodo.unidad}</span>}
                  {nodo.precio_unitario > 0 && <span>P.U: {fmt(nodo.precio_unitario)}</span>}
                </>}
            {valor > 0 && <span className="font-semibold">Total: {fmt(valor)}</span>}
          </div>
        </div>

        {/* Avance: slider en hojas, barra en grupos */}
        {esGrupo ? (
          <div className="w-[80px] flex-shrink-0">
            <div className="h-1.5 bg-[#e8edf2] rounded-[3px] overflow-hidden">
              <div className="h-full rounded-[3px]" style={{ width: `${avance}%`, background: colorAvance(avance) }} />
            </div>
          </div>
        ) : (
          <div className="w-[110px] flex-shrink-0" onClick={e => e.stopPropagation()}>
            <input type="range" min={0} max={100} step={5} value={nodo.avance || 0}
              disabled={soloLectura}
              onChange={e => onAvanceLocal(nodo.id, Number(e.target.value))}
              onMouseUp={e => onAvance(nodo, Number((e.target as HTMLInputElement).value))}
              onTouchEnd={e => onAvance(nodo, Number((e.target as HTMLInputElement).value))}
              className="w-full cursor-pointer"
              style={{ accentColor: colorAvance(nodo.avance || 0) }} />
          </div>
        )}
        <span className="text-[13px] font-bold min-w-[38px] text-right flex-shrink-0" style={{ color: colorAvance(avance) }}>
          {avance}%
        </span>

        {/* Acciones */}
        {!soloLectura && (
          <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(nodo)} title="Editar"
              className="w-6 h-6 rounded-[5px] bg-canvas text-muted text-[11px] font-bold flex items-center justify-center">✎</button>
            <button onClick={() => onDel(nodo.id)} title="Eliminar"
              className="w-6 h-6 rounded-[5px] bg-danger-bg text-danger text-[11px] font-bold flex items-center justify-center">✕</button>
          </div>
        )}
      </div>

      {/* Hijos (recursivo) */}
      {isOpen && esGrupo && (
        <div className="pt-1.5 pb-1">
          {hijos.map((h: any, i: number) => (
            <FilaPartida key={h.id} {...props} nodo={h} ruta={[...ruta, i + 1]} />
          ))}
          {!soloLectura && nivel < 4 && (
            <button onClick={() => onAddHijo(nodo)}
              className="py-1.5 mt-1 mb-1 bg-white border border-dashed border-[#d1d9e6] rounded-[6px] text-[11px] text-brand font-semibold"
              style={{ marginLeft: sangria + 16, width: `calc(100% - ${sangria + 16}px)` }}>
              + Agregar {etiquetaHijos}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
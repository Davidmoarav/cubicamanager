'use client'
// components/PartidasPanel.tsx — v3 con IMPORTAR DEL CATÁLOGO (auto-contenido)

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Btn, FormInput, FormSelect, Modal } from '@/components/ui'
import { usePermisos } from '@/lib/usePermisos'
import SelectorCatalogo from '@/components/SelectorCatalogo'
import FilaPartida from '@/components/FilaPartida'
import { IconEdit } from '@/components/Icon'
import ImportarExcelPartidas from '@/components/ImportarExcelPartidas'
import ImportarPrograma from '@/components/ImportarPrograma'
import ResumenDistribucion from '@/components/ResumenDistribucion'
import MatrizDistribucion from '@/components/MatrizDistribucion'
import { fmt } from '@/lib/format'
import { UNIDADES } from '@/types/cotizaciones'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import type { CatalogoPartida } from '@/types/catalogo-partida'

const colorAvance = (pct: number) => {
  if (pct === 0) return '#d1d9e6'
  if (pct < 50) return '#e09820'
  if (pct < 100) return '#E5502A'
  return '#1a7a4a'
}

interface Props {
  proyectoId: string
  proyectoNombre?: string
  markupGlobal?: number
  onAvanceChange?: () => void
}

export default function PartidasPanel({ proyectoId, markupGlobal = 20, onAvanceChange }: Props) {
  const { soloLectura } = usePermisos('obra')
  const [allItems, setAllItems] = useState<PartidaProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [vista, setVista] = useState<'arbol' | 'resumen' | 'matriz'>('arbol')
  const [modal, setModal] = useState<{ type: 'padre' | 'hijo' | 'editar'; parentId?: string } | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [showPrograma, setShowPrograma] = useState(false)
  const [catalogo, setCatalogo] = useState<CatalogoPartida[]>([])
  const [catLoading, setCatLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  // Materiales (rendimientos) por partida
  const [materiales, setMateriales] = useState<any[]>([])
  const [modalMat, setModalMat]     = useState<{ partida: PartidaProyecto } | null>(null)
  const [matForm, setMatForm]       = useState<any>({})
  const [matEditId, setMatEditId]   = useState<string | null>(null)
  const [savingMat, setSavingMat]   = useState(false)
  const [partidaMatId, setPartidaMatId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, mats] = await Promise.all([
      fetch(`/api/partidas-proyecto?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/partida-materiales?proyecto_id=${proyectoId}`).then(r => r.json()).catch(() => []),
    ])
    setAllItems(Array.isArray(data) ? data : [])
    setMateriales(Array.isArray(mats) ? mats : [])
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { load() }, [load])

  // ─── Árbol recursivo (N niveles: subproyecto → etapa → partida) ───
  const valorDe = (nodo: any): number => {
    if (nodo.children && nodo.children.length > 0)
      return nodo.children.reduce((s: number, h: any) => s + valorDe(h), 0)
    return (Number(nodo.cantidad) || 0) * (Number(nodo.precio_unitario) || 0)
  }
  const avanceDe = (nodo: any): number => {
    if (nodo.children && nodo.children.length > 0) {
      const pesos = nodo.children.map((h: any) => valorDe(h))
      const tot = pesos.reduce((a: number, b: number) => a + b, 0)
      if (tot > 0)
        return nodo.children.reduce((s: number, h: any, i: number) => s + avanceDe(h) * (pesos[i] / tot), 0)
      return nodo.children.reduce((s: number, h: any) => s + avanceDe(h), 0) / nodo.children.length
    }
    return Number(nodo.avance) || 0
  }
  const construirArbol = (items: any[]): any[] => {
    const map: Record<string, any> = {}
    items.forEach(i => { map[i.id] = { ...i, children: [] } })
    const raiz: any[] = []
    items.forEach(i => {
      const nodo = map[i.id]
      if (i.parent_id && map[i.parent_id]) map[i.parent_id].children.push(nodo)
      else raiz.push(nodo)
    })
    const ordenar = (arr: any[]) => {
      arr.sort((a, b) => (a.orden || 0) - (b.orden || 0))
      arr.forEach(n => ordenar(n.children))
    }
    ordenar(raiz)
    return raiz
  }

  const padres = useMemo(() => construirArbol(allItems), [allItems])
  const partidaMateriales = useMemo(() => allItems.find(p => p.id === partidaMatId) || null, [allItems, partidaMatId])

  // Lista de compra consolidada del PROYECTO: mismo material sumado entre todas
  // las partidas (necesario = cantidad de la partida × rendimiento).
  const comprasProyecto = useMemo(() => {
    const porId: Record<string, any> = {}
    allItems.forEach(p => { porId[p.id] = p })
    const map = new Map<string, { material: string; unidad: string; necesario: number; costo: number }>()
    for (const m of materiales) {
      const p = porId[m.partida_id]
      if (!p) continue
      const necesario = (Number(p.cantidad) || 0) * (Number(m.rendimiento) || 0)
      const costo = necesario * (Number(m.precio_unitario) || 0)
      const key = String(m.material || '').trim().toLowerCase() + '¦' + (m.unidad || '')
      const cur = map.get(key) || { material: m.material, unidad: m.unidad || '', necesario: 0, costo: 0 }
      cur.necesario += necesario; cur.costo += costo
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.costo - a.costo)
  }, [materiales, allItems])

  // Notas editables dentro del detalle
  const [detNotas, setDetNotas] = useState('')
  useEffect(() => { setDetNotas(partidaMateriales?.notas || '') }, [partidaMatId, partidaMateriales?.notas])
  const guardarNotas = async () => {
    if (!partidaMateriales) return
    await fetch('/api/partidas-proyecto', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: partidaMateriales.id, proyecto_id: proyectoId, notas: detNotas }),
    })
    await load()
  }

  const avanceGeneral = useMemo(() => {
    if (padres.length === 0) return 0
    let totalValor = 0, totalPond = 0
    for (const p of padres) {
      const v = valorDe(p)
      totalValor += v
      totalPond += v * avanceDe(p) / 100
    }
    return totalValor > 0 ? Math.round((totalPond / totalValor) * 100) : 0
  }, [padres])

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const toggle = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Precio de venta calculado en vivo (markup de la partida o el global)
  const mkActual = form.markup_pct ?? markupGlobal
  const precioVentaCalc = Math.round((Number(form.costo_unitario) || 0) * (1 + (Number(mkActual) || 0) / 100))

  const save = async () => {
    if (!form.descripcion) { alert('La descripción es obligatoria'); return }
    setSaving(true)
    const method = modal?.type === 'editar' ? 'PUT' : 'POST'
    const esGrupo = !!form.es_grupo
    const payload = {
      ...form,
      proyecto_id: proyectoId,
      parent_id: modal?.type === 'hijo' ? modal.parentId : (form.parent_id || null),
      es_grupo: esGrupo,
      // Los grupos no llevan costo ni precio; las partidas reales sí
      ...(esGrupo
        ? { costo_unitario: 0, costo_material_unit: 0, costo_mo_unit: 0, precio_unitario: 0, cantidad: 0 }
        : { precio_unitario: precioVentaCalc }),
    }
    const res = await fetch('/api/partidas-proyecto', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar: ' + (err.error || 'error desconocido') +
        '\n\nSi menciona "nivel", "es_grupo" o "costo_material_unit", ejecuta el SQL 28_partidas_tres_niveles.sql en Supabase.')
      return
    }
    await load(); onAvanceChange?.(); setModal(null)
  }

  const updateAvance = async (partida: PartidaProyecto, nuevoAvance: number) => {
    setAllItems(prev => prev.map(p => p.id === partida.id ? { ...p, avance: nuevoAvance } : p))
    await fetch('/api/partidas-proyecto', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: partida.id, proyecto_id: proyectoId, avance: nuevoAvance }),
    })
    await load(); onAvanceChange?.()
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta partida y todas sus sub-partidas?')) return
    await fetch('/api/partidas-proyecto', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, proyecto_id: proyectoId }),
    })
    await load(); onAvanceChange?.()
  }

  const openNewPadre = () => {
    setForm({ descripcion: '', unidad: 'gl', cantidad: 1, precio_unitario: 0, costo_unitario: 0, costo_material_unit: 0, costo_mo_unit: 0, avance: 0, notas: '', orden: padres.length, nivel: 1 })
    setModal({ type: 'padre' })
  }
  const openNewHijo = (parentId: string, childCount: number, nivel = 2) => {
    setForm({ descripcion: '', unidad: 'gl', cantidad: 1, precio_unitario: 0, costo_unitario: 0, costo_material_unit: 0, costo_mo_unit: 0, avance: 0, notas: '', orden: childCount, nivel })
    setModal({ type: 'hijo', parentId })
  }
  const openEdit = (p: PartidaProyecto) => { setForm({ ...p }); setModal({ type: 'editar' }) }

  // ═══ MATERIALES (rendimientos) ═══
  const materialesDe = (partidaId: string) => materiales.filter(m => m.partida_id === partidaId)

  const openNewMat = (padre: PartidaProyecto) => {
    setMatEditId(null)
    setMatForm({ material: '', unidad: 'un', rendimiento: '', precio_unitario: '' })
    setModalMat({ partida: padre })
  }
  const openEditMat = (padre: PartidaProyecto, m: any) => {
    setMatEditId(m.id)
    setMatForm({ material: m.material, unidad: m.unidad, rendimiento: m.rendimiento, precio_unitario: m.precio_unitario })
    setModalMat({ partida: padre })
  }
  const saveMat = async () => {
    if (!modalMat) return
    if (!matForm.material) { alert('El nombre del material es obligatorio'); return }
    setSavingMat(true)
    const method = matEditId ? 'PUT' : 'POST'
    const base = {
      material: matForm.material,
      unidad: matForm.unidad || 'un',
      rendimiento: Number(matForm.rendimiento) || 0,
      precio_unitario: Number(matForm.precio_unitario) || 0,
    }
    const payload = matEditId ? { id: matEditId, ...base } : { partida_id: modalMat.partida.id, ...base }
    const res = await fetch('/api/partida-materiales', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSavingMat(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar el material: ' + (err.error || 'error desconocido') +
        '\n\nSi menciona "partida_materiales", ejecuta el SQL 14_partida_materiales.sql en Supabase.')
      return
    }
    await load(); setModalMat(null)
  }
  const delMat = async (id: string) => {
    if (!confirm('¿Eliminar este material?')) return
    await fetch('/api/partida-materiales', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    await load()
  }
  // Copia los materiales de esta partida a la misma partida de los otros beneficiarios
  const [aplicandoMat, setAplicandoMat] = useState(false)
  const aplicarMaterialesATodos = async (partida: PartidaProyecto, cuantos: number) => {
    if (!confirm(`¿Copiar estos materiales a la partida "${partida.descripcion}" de los otros ${cuantos} beneficiarios? No se duplican los que ya existan.`)) return
    setAplicandoMat(true)
    const res = await fetch('/api/partida-materiales/aplicar-a-todos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partida_id: partida.id }),
    })
    const data = await res.json()
    setAplicandoMat(false)
    if (!res.ok) { alert('No se pudo aplicar: ' + (data.error || 'error desconocido')); return }
    await load(); onAvanceChange?.()
    alert(`Listo: ${data.insertados} materiales agregados en ${data.destinos} beneficiarios.`)
  }

  // ═══ IMPORTAR DEL CATÁLOGO ═══
  const openImport = async () => {
    setShowImport(true)
    setCatLoading(true)
    setSelected(new Set())
    const res = await fetch('/api/catalogo-partidas')
    const data = await res.json()
    setCatalogo(Array.isArray(data) ? data : [])
    setCatLoading(false)
  }

  const catalogoPadres = useMemo(() => {
    const ps = catalogo.filter(c => !c.parent_id).sort((a, b) => a.orden - b.orden)
    return ps.map(p => ({
      ...p,
      children: catalogo.filter(h => h.parent_id === p.id).sort((a, b) => a.orden - b.orden),
    }))
  }, [catalogo])

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const doImport = async () => {
    if (selected.size === 0) { alert('Selecciona al menos una partida'); return }
    setImporting(true)
    const seleccionados = catalogoPadres.filter(p => selected.has(p.id))
    for (let i = 0; i < seleccionados.length; i++) {
      const cat = seleccionados[i]
      const res = await fetch('/api/partidas-proyecto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyecto_id: proyectoId, parent_id: null, descripcion: cat.descripcion,
          unidad: cat.unidad, cantidad: 1, precio_unitario: cat.precio_unitario_ref || 0, avance: 0, orden: padres.length + i,
        }),
      })
      const padreCreado = await res.json()
      if (padreCreado?.id && cat.children.length > 0) {
        for (let j = 0; j < cat.children.length; j++) {
          const sub = cat.children[j]
          await fetch('/api/partidas-proyecto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              proyecto_id: proyectoId, parent_id: padreCreado.id, descripcion: sub.descripcion,
              unidad: sub.unidad, cantidad: 1, precio_unitario: sub.precio_unitario_ref || 0, avance: 0, orden: j,
            }),
          })
        }
      }
    }
    await load(); onAvanceChange?.(); setImporting(false); setShowImport(false)
  }

  return (
    <div>
      {soloLectura && (
        <div className="bg-[#fff8e6] border border-[#f0dca8] text-[#8a6314] text-[12px] px-4 py-2.5 rounded-lg mb-4">
          <strong>Solo lectura.</strong> Puedes consultar el avance y los costos, pero no modificar la obra.
        </div>
      )}
      <div className={soloLectura ? 'pointer-events-none opacity-95' : ''}>
      <div className="flex justify-between items-center mb-3.5">
        <div>
          <div className="text-sm font-bold text-ink">Control de obra ({padres.length} partida{padres.length !== 1 ? 's' : ''})</div>
          {padres.length > 0 && (
            <div className="text-[12px] text-muted mt-0.5">
              Avance general: <span className="font-bold" style={{ color: colorAvance(avanceGeneral) }}>{avanceGeneral}%</span>
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          {!soloLectura && (
            <>
              <Btn onClick={() => setShowExcel(true)} style={{ fontSize: 12, padding: '5px 12px', background: '#e6f4ea', borderColor: '#a8d5b8', color: '#1a7a4a', fontWeight: 700 }}>
                Importar de Excel
              </Btn>
              <Btn onClick={() => setShowPrograma(true)} style={{ fontSize: 12, padding: '5px 12px', background: '#FCEAE3', borderColor: '#b5d4f4', color: '#0c447c', fontWeight: 700 }}>
               Programa (beneficiarios)
              </Btn>
              <Btn onClick={openImport} style={{ fontSize: 12, padding: '5px 12px', background: '#eeedfe', borderColor: '#ccc5fc', color: '#534ab7', fontWeight: 700 }}>
                Del catálogo
              </Btn>
              <Btn variant="primary" onClick={openNewPadre} style={{ fontSize: 12, padding: '5px 12px' }}>+ Nueva partida</Btn>
            </>
          )}
        </div>
      </div>

      {padres.length > 0 && (
        <div className="h-2.5 bg-[#EDE7E0] rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${avanceGeneral}%`, background: colorAvance(avanceGeneral) }} />
        </div>
      )}

      {/* Toggle Árbol / Resumen (proyecto general) */}
      {padres.length > 0 && (
        <div className="flex gap-1 bg-canvas rounded-lg p-0.5 w-fit mb-3">
          <button onClick={() => setVista('arbol')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${vista === 'arbol' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>
            Árbol por subproyecto
          </button>
          <button onClick={() => setVista('resumen')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${vista === 'resumen' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>
            Resumen del proyecto
          </button>
          {!soloLectura && (
            <button onClick={() => setVista('matriz')}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${vista === 'matriz' ? 'bg-white shadow-sm text-brand' : 'text-muted'}`}>
             Editar distribución
            </button>
          )}
        </div>
      )}

      {loading
        ? <p className="text-center py-5 text-muted">Cargando...</p>
        : padres.length === 0
        ? <div className="bg-canvas border border-dashed border-line2 rounded-lg p-7 text-center text-[12px] text-muted">
            Sin partidas de obra. Agrega una manualmente o importa desde tu catálogo.
          </div>
        : vista === 'resumen'
        ? <ResumenDistribucion raices={padres} />
        : vista === 'matriz'
        ? <MatrizDistribucion proyectoId={proyectoId} raices={padres} markupGlobal={markupGlobal}
            onSaved={() => { load(); onAvanceChange?.() }} />
        : (
          <div className="flex flex-col">
            {padres.map((raiz, i) => (
              <FilaPartida
                key={raiz.id}
                nodo={raiz}
                ruta={[i + 1]}
                valorDe={valorDe}
                avanceDe={avanceDe}
                expanded={expanded}
                soloLectura={soloLectura}
                onToggle={toggle}
                onEdit={openEdit}
                onDel={del}
                onAddHijo={(padre) => openNewHijo(padre.id, (padre.children || []).length, (padre.nivel || 1) + 1)}
                onAvance={updateAvance}
                onAvanceLocal={(id, val) => setAllItems(prev => prev.map(x => x.id === id ? { ...x, avance: val } : x))}
                onDetalle={(nodo) => setPartidaMatId(nodo.id)}
              />
            ))}
            {!soloLectura && (
              <button onClick={openNewPadre}
                className="w-full py-2.5 mt-2 bg-white border border-dashed border-[#d1d9e6] rounded-lg text-[13px] text-brand font-semibold">
                + Agregar subproyecto / partida
              </button>
            )}
          </div>
        )}

      {/* DETALLE DE PARTIDA (click en la partida): costo, avance, materiales a comprar */}
      {partidaMateriales && (() => {
        const p = partidaMateriales
        const cant = Number(p.cantidad) || 0
        const cmat = Number(p.costo_material_unit) || 0
        const cmo  = Number(p.costo_mo_unit) || 0
        const costoU = (Number(p.costo_unitario) || 0) || (cmat + cmo)
        const precioU = Number(p.precio_unitario) || 0
        const totalVenta = cant * precioU
        const totalCosto = cant * costoU
        const margen = totalVenta - totalCosto
        const margenPct = costoU > 0 ? Math.round(((precioU - costoU) / costoU) * 100) : 0
        const mats = materialesDe(p.id)
        const subtotalMats = mats.reduce((s, m) => s + (cant * (Number(m.rendimiento) || 0)) * (Number(m.precio_unitario) || 0), 0)
        const nombresPartida = new Set(mats.map(m => String(m.material || '').trim().toLowerCase()))
        // Cuántas otras partidas (otros beneficiarios) tienen esta misma partida
        const normD = (s: any) => String(s || '').toLowerCase().trim()
        const matchingCount = allItems.filter(x =>
          !x.es_grupo && x.id !== p.id &&
          normD(x.descripcion) === normD(p.descripcion) && normD(x.notas) === normD(p.notas)).length
        const av = Math.round(Number(p.avance) || 0)
        const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
          <div className="bg-canvas rounded-lg p-2.5">
            <div className="text-[10px] text-muted">{label}</div>
            <div className="text-[13px] font-extrabold text-ink">{value}</div>
            {hint && <div className="text-[9px] text-subtle">{hint}</div>}
          </div>
        )
        return (
          <Modal title={`Detalle · ${p.descripcion}`} onClose={() => setPartidaMatId(null)}>
            <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">

              {/* Encabezado */}
              <div className="flex items-center gap-2 flex-wrap">
                {p.notas && <span className="text-[10px] font-semibold text-[#0c447c] bg-[#FCEAE3] px-2 py-0.5 rounded">{p.notas}</span>}
                <span className="text-[11px] text-muted">{cant} {p.unidad}</span>
              </div>

              {/* 1) Desglose de costo */}
              <div>
                <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Desglose de costo</div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Cantidad" value={`${cant} ${p.unidad}`} />
                  <Stat label={`Material / ${p.unidad}`} value={fmt(cmat)} />
                  <Stat label={`Mano de obra / ${p.unidad}`} value={fmt(cmo)} />
                  <Stat label={`Costo total / ${p.unidad}`} value={fmt(costoU)} />
                  <Stat label={`Precio venta / ${p.unidad}`} value={fmt(precioU)} hint={`markup ${p.markup_pct ?? markupGlobal}%`} />
                  <Stat label="Margen unitario" value={fmt(precioU - costoU)} hint={`${margenPct}%`} />
                  <Stat label="Costo total" value={fmt(totalCosto)} hint={`${cant} × ${fmt(costoU)}`} />
                  <Stat label="Venta total" value={fmt(totalVenta)} hint={`${cant} × ${fmt(precioU)}`} />
                  <Stat label="Margen total" value={fmt(margen)} hint={`${margenPct}%`} />
                </div>
              </div>

              {/* 2) Avance y notas */}
              <div>
                <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Avance y notas</div>
                <div className="flex items-center gap-3 mb-2">
                  <input type="range" min={0} max={100} step={5} value={av} disabled={soloLectura}
                    onChange={e => setAllItems(prev => prev.map(x => x.id === p.id ? { ...x, avance: Number(e.target.value) } : x))}
                    onMouseUp={e => updateAvance(p, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={e => updateAvance(p, Number((e.target as HTMLInputElement).value))}
                    className="flex-1 cursor-pointer" style={{ accentColor: colorAvance(av) }} />
                  <span className="text-[13px] font-bold min-w-[42px] text-right" style={{ color: colorAvance(av) }}>{av}%</span>
                </div>
                <textarea value={detNotas} onChange={e => setDetNotas(e.target.value)} disabled={soloLectura}
                  placeholder="Notas / categoría de la partida (ej: M1 · Limpieza)…" rows={2}
                  className="w-full text-[12px] px-2.5 py-2 border border-line rounded-lg outline-none focus:border-brand resize-none" />
                {!soloLectura && (
                  <div className="flex justify-end mt-1">
                    <button onClick={guardarNotas} className="text-[11px] text-brand font-semibold">Guardar notas</button>
                  </div>
                )}
              </div>

              {/* 3) Materiales a comprar (esta partida) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-bold text-muted uppercase tracking-wide">Materiales a comprar</div>
                  {mats.length > 0 && <div className="text-[11px] font-bold text-ink">Total: {fmt(subtotalMats)}</div>}
                </div>
                {mats.length === 0
                  ? <p className="text-[11px] text-muted py-1">Sin materiales. Agrega el consumo por {p.unidad} para calcular las compras.</p>
                  : <div className="flex flex-col gap-1.5">
                      {mats.map(m => {
                        const necesario = cant * (Number(m.rendimiento) || 0)
                        const costo = necesario * (Number(m.precio_unitario) || 0)
                        return (
                          <div key={m.id} className="flex items-center gap-2 py-1.5 px-2.5 bg-white border border-[#e4e9f0] rounded-[6px]">
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-semibold text-ink">{m.material}</div>
                              <div className="text-[10px] text-muted">{m.rendimiento} {m.unidad}/{p.unidad} · a comprar: <strong>{necesario.toLocaleString('es-CL', { maximumFractionDigits: 2 })} {m.unidad}</strong></div>
                            </div>
                            <span className="text-[12px] font-bold text-ink">{fmt(costo)}</span>
                            {!soloLectura && (
                              <div className="flex gap-1">
                                <button onClick={() => openEditMat(p, m)} className="w-6 h-6 rounded bg-canvas text-muted flex items-center justify-center"><IconEdit className="w-3.5 h-3.5" /></button>
                                <button onClick={() => delMat(m.id)} className="w-6 h-6 rounded bg-danger-bg text-danger text-[11px]">✕</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>}
                {!soloLectura && (
                  <button onClick={() => openNewMat(p)}
                    className="w-full py-1.5 mt-2 bg-white border border-dashed border-[#d1d9e6] rounded-[6px] text-[11px] text-brand font-semibold">
                    + Agregar material
                  </button>
                )}
                {!soloLectura && mats.length > 0 && matchingCount > 0 && (
                  <button onClick={() => aplicarMaterialesATodos(p, matchingCount)} disabled={aplicandoMat}
                    className="w-full py-2 mt-1.5 bg-[#eef3f9] border border-[#c5ddf5] rounded-[6px] text-[11px] text-brand font-bold disabled:opacity-60">
                    {aplicandoMat ? 'Aplicando…' : `Aplicar estos materiales a los otros ${matchingCount} beneficiarios`}
                  </button>
                )}
              </div>

              {/* 4) Total de compra por material (todo el proyecto) */}
              {comprasProyecto.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Total de compra del proyecto (por material)</div>
                  <div className="border border-line rounded-lg overflow-hidden">
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="bg-canvas text-muted">
                          <th className="text-left font-semibold px-2.5 py-1.5">Material</th>
                          <th className="text-right font-semibold px-2.5 py-1.5">A comprar</th>
                          <th className="text-right font-semibold px-2.5 py-1.5">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comprasProyecto.map((c, i) => {
                          const usado = nombresPartida.has(String(c.material || '').trim().toLowerCase())
                          return (
                            <tr key={i} className={`border-t border-line2 ${usado ? 'bg-[#f4f8fd]' : ''}`}>
                              <td className="px-2.5 py-1.5 text-ink">{usado && '• '}{c.material}</td>
                              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{c.necesario.toLocaleString('es-CL', { maximumFractionDigits: 2 })} {c.unidad}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold whitespace-nowrap">{fmt(c.costo)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-canvas border-t-2 border-line">
                          <td className="px-2.5 py-1.5 font-extrabold text-ink" colSpan={2}>Total materiales del proyecto</td>
                          <td className="px-2.5 py-1.5 text-right font-extrabold text-brand whitespace-nowrap">{fmt(comprasProyecto.reduce((s, c) => s + c.costo, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted mt-1">Las filas marcadas con • son materiales que también usa esta partida.</p>
                </div>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* MODAL NUEVA/EDITAR */}
      {modal && (
        <Modal title={modal.type === 'editar' ? 'Editar' : 'Nueva partida'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-3">
            {/* Tipo: grupo (agrupa) o partida (lleva costo) */}
            <div className="col-span-full">
              <label className="label-base">Tipo</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => upd('es_grupo', true)}
                  className={`flex-1 py-2 rounded-lg border text-[12px] font-semibold ${form.es_grupo ? 'border-brand bg-brand-bg text-brand' : 'border-line text-muted'}`}>
                  Agrupador<div className="text-[10px] font-normal opacity-80">Subproyecto o etapa (agrupa partidas)</div>
                </button>
                <button type="button" onClick={() => upd('es_grupo', false)}
                  className={`flex-1 py-2 rounded-lg border text-[12px] font-semibold ${!form.es_grupo ? 'border-brand bg-brand-bg text-brand' : 'border-line text-muted'}`}>
                  Partida<div className="text-[10px] font-normal opacity-80">Actividad real con costo</div>
                </button>
              </div>
            </div>

            <div className="col-span-full">
              <FormInput label="Descripción *" value={form.descripcion || ''} onChange={v => upd('descripcion', v)} required
                placeholder={form.es_grupo ? 'Ej: M1 (EIFS sobre muro albañilería)' : 'Ej: Hidrolavado de fachadas'} />
            </div>

            {/* Solo las partidas reales (hojas) llevan cantidad y costos */}
            {!form.es_grupo && (
              <>
                <FormSelect label="Unidad" value={form.unidad || 'm2'} onChange={v => upd('unidad', v)} options={UNIDADES} />
                <FormInput label="Cantidad" value={form.cantidad ?? 1} onChange={v => upd('cantidad', v)} type="number" />

                <div className="col-span-full grid grid-cols-2 gap-3 bg-canvas rounded-lg p-3">
                  <div className="col-span-full text-[10px] font-bold text-muted uppercase tracking-wide">Costo por {form.unidad || 'unidad'}</div>
                  <div>
                    <label className="label-base">Material ($)</label>
                    <input type="number" value={form.costo_material_unit || ''}
                      onChange={e => {
                        const mat = e.target.value === '' ? 0 : Number(e.target.value)
                        setForm((f: any) => ({ ...f, costo_material_unit: mat, costo_unitario: mat + (Number(f.costo_mo_unit) || 0) }))
                      }}
                      className="input-base" placeholder="0" />
                  </div>
                  <div>
                    <label className="label-base">Mano de obra ($)</label>
                    <input type="number" value={form.costo_mo_unit || ''}
                      onChange={e => {
                        const mo = e.target.value === '' ? 0 : Number(e.target.value)
                        setForm((f: any) => ({ ...f, costo_mo_unit: mo, costo_unitario: (Number(f.costo_material_unit) || 0) + mo }))
                      }}
                      className="input-base" placeholder="0" />
                  </div>
                  <div className="col-span-full flex justify-between text-[11px] pt-1 border-t border-line2">
                    <span className="text-muted">Costo total por {form.unidad || 'unidad'}</span>
                    <span className="font-bold text-ink">{fmt((Number(form.costo_material_unit) || 0) + (Number(form.costo_mo_unit) || 0))}</span>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="label-base">Markup / ganancia (%)</label>
                  <input type="number" value={form.markup_pct ?? ''}
                    onChange={e => upd('markup_pct', e.target.value === '' ? null : Number(e.target.value))}
                    className="input-base" placeholder={`Global: ${markupGlobal}%`} />
                </div>
                <div className="mb-3 flex items-end">
                  <div className="w-full bg-brand-bg border border-[#b5d4f4] rounded-lg px-3 py-2">
                    <div className="text-[10px] text-[#0c447c] font-semibold">Precio de venta</div>
                    <div className="text-base font-extrabold text-brand">{fmt(precioVentaCalc)}</div>
                  </div>
                </div>
              </>
            )}

            <div className="col-span-full">
              <FormInput label="Notas (opcional)" value={form.notas || ''} onChange={v => upd('notas', v)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3.5">
            {modal.type === 'editar' && !form.es_grupo && (
              <button onClick={() => { setPartidaMatId(form.id); setModal(null) }}
                className="text-[12px] text-brand font-semibold mr-auto">Ver materiales →</button>
            )}
            <Btn onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}

      {/* MODAL MATERIAL (rendimiento) */}
      {modalMat && (
        <Modal title={`${matEditId ? 'Editar' : 'Nuevo'} material · ${modalMat.partida.descripcion}`} onClose={() => setModalMat(null)}>
          <div className="flex flex-col gap-3">
            <SelectorCatalogo
              mostrarSiempre
              label="Elegir material del catálogo (autocompleta precio)"
              onPick={p => setMatForm((f: any) => ({ ...f, material: p.descripcion, unidad: p.unidad || f.unidad || 'un', precio_unitario: Number(p.precio) || 0 }))}
            />
            <FormInput label="Material *" value={matForm.material || ''} onChange={v => setMatForm((f: any) => ({ ...f, material: v }))} placeholder="Ej: Adhesivo EIFS" />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect label="Unidad del material" value={matForm.unidad || 'un'} onChange={v => setMatForm((f: any) => ({ ...f, unidad: v }))} options={UNIDADES} />
              <FormInput label={`Rendimiento (por ${modalMat.partida.unidad})`} type="number" value={matForm.rendimiento ?? ''} onChange={v => setMatForm((f: any) => ({ ...f, rendimiento: v }))} placeholder="4" />
            </div>
            <FormInput label="Precio unitario del material ($, opcional)" type="number" value={matForm.precio_unitario ?? ''} onChange={v => setMatForm((f: any) => ({ ...f, precio_unitario: v }))} placeholder="0" />
            <div className="bg-canvas border border-line rounded-lg px-3 py-2.5 text-[12px] text-muted">
              Necesario para {modalMat.partida.cantidad} {modalMat.partida.unidad}:{' '}
              <strong className="text-brand">
                {((Number(modalMat.partida.cantidad) || 0) * (Number(matForm.rendimiento) || 0)).toLocaleString('es-CL', { maximumFractionDigits: 2 })} {matForm.unidad || 'un'}
              </strong>
              {Number(matForm.precio_unitario) > 0 && (
                <> · <strong className="text-brand">{fmt(Math.round((Number(modalMat.partida.cantidad) || 0) * (Number(matForm.rendimiento) || 0) * (Number(matForm.precio_unitario) || 0)))}</strong></>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={() => setModalMat(null)}>Cancelar</Btn>
            <Btn variant="primary" onClick={saveMat} disabled={savingMat}>{savingMat ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}

      {/* MODAL IMPORTAR DEL CATÁLOGO */}
      {showPrograma && (
        <ImportarPrograma
          proyectoId={proyectoId}
          markup={markupGlobal}
          onImported={() => { load(); onAvanceChange?.() }}
          onClose={() => setShowPrograma(false)}
        />
      )}

      {showExcel && (
        <ImportarExcelPartidas
          proyectoId={proyectoId}
          markup={markupGlobal}
          onImported={() => { load(); onAvanceChange?.() }}
          onClose={() => setShowExcel(false)}
        />
      )}

      {showImport && (
        <Modal title="Importar partidas del catálogo" onClose={() => setShowImport(false)}>
          {catLoading
            ? <p className="text-muted text-center p-5">Cargando catálogo...</p>
            : catalogoPadres.length === 0
            ? <div className="text-center p-5">
                <p className="text-[13px] text-muted mb-2.5">Tu catálogo está vacío.</p>
                <p className="text-[12px] text-muted">Ve a <strong>Admin → Catálogo de partidas</strong> para crear tus partidas tipo.</p>
              </div>
            : (
              <>
                <p className="text-[12px] text-muted mb-3.5">
                  Selecciona las partidas que quieres agregar. Se importarán con todas sus sub-partidas y avance 0%.
                </p>
                <div className="max-h-[400px] overflow-y-auto flex flex-col gap-1.5">
                  {catalogoPadres.map(cp => {
                    const isSel = selected.has(cp.id)
                    return (
                      <div
                        key={cp.id}
                        onClick={() => toggleSelect(cp.id)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer border-[1.5px] ${isSel ? 'border-brand bg-[#FCEAE3]' : 'border-[#e4e9f0] bg-white'}`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-white text-[12px] font-bold border-2 ${isSel ? 'bg-brand border-brand' : 'bg-white border-[#d1d9e6]'}`}>
                          {isSel ? '' : ''}
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] font-bold text-[#1a2535]">{cp.descripcion}</div>
                          <div className="text-[11px] text-muted mt-0.5">
                            {cp.children.length} sub-partida{cp.children.length !== 1 ? 's' : ''}
                            {cp.children.length > 0 && ': ' + cp.children.map(h => h.descripcion).join(', ')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-2 justify-between items-center mt-3.5">
                  <span className="text-[12px] text-muted">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                  <div className="flex gap-2">
                    <Btn onClick={() => setShowImport(false)}>Cancelar</Btn>
                    <Btn variant="primary" onClick={doImport} disabled={importing || selected.size === 0}>
                      {importing ? 'Importando...' : `Importar ${selected.size}`}
                    </Btn>
                  </div>
                </div>
              </>
            )}
        </Modal>
      )}
      </div>
    </div>
  )
}
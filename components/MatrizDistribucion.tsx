'use client'
// components/MatrizDistribucion.tsx
// Matriz EDITABLE partida × beneficiario. Las filas son las partidas maestras
// del proyecto (categoría + descripción + costos); las columnas son los
// beneficiarios (subproyectos). En cada celda se escribe la cantidad que aplica
// a ese beneficiario (vacío = no aplica). Al guardar, crea/actualiza/elimina las
// partidas de cada beneficiario en un solo lote (/api/partidas-proyecto/aplicar-matriz).

import { useMemo, useState, useEffect } from 'react'
import { Btn } from '@/components/ui'
import { fmt } from '@/lib/format'
import type { PartidaProyecto } from '@/types/partida-proyecto'

type Nodo = PartidaProyecto & { children?: Nodo[] }

function hojasDe(nodo: Nodo): Nodo[] {
  const h = nodo.children || []
  if (h.length === 0) return nodo.es_grupo ? [] : [nodo]
  return h.flatMap(hojasDe)
}

interface Fila {
  key: string
  categoria: string
  descripcion: string
  unidad: string
  costo_material_unit: number
  costo_mo_unit: number
  markup_pct: number | null
  celdas: Record<string, number | ''>   // benefId -> cantidad
}

interface Props {
  proyectoId: string
  raices: Nodo[]
  markupGlobal?: number
  onSaved: () => void
}

const norm = (s: any) => String(s ?? '').trim()
// Normaliza para emparejar nombres: minúsculas, sin tildes, espacios colapsados
const normNombre = (s: any) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim()

export default function MatrizDistribucion({ proyectoId, raices, markupGlobal = 20, onSaved }: Props) {
  const columnas = useMemo(() => raices.map(r => ({ id: r.id, nombre: r.descripcion })), [raices])

  // Construir filas iniciales desde las partidas existentes
  const filasIniciales = useMemo<Fila[]>(() => {
    const map = new Map<string, Fila>()
    for (const raiz of raices) {
      for (const h of hojasDe(raiz)) {
        const categoria = norm(h.notas)
        const descripcion = norm(h.descripcion)
        const unidad = norm(h.unidad) || 'm2'
        const key = `${categoria}¦${descripcion}¦${unidad}`
        let fila = map.get(key)
        if (!fila) {
          fila = {
            key, categoria, descripcion, unidad,
            costo_material_unit: Number(h.costo_material_unit) || 0,
            costo_mo_unit: Number(h.costo_mo_unit) || 0,
            markup_pct: h.markup_pct == null ? null : Number(h.markup_pct),
            celdas: {},
          }
          map.set(key, fila)
        }
        // Si esta hoja trae costos y la fila no los tenía, complétalos
        if (!fila.costo_material_unit && h.costo_material_unit) fila.costo_material_unit = Number(h.costo_material_unit)
        if (!fila.costo_mo_unit && h.costo_mo_unit) fila.costo_mo_unit = Number(h.costo_mo_unit)
        fila.celdas[raiz.id] = Number(h.cantidad) || 0
      }
    }
    return Array.from(map.values())
  }, [raices])

  const [filas, setFilas] = useState<Fila[]>(filasIniciales)
  const [removidas, setRemovidas] = useState<Fila[]>([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [showCat, setShowCat] = useState(false)
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [catLoading, setCatLoading] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => { setFilas(filasIniciales); setRemovidas([]) }, [filasIniciales])

  const setCelda = (fi: number, benefId: string, val: string) => {
    setFilas(prev => prev.map((f, i) => i === fi
      ? { ...f, celdas: { ...f.celdas, [benefId]: val === '' ? '' : Math.max(0, Number(val) || 0) } }
      : f))
  }
  const setCampo = (fi: number, campo: keyof Fila, val: any) => {
    setFilas(prev => prev.map((f, i) => i === fi ? { ...f, [campo]: val } : f))
  }
  const nuevaFila = () => {
    setFilas(prev => [...prev, {
      key: 'nueva-' + Date.now() + '-' + prev.length,
      categoria: '', descripcion: '', unidad: 'm2',
      costo_material_unit: 0, costo_mo_unit: 0, markup_pct: null, celdas: {},
    }])
  }
  const quitarFila = (fi: number) => {
    setFilas(prev => {
      const f = prev[fi]
      // Si la fila tenía datos guardados (alguna celda > 0), hay que enviarla en 0
      // para que el backend elimine esas partidas.
      const teniaDatos = Object.values(f.celdas).some(v => Number(v) > 0)
      if (teniaDatos) setRemovidas(r => [...r, f])
      return prev.filter((_, i) => i !== fi)
    })
  }

  const abrirCatalogo = async () => {
    setShowCat(true); setCatLoading(true)
    try {
      const res = await fetch('/api/catalogo-partidas')
      const data = await res.json()
      setCatalogo(Array.isArray(data) ? data.filter((c: any) => !c.parent_id) : [])
    } catch { setCatalogo([]) }
    setCatLoading(false)
  }
  const agregarDelCatalogo = (c: any) => {
    const desc = norm(c.descripcion)
    if (filas.some(f => norm(f.descripcion).toLowerCase() === desc.toLowerCase())) return
    setFilas(prev => [...prev, {
      key: 'cat-' + c.id,
      categoria: 'Catálogo', descripcion: desc, unidad: c.unidad || 'm2',
      // El catálogo solo tiene precio de referencia: lo tratamos como costo con markup 0
      costo_material_unit: Number(c.precio_unitario_ref) || 0, costo_mo_unit: 0,
      markup_pct: 0, celdas: {},
    }])
  }

  // ─── Exportar la matriz actual a Excel (para editar cantidades afuera) ───
  const exportarExcel = async () => {
    const XLSX = await import('xlsx')
    const header = ['Partida', 'Categoría', 'U/M', 'Mat $', 'M.O $', ...columnas.map(c => c.nombre)]
    const aoa: any[][] = [header]
    for (const f of filas) {
      if (!norm(f.descripcion)) continue
      aoa.push([
        f.descripcion, f.categoria, f.unidad,
        Number(f.costo_material_unit) || 0, Number(f.costo_mo_unit) || 0,
        ...columnas.map(c => { const v = Number(f.celdas[c.id]) || 0; return v > 0 ? v : '' }),
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Distribucion')
    XLSX.writeFile(wb, 'Distribucion_partidas.xlsx')
  }

  // ─── Descargar una plantilla con los beneficiarios reales y filas de ejemplo ───
  const descargarPlantilla = async () => {
    const XLSX = await import('xlsx')
    const cols = columnas.map(c => c.nombre)
    const header = ['Partida', 'Categoría', 'U/M', 'Mat $', 'M.O $', ...cols]
    const vacias = cols.map(() => '')
    // Ejemplos: cantidad solo en el primer beneficiario para mostrar dónde va
    const ej = (v: number) => cols.map((_, i) => (i === 0 ? v : ''))
    const aoa: any[][] = [
      header,
      ['Hidrolavado de fachadas', 'M1 (EIFS)', 'm2', 50, 7150, ...ej(41.82)],
      ['Estuco + base elastomérica', 'M1 (EIFS)', 'm2', 9150, 2400, ...ej(10.45)],
      ['Estructura pino 2x2', 'M4 (Estructura)', 'm2', 1750, 4100, ...ej(7.5)],
      ['↑ Reemplaza estas filas de ejemplo por tus partidas. Escribe la cantidad de cada beneficiario en su columna (vacío = no aplica).', '', '', '', '', ...vacias],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, ...cols.map(() => ({ wch: 16 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Distribucion')
    XLSX.writeFile(wb, 'Plantilla_Distribucion.xlsx')
  }

  // ─── Importar cantidades desde Excel (matriz partida × beneficiario) ───
  const importarExcel = async (file: File) => {
    setImportMsg(''); setMsg('')
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      // Hoja cuyo encabezado contenga "partida"
      let hoja = wb.SheetNames[0]
      for (const n of wb.SheetNames) {
        const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true })
        if (rows.some(r => (r || []).some((c: any) => normNombre(c).includes('partida')))) { hoja = n; break }
      }
      const M: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true })
      const hi = M.findIndex(r => (r || []).some((c: any) => normNombre(c).includes('partida')))
      if (hi < 0) { setImportMsg('No se encontró una fila de encabezado con "Partida".'); return }

      const H = (M[hi] || []).map(normNombre)
      const idxOf = (...keys: string[]) => H.findIndex(h => keys.some(k => h === k || h.includes(k)))
      const cPart = idxOf('partida')
      const cCat  = idxOf('categoría', 'categoria', 'subproyecto', 'etapa')
      const cUM   = idxOf('u/m', 'unidad')
      const cMat  = idxOf('mat')
      const cMO   = idxOf('m.o', 'mano', 'hh')
      const usados = new Set([cPart, cCat, cUM, cMat, cMO].filter(i => i >= 0))

      // Columnas de beneficiario = encabezados restantes no vacíos
      const benefCols: { col: number; nombre: string }[] = []
      for (let c = 0; c < (M[hi] || []).length; c++) {
        if (usados.has(c)) continue
        const nom = String(M[hi][c] || '').trim()
        if (!nom || normNombre(nom).includes('total')) continue
        benefCols.push({ col: c, nombre: nom })
      }

      // Emparejar beneficiarios del Excel con los subproyectos existentes
      const mapCol = new Map(columnas.map(col => [normNombre(col.nombre), col.id]))
      const emparej: { col: number; id: string }[] = []
      const noEmparej: string[] = []
      for (const bc of benefCols) {
        const key = normNombre(bc.nombre)
        let id = mapCol.get(key)
        if (!id) {
          const hit = columnas.find(col => {
            const k2 = normNombre(col.nombre)
            return k2.includes(key) || key.includes(k2)
          })
          id = hit?.id
        }
        if (id) emparej.push({ col: bc.col, id }); else noEmparej.push(bc.nombre)
      }

      // Reconstruir filas: partir de las actuales y actualizar/crear según el Excel
      const filasCopia: Fila[] = filas.map(f => ({ ...f, celdas: { ...f.celdas } }))
      const keyFila = (desc: string, cat: string) => normNombre(desc) + '¦' + normNombre(cat)
      const idxFila = new Map(filasCopia.map((f, i) => [keyFila(f.descripcion, f.categoria), i]))
      let nuevas = 0, celdasSet = 0

      for (let r = hi + 1; r < M.length; r++) {
        const row = M[r] || []
        const desc = String(row[cPart] || '').trim()
        if (!desc || normNombre(desc).startsWith('↑')) continue
        const cat = cCat >= 0 ? String(row[cCat] || '').trim() : ''
        let fi = idxFila.get(keyFila(desc, cat))
        if (fi === undefined) {
          filasCopia.push({
            key: 'imp-' + r + '-' + Date.now(),
            categoria: cat, descripcion: desc,
            unidad: cUM >= 0 ? (String(row[cUM] || 'm2').trim() || 'm2') : 'm2',
            costo_material_unit: cMat >= 0 ? (Number(row[cMat]) || 0) : 0,
            costo_mo_unit: cMO >= 0 ? (Number(row[cMO]) || 0) : 0,
            markup_pct: null, celdas: {},
          })
          fi = filasCopia.length - 1
          idxFila.set(keyFila(desc, cat), fi)
          nuevas++
        } else {
          if (cUM >= 0 && String(row[cUM] || '').trim()) filasCopia[fi].unidad = String(row[cUM]).trim()
          if (cMat >= 0 && row[cMat] != null && row[cMat] !== '') filasCopia[fi].costo_material_unit = Number(row[cMat]) || 0
          if (cMO >= 0 && row[cMO] != null && row[cMO] !== '') filasCopia[fi].costo_mo_unit = Number(row[cMO]) || 0
        }
        for (const e of emparej) {
          const v = row[e.col]
          const n = (v === '' || v == null) ? '' : Math.max(0, Number(v) || 0)
          filasCopia[fi].celdas[e.id] = n
          if (n !== '' && Number(n) > 0) celdasSet++
        }
      }

      setFilas(filasCopia)
      const warn = noEmparej.length
        ? ` ⚠ Sin emparejar: ${noEmparej.join(', ')} — revisa que el nombre coincida con un beneficiario del proyecto.`
        : ''
      setImportMsg(`Leído: ${emparej.length} beneficiarios emparejados · ${celdasSet} cantidades · ${nuevas} partidas nuevas.${warn} Revisa y pulsa "Guardar distribución".`)
    } catch (e: any) {
      setImportMsg('No se pudo leer el archivo: ' + (e.message || 'formato no válido'))
    }
  }

  const precioDe = (f: Fila) => {
    const costo = (Number(f.costo_material_unit) || 0) + (Number(f.costo_mo_unit) || 0)
    const mk = f.markup_pct == null ? markupGlobal : f.markup_pct
    return Math.round(costo * (1 + (Number(mk) || 0) / 100))
  }

  const totalCol = (benefId: string) =>
    filas.reduce((s, f) => s + (Number(f.celdas[benefId]) || 0) * precioDe(f), 0)
  const granTotal = useMemo(() => columnas.reduce((s, c) => s + totalCol(c.id), 0), [filas, columnas])

  const guardar = async () => {
    setGuardando(true); setMsg('')
    const toCeldasNum = (celdas: Record<string, number | ''>, zero = false) => {
      const out: Record<string, number> = {}
      for (const c of columnas) out[c.id] = zero ? 0 : (Number(celdas[c.id]) || 0)
      return out
    }
    const payloadFilas = [
      ...filas
        .filter(f => norm(f.descripcion))
        .map(f => ({
          categoria: f.categoria, descripcion: f.descripcion, unidad: f.unidad,
          costo_material_unit: Number(f.costo_material_unit) || 0,
          costo_mo_unit: Number(f.costo_mo_unit) || 0,
          markup_pct: f.markup_pct,
          celdas: toCeldasNum(f.celdas),
        })),
      // Filas removidas → todas las celdas en 0 para que el backend las elimine
      ...removidas.map(f => ({
        categoria: f.categoria, descripcion: f.descripcion, unidad: f.unidad,
        costo_material_unit: Number(f.costo_material_unit) || 0,
        costo_mo_unit: Number(f.costo_mo_unit) || 0,
        markup_pct: f.markup_pct,
        celdas: toCeldasNum(f.celdas, true),
      })),
    ]
    try {
      const res = await fetch('/api/partidas-proyecto/aplicar-matriz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyectoId, markup: markupGlobal, filas: payloadFilas }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Error al guardar'); setGuardando(false); return }
      setMsg(`✓ Guardado: ${data.inserts} nuevas · ${data.updates} actualizadas · ${data.borrados} eliminadas`)
      setRemovidas([])
      onSaved()
    } catch (e: any) {
      setMsg('Error de red: ' + (e.message || ''))
    }
    setGuardando(false)
  }

  if (columnas.length === 0) {
    return (
      <div className="bg-canvas border border-dashed border-line2 rounded-lg p-7 text-center text-[12px] text-muted">
        No hay beneficiarios/subproyectos todavía. Importa un programa primero.
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[12px] text-muted">
          <strong className="text-ink">{filas.length}</strong> partidas ·{' '}
          <strong className="text-ink">{columnas.length}</strong> beneficiarios · total{' '}
          <strong className="text-ink">{fmt(granTotal)}</strong>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Btn onClick={descargarPlantilla} style={{ fontSize: 12, padding: '5px 10px' }}>⬇ Plantilla</Btn>
          <Btn onClick={exportarExcel} style={{ fontSize: 12, padding: '5px 10px' }}>⬇ Exportar datos</Btn>
          <label className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-[5px] rounded-lg border border-line bg-white cursor-pointer hover:border-brand text-ink">
            📥 Importar cantidades
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importarExcel(f); e.currentTarget.value = '' }} />
          </label>
          <Btn onClick={abrirCatalogo} style={{ fontSize: 12, padding: '5px 10px' }}>📋 Del catálogo</Btn>
          <Btn onClick={nuevaFila} style={{ fontSize: 12, padding: '5px 10px' }}>+ Partida</Btn>
          <Btn variant="primary" onClick={guardar} disabled={guardando} style={{ fontSize: 12, padding: '5px 12px' }}>
            {guardando ? 'Guardando…' : 'Guardar distribución'}
          </Btn>
        </div>
      </div>

      {importMsg && (
        <div className={`text-[12px] mb-2 rounded-lg p-2.5 ${importMsg.startsWith('No se') ? 'bg-danger-bg text-danger' : 'bg-[#e8f1fb] text-[#0c447c]'}`}>
          {importMsg}
        </div>
      )}

      {msg && (
        <div className={`text-[12px] mb-2 rounded-lg p-2.5 ${msg.startsWith('✓') ? 'bg-[#e6f4ea] text-[#1a7a4a]' : 'bg-danger-bg text-danger'}`}>
          {msg}
        </div>
      )}

      <div className="overflow-x-auto border border-line rounded-xl">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="bg-canvas">
              <th className="text-left font-bold text-ink px-2 py-2 sticky left-0 bg-canvas z-20 border-b border-line min-w-[240px]">
                Partida
              </th>
              <th className="text-right font-semibold text-muted px-2 py-2 border-b border-line min-w-[70px]">U/M</th>
              <th className="text-right font-semibold text-muted px-2 py-2 border-b border-line min-w-[90px]" title="Costo material por unidad">Mat. $</th>
              <th className="text-right font-semibold text-muted px-2 py-2 border-b border-line min-w-[90px]" title="Costo mano de obra por unidad">M.O. $</th>
              <th className="text-right font-semibold text-brand px-2 py-2 border-b border-line min-w-[90px]" title="Precio de venta por unidad">P.U. venta</th>
              {columnas.map(c => (
                <th key={c.id} className="text-right font-bold text-ink px-2 py-2 border-b border-line whitespace-nowrap min-w-[92px]">
                  {c.nombre}
                </th>
              ))}
              <th className="w-8 border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, fi) => (
              <tr key={f.key} className="border-b border-line2 hover:bg-[#fafbfc]">
                <td className="px-2 py-1 sticky left-0 bg-white z-10">
                  <input value={f.descripcion} onChange={e => setCampo(fi, 'descripcion', e.target.value)}
                    placeholder="Descripción de la partida"
                    className="w-full text-[12px] px-1.5 py-1 border border-transparent hover:border-line rounded focus:border-brand outline-none font-medium text-ink" />
                  <input value={f.categoria} onChange={e => setCampo(fi, 'categoria', e.target.value)}
                    placeholder="Categoría (ej: M1 · Limpieza)"
                    className="w-full text-[10px] px-1.5 py-0.5 border border-transparent hover:border-line rounded focus:border-brand outline-none text-muted" />
                </td>
                <td className="px-1 py-1">
                  <input value={f.unidad} onChange={e => setCampo(fi, 'unidad', e.target.value)}
                    className="w-[56px] text-[12px] text-right px-1 py-1 border border-line2 rounded outline-none focus:border-brand" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" value={f.costo_material_unit || ''} onChange={e => setCampo(fi, 'costo_material_unit', Number(e.target.value) || 0)}
                    className="w-[78px] text-[12px] text-right px-1 py-1 border border-line2 rounded outline-none focus:border-brand" placeholder="0" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" value={f.costo_mo_unit || ''} onChange={e => setCampo(fi, 'costo_mo_unit', Number(e.target.value) || 0)}
                    className="w-[78px] text-[12px] text-right px-1 py-1 border border-line2 rounded outline-none focus:border-brand" placeholder="0" />
                </td>
                <td className="px-2 py-1 text-right font-semibold text-brand whitespace-nowrap">{fmt(precioDe(f))}</td>
                {columnas.map(c => (
                  <td key={c.id} className="px-1 py-1">
                    <input type="number" value={f.celdas[c.id] ?? ''} onChange={e => setCelda(fi, c.id, e.target.value)}
                      className={`w-[80px] text-[12px] text-right px-1.5 py-1 border rounded outline-none focus:border-brand ${
                        Number(f.celdas[c.id]) > 0 ? 'border-[#b5d4f4] bg-[#f4f8fd]' : 'border-line2'}`}
                      placeholder="–" />
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <button onClick={() => quitarFila(fi)} title="Quitar partida"
                    className="w-6 h-6 rounded bg-danger-bg text-danger text-[11px] font-bold">✕</button>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={columnas.length + 6} className="text-center text-muted py-6 text-[12px]">
                Sin partidas. Agrega una con “+ Partida” o tráelas del catálogo.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-canvas border-t-2 border-line">
              <td className="px-2 py-2 font-extrabold text-ink sticky left-0 bg-canvas z-10" colSpan={5}>Total por beneficiario ($)</td>
              {columnas.map(c => (
                <td key={c.id} className="px-2 py-2 text-right font-bold text-ink whitespace-nowrap">{fmt(totalCol(c.id))}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-muted mt-2">
        Escribe la cantidad que aplica a cada beneficiario. Vacío o 0 = no se le aplica esa partida (si ya la tenía, se elimina al guardar).
        Los costos y el precio son compartidos por todos los beneficiarios de esa partida.{' '}
        <a href="/Plantilla_Distribucion.xlsx" download className="text-brand font-semibold hover:underline">
          ⬇ Descargar plantilla de ejemplo
        </a>.
      </p>

      {/* Mini-selector del catálogo */}
      {showCat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCat(false)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex justify-between items-center">
              <div className="text-[13px] font-bold text-ink">Traer partidas del catálogo</div>
              <button onClick={() => setShowCat(false)} className="text-muted text-[12px]">cerrar ✕</button>
            </div>
            <div className="p-3 overflow-y-auto">
              {catLoading ? <p className="text-center text-muted text-[12px] py-4">Cargando…</p>
                : catalogo.length === 0 ? <p className="text-center text-muted text-[12px] py-4">El catálogo está vacío. Créalo en Admin → Catálogo de partidas.</p>
                : catalogo.map(c => {
                  const yaEsta = filas.some(f => norm(f.descripcion).toLowerCase() === norm(c.descripcion).toLowerCase())
                  return (
                    <button key={c.id} onClick={() => agregarDelCatalogo(c)} disabled={yaEsta}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border mb-1 text-left ${yaEsta ? 'border-line2 opacity-50' : 'border-line hover:border-brand'}`}>
                      <span className="text-[12px] text-ink truncate">{c.descripcion} <span className="text-[10px] text-muted">({c.unidad})</span></span>
                      <span className="text-[11px] font-semibold text-brand flex-shrink-0">{yaEsta ? 'agregada' : '+ agregar'}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
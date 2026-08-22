'use client'
// components/ImportarPrograma.tsx
// Importa un Excel de PROGRAMA con varios beneficiarios en grilla horizontal.
// Fila 1: pares (número, nombre) por bloque de columnas. Las partidas
// (subproyecto/etapa/nombre) van en las columnas A-F, compartidas.
// Cada beneficiario tiene su propio bloque de valores (U/M, cant, material, HH).

import { useState } from 'react'
import { Btn, Modal } from '@/components/ui'
import { fmt } from '@/lib/format'

export default function ImportarPrograma({ proyectoId, markup = 20, onImported, onClose }: {
  proyectoId: string
  markup?: number
  onImported: () => void
  onClose: () => void
}) {
  const [parsed, setParsed] = useState<any[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [expandido, setExpandido] = useState<number | null>(0)
  const [reemplazar, setReemplazar] = useState(true)

  const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n }
  const limpiar = (s: any) => String(s || '').trim().replace(/\s+/g, ' ')

  const leerArchivo = async (file: File) => {
    setError(''); setParsed(null); setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      // Hoja con más columnas (la grilla)
      let hoja = wb.SheetNames[0], maxCols = 0
      for (const n of wb.SheetNames) {
        const r = XLSX.utils.decode_range(wb.Sheets[n]['!ref'] || 'A1')
        if (r.e.c > maxCols) { maxCols = r.e.c; hoja = n }
      }
      const ws = wb.Sheets[hoja]
      const M: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
      if (M.length < 3) { setError('El archivo no tiene datos suficientes.'); return }

      // 1) Detectar beneficiarios en la fila 1: (número, nombre) en columnas
      const fila1 = M[0] || []
      const benefCols: { col: number; nombre: string }[] = []
      for (let c = 0; c < fila1.length; c++) {
        const e = fila1[c]
        const nom = fila1[c + 1]
        const esNum = e != null && String(e).trim() !== '' && !isNaN(Number(e)) && Number.isInteger(Number(e))
        if (esNum && nom && String(nom).trim()) {
          const nombre = limpiar(nom)
          if (nombre.toUpperCase().includes('TOTAL')) continue
          benefCols.push({ col: c, nombre })
        }
      }
      if (benefCols.length === 0) {
        setError('No se detectaron beneficiarios en la fila 1. Debe tener el número y el nombre de cada beneficiario en columnas.')
        return
      }

      // 2) Detectar el offset del bloque (distancia entre beneficiarios)
      const offset = benefCols.length > 1 ? (benefCols[1].col - benefCols[0].col) : 10

      // 3) Las columnas de partida compartidas (A=0 subproyecto, C=2 etapa, F=5 partida)
      //    y dentro de cada bloque: +1 partida, +2 U/M, +4 cant, +6 material, +8 HH
      const COL_SUB = 0, COL_ETAPA = 2

      const beneficiarios = benefCols.map(bc => {
        const cPart = bc.col + 1, cUni = bc.col + 2, cCant = bc.col + 4, cMat = bc.col + 6, cHH = bc.col + 8
        const soluciones: any[] = []
        let curSol: any = null, curEta: any = null
        for (let r = 2; r < M.length; r++) {
          const row = M[r] || []
          const a = limpiar(row[COL_SUB])
          const c = limpiar(row[COL_ETAPA])
          const f = limpiar(row[cPart])
          if (a) { curSol = { nombre: a, etapas: [] }; soluciones.push(curSol); curEta = null }
          if (c && curSol) { curEta = { nombre: c, partidas: [] }; curSol.etapas.push(curEta) }
          if (!f || !curSol) continue
          if (!curEta) { curEta = { nombre: 'General', partidas: [] }; curSol.etapas.push(curEta) }
          curEta.partidas.push({
            descripcion: f,
            unidad: limpiar(row[cUni]) || 'm2',
            cantidad: num(row[cCant]),
            material: num(row[cMat]),
            mano_obra: num(row[cHH]),
          })
        }
        // Descartar soluciones/etapas sin partidas
        const solLimpias = soluciones
          .map(s => ({ ...s, etapas: s.etapas.filter((e: any) => e.partidas.length > 0) }))
          .filter(s => s.etapas.length > 0)
        const costo = solLimpias.reduce((sum: number, s: any) =>
          sum + s.etapas.reduce((a: number, e: any) =>
            a + e.partidas.reduce((x: number, p: any) => x + p.cantidad * (p.material + p.mano_obra), 0), 0), 0)
        return { nombre: bc.nombre, soluciones: solLimpias, costo }
      }).filter(b => b.soluciones.length > 0)

      if (beneficiarios.length === 0) {
        setError('Se detectaron beneficiarios pero sin partidas válidas. Revisa que las columnas de cada bloque estén completas.')
        return
      }
      setParsed(beneficiarios)
    } catch (e: any) {
      setError('No se pudo leer el archivo: ' + (e.message || 'formato no válido'))
    }
  }

  const totales = parsed ? {
    benef: parsed.length,
    partidas: parsed.reduce((s, b) => s + b.soluciones.reduce((a: number, sol: any) =>
      a + sol.etapas.reduce((x: number, e: any) => x + e.partidas.length, 0), 0), 0),
    costo: parsed.reduce((s, b) => s + b.costo, 0),
  } : null

  const confirmar = async () => {
    if (!parsed) return
    setImporting(true); setError('')
    // Aplanar la estructura anidada (soluciones → etapas → partidas) al formato
    // plano { nombre, partidas[] } que espera la API. La categoría "Subproyecto · Etapa"
    // se guarda en cada partida (campo notas) para agruparlas luego en el resumen.
    const beneficiarios = parsed.map(b => ({
      nombre: b.nombre,
      partidas: b.soluciones.flatMap((s: any) =>
        s.etapas.flatMap((e: any) =>
          e.partidas.map((p: any) => ({
            descripcion: p.descripcion,
            unidad: p.unidad,
            cantidad: p.cantidad,
            material: p.material,
            mano_obra: p.mano_obra,
            categoria: [s.nombre, e.nombre].filter(Boolean).join(' · '),
          }))
        )
      ),
    }))
    const res = await fetch('/api/partidas-proyecto/importar-programa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyecto_id: proyectoId, beneficiarios, markup, reemplazar }),
    })
    const data = await res.json()
    setImporting(false)
    if (!res.ok) { setError(data.error || 'Error al importar'); return }
    onImported(); onClose()
  }

  return (
    <Modal title="Importar programa (varios beneficiarios)" onClose={onClose}>
      {!parsed ? (
        <div>
          <p className="text-[13px] text-muted mb-3">
            Sube el Excel del programa. Cada <strong>beneficiario</strong> debe estar en la fila 1
            (número y nombre), con su propio bloque de columnas. Las partidas (subproyecto, etapa, nombre)
            van en las primeras columnas, compartidas por todos.
          </p>
          <div className="bg-[#FCEAE3] border border-[#b5d4f4] rounded-lg p-3 mb-3 text-[11px] text-[#0c447c]">
            Cada beneficiario se creará como un <strong>subproyecto</strong> dentro de esta obra, con sus
            soluciones y partidas. Podrás medir avance y rentabilidad por beneficiario o del programa completo.
          </div>
          <a href="/Plantilla_Programa_Beneficiarios.xlsx" download
            className="flex items-center gap-2 text-[12px] text-brand font-semibold mb-3 hover:underline">
            Descargar plantilla de programa
            <span className="text-[11px] text-muted font-normal">(con la grilla de beneficiarios lista)</span>
          </a>
          <label className="block border-2 border-dashed border-line rounded-xl p-8 text-center cursor-pointer hover:border-brand hover:bg-brand-bg/30 transition">
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f) }} />
            <div className="text-3xl mb-2"></div>
            <div className="text-[13px] font-semibold text-brand">Elegir Excel del programa</div>
            <div className="text-[11px] text-muted mt-1">.xlsx o .xls</div>
          </label>
          {fileName && !error && <p className="text-[12px] text-muted mt-2">Leyendo: {fileName}…</p>}
          {error && <p className="text-[12px] text-danger mt-3 bg-danger-bg rounded-lg p-2.5">{error}</p>}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-canvas rounded-lg p-2.5 text-center">
              <div className="text-lg font-extrabold text-ink">{totales!.benef}</div>
              <div className="text-[10px] text-muted">Beneficiarios</div>
            </div>
            <div className="bg-canvas rounded-lg p-2.5 text-center">
              <div className="text-lg font-extrabold text-ink">{totales!.partidas}</div>
              <div className="text-[10px] text-muted">Partidas totales</div>
            </div>
            <div className="bg-canvas rounded-lg p-2.5 text-center">
              <div className="text-sm font-extrabold text-ink">{fmt(totales!.costo)}</div>
              <div className="text-[10px] text-muted">Costo total</div>
            </div>
          </div>

          <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-1.5">Beneficiarios detectados</div>
          <div className="max-h-[280px] overflow-y-auto flex flex-col gap-1 mb-3">
            {parsed.map((b, i) => {
              const npart = b.soluciones.reduce((a: number, s: any) => a + s.etapas.reduce((x: number, e: any) => x + e.partidas.length, 0), 0)
              const abierto = expandido === i
              return (
                <div key={i} className="border border-line rounded-lg overflow-hidden">
                  <button onClick={() => setExpandido(abierto ? null : i)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-white text-left">
                    <span className="text-[10px] text-muted" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span className="text-[11px] font-bold text-brand bg-[#FCEAE3] px-1.5 py-0.5 rounded">{i + 1}</span>
                    <span className="text-[12px] font-bold text-ink flex-1 truncate">{b.nombre}</span>
                    <span className="text-[10px] text-muted">{b.soluciones.length} soluciones · {npart} part.</span>
                    <span className="text-[11px] font-semibold text-ink">{fmt(b.costo)}</span>
                  </button>
                  {abierto && (
                    <div className="px-3 py-2 bg-[#FBFAF9] border-t border-line2 max-h-[160px] overflow-y-auto">
                      {b.soluciones.map((s: any, j: number) => (
                        <div key={j} className="text-[11px] text-muted py-0.5">
                          {s.nombre} <span className="text-subtle">({s.etapas.reduce((x: number, e: any) => x + e.partidas.length, 0)} partidas)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-[#FCEAE3] border border-[#b5d4f4] rounded-lg px-3 py-2.5 mb-3 text-[12px] text-[#0c447c]">
            Se crearán <strong>{totales!.benef} beneficiarios</strong> con <strong>{totales!.partidas} partidas en total</strong>
            {totales!.benef > 0 && <> (~{Math.round(totales!.partidas / totales!.benef)} por beneficiario)</>}.
            Es normal que sean muchas: cada beneficiario tiene su propio juego de partidas.
          </div>
          <p className="text-[11px] text-muted mb-2">
            Cada beneficiario será un subproyecto con su árbol de soluciones y partidas. El precio de venta usa tu markup ({markup}%).
          </p>
          <label className="flex items-center gap-2 mb-3 text-[12px] text-ink cursor-pointer bg-[#fff8e6] border border-[#f0dca8] rounded-lg px-3 py-2">
            <input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)} />
            <span><strong>Reemplazar las partidas actuales</strong> de este proyecto (recomendado — evita duplicar si ya importaste antes)</span>
          </label>
          {error && <p className="text-[12px] text-danger mb-2 bg-danger-bg rounded-lg p-2.5">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Btn onClick={() => { setParsed(null); setFileName('') }}>Elegir otro</Btn>
            <Btn variant="primary" onClick={confirmar} disabled={importing}>
              {importing ? 'Importando…' : `Importar ${totales!.benef} beneficiarios`}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}
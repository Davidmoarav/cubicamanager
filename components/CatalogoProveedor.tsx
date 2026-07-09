'use client'
// components/CatalogoProveedor.tsx
// Gestor del catálogo de productos de un proveedor: lista, alta individual
// y carga masiva desde CSV (con previsualización).

import { useState, useRef } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, Modal, fmt } from '@/components/ui'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ';' : ','
  const headers = lines[0].split(sep).map(norm)
  const idx = (names: string[]) => { for (const n of names) { const i = headers.findIndex(h => h.includes(norm(n))); if (i >= 0) return i } return -1 }
  const iCod  = idx(['codigo', 'sku', 'cod'])
  const iDesc = idx(['descripcion', 'producto', 'nombre', 'detalle', 'glosa'])
  const iUn   = idx(['unidad', 'unid', 'um'])
  const iPre  = idx(['precio', 'valor', 'costo', 'preciounitario'])
  const num = (s: string) => Number((s || '').replace(/[^\d]/g, '')) || 0
  return lines.slice(1).map(line => {
    const c = line.split(sep)
    return {
      codigo:      iCod  >= 0 ? (c[iCod]  || '').trim() : '',
      descripcion: iDesc >= 0 ? (c[iDesc] || '').trim() : (c[0] || '').trim(),
      unidad:      iUn   >= 0 ? (c[iUn]   || 'un').trim() : 'un',
      precio:      iPre  >= 0 ? num(c[iPre]) : 0,
    }
  }).filter(p => p.descripcion)
}

export default function CatalogoProveedor({ proveedor, onClose }: { proveedor: any; onClose: () => void }) {
  const { data: productos = [], mutate } = useSWR<any[]>(`/api/proveedor-productos?proveedor_id=${proveedor.id}`, fetcher)
  const [nuevo, setNuevo]         = useState({ codigo: '', descripcion: '', unidad: 'un', precio: '' })
  const [preview, setPreview]     = useState<any[] | null>(null)
  const [reemplazar, setReemplazar] = useState(true)
  const [msg, setMsg]             = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const agregar = async () => {
    if (!nuevo.descripcion.trim()) return
    await fetch('/api/proveedor-productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuevo, proveedor_id: proveedor.id }),
    })
    setNuevo({ codigo: '', descripcion: '', unidad: 'un', precio: '' })
    mutate()
  }

  const borrar = async (id: string) => {
    await fetch('/api/proveedor-productos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    mutate()
  }

  const onFile = (e: any) => {
    const f = e.target.files?.[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = () => { setPreview(parseCSV(String(reader.result))); setMsg('') }
    reader.readAsText(f)
  }

  const confirmarImport = async () => {
    if (!preview?.length) return
    setImporting(true)
    const res = await fetch('/api/proveedor-productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productos: preview, proveedor_id: proveedor.id, reemplazar }),
    })
    const data = await res.json(); setImporting(false)
    if (!res.ok) { setMsg(data.error || 'Error al cargar'); return }
    setPreview(null); if (fileRef.current) fileRef.current.value = ''
    setMsg(`${data.insertados} productos cargados`); mutate()
  }

  const descargarPlantilla = () => {
    const filas = [
      'codigo;descripcion;unidad;precio',
      'ADH-01;Adhesivo EIFS 25 kg;saco;12000',
      'MAL-02;Malla fibra de vidrio;m2;900',
      'PERF-03;Perfil PVC arranque;ml;2500',
    ].join('\n')
    const blob = new Blob(['\ufeff' + filas], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_catalogo.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Modal wide title={`Catálogo — ${proveedor.nombre}`} onClose={onClose}>
      {/* Carga CSV */}
      <div className="bg-canvas rounded-card p-3.5 mb-4">
        <div className="text-[13px] font-bold text-ink mb-1">Cargar desde CSV</div>
        <p className="text-[11px] text-muted mb-2">Columnas: código, descripción, unidad, precio. Detecta el separador ( , o ; ) automáticamente.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="text-[12px]" />
          <button onClick={descargarPlantilla} className="text-[12px] text-brand font-semibold underline">
            Descargar plantilla CSV
          </button>
        </div>
        {preview && (
          <div className="mt-3">
            <p className="text-[12px] text-ink mb-2 font-semibold">{preview.length} productos detectados</p>
            <div className="max-h-[160px] overflow-y-auto border border-line rounded-lg mb-2 bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-canvas sticky top-0"><tr>
                  <th className="text-left px-2 py-1">Código</th><th className="text-left px-2 py-1">Descripción</th>
                  <th className="px-2 py-1">Unidad</th><th className="text-right px-2 py-1">Precio</th>
                </tr></thead>
                <tbody>{preview.slice(0, 50).map((p, i) => (
                  <tr key={i} className="border-t border-[#f0f4f8]">
                    <td className="px-2 py-1">{p.codigo}</td><td className="px-2 py-1">{p.descripcion}</td>
                    <td className="px-2 py-1 text-center">{p.unidad}</td><td className="px-2 py-1 text-right">{fmt(p.precio)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-muted mb-2">
              <input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)} />
              Reemplazar el catálogo actual (si lo desmarcas, se agregan al existente)
            </label>
            <Btn variant="primary" onClick={confirmarImport} disabled={importing}>{importing ? 'Cargando…' : `Cargar ${preview.length} productos`}</Btn>
          </div>
        )}
        {msg && <p className="text-[12px] text-success mt-2 font-semibold">{msg}</p>}
      </div>

      {/* Alta individual */}
      <div className="grid grid-cols-[1fr_2.2fr_0.7fr_1fr_auto] gap-2 items-end mb-3">
        <div><label className="text-[11px] text-muted block mb-0.5">Código</label><input value={nuevo.codigo} onChange={e => setNuevo(n => ({ ...n, codigo: e.target.value }))} className="input-base !mb-0 !py-1" /></div>
        <div><label className="text-[11px] text-muted block mb-0.5">Descripción</label><input value={nuevo.descripcion} onChange={e => setNuevo(n => ({ ...n, descripcion: e.target.value }))} className="input-base !mb-0 !py-1" /></div>
        <div><label className="text-[11px] text-muted block mb-0.5">Unidad</label><input value={nuevo.unidad} onChange={e => setNuevo(n => ({ ...n, unidad: e.target.value }))} className="input-base !mb-0 !py-1" /></div>
        <div><label className="text-[11px] text-muted block mb-0.5">Precio</label><input type="number" value={nuevo.precio} onChange={e => setNuevo(n => ({ ...n, precio: e.target.value }))} className="input-base !mb-0 !py-1" /></div>
        <Btn onClick={agregar}>+ Agregar</Btn>
      </div>

      {/* Lista */}
      <div className="max-h-[280px] overflow-y-auto border border-line rounded-lg">
        {productos.length === 0
          ? <p className="text-muted text-center py-6 text-[13px]">Sin productos. Carga un CSV o agrega uno arriba.</p>
          : (
            <table className="w-full text-[12px]">
              <thead className="bg-canvas sticky top-0"><tr>
                <th className="text-left px-2 py-1.5">Código</th><th className="text-left px-2 py-1.5">Descripción</th>
                <th className="px-2 py-1.5">Unidad</th><th className="text-right px-2 py-1.5">Precio</th><th className="px-2 py-1.5"></th>
              </tr></thead>
              <tbody>{productos.map(p => (
                <tr key={p.id} className="border-t border-[#f0f4f8]">
                  <td className="px-2 py-1.5 font-mono text-[11px]">{p.codigo}</td>
                  <td className="px-2 py-1.5">{p.descripcion}</td>
                  <td className="px-2 py-1.5 text-center text-muted">{p.unidad}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{fmt(p.precio)}</td>
                  <td className="px-2 py-1.5 text-right"><button onClick={() => borrar(p.id)} className="text-danger text-[13px]">✕</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      <div className="text-[11px] text-muted mt-2">{productos.length} productos en catálogo</div>
    </Modal>
  )
}
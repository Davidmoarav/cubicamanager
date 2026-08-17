'use client'
// components/ImportadorSII.tsx
// Sube el CSV del Registro de Compras y Ventas del SII, lo parsea,
// detecta columnas por nombre, identifica tipo de documento y previsualiza.

import { useState } from 'react'
import useSWR from 'swr'
import { Btn, Modal } from '@/components/ui'
import { fetcher } from '@/lib/fetcher'
import { fmt } from '@/lib/format'
import { decodificarCSV, splitCSVLine, parseFechaSII, parseMontoSII, mapTipoDocSII } from '@/lib/sii'

interface FilaSII {
  numero: string
  contraparte: string
  rut: string
  neto: number
  exento?: number
  iva: number
  total: number
  emision: string | null
  periodo: string | null
  doc_tipo: string
  ref_detectada?: string   // folio de factura referenciada (col "NCE o NDE sobre Fact")
}

interface Props {
  onImported?: () => void
}

// Buscador de facturas existentes (filtra por folio o proveedor/cliente)
function BuscadorFactura({ tipo, value, label, onChange }: { tipo: string; value: string; label?: string; onChange: (factura: any) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  // Búsqueda server-side (no precarga todas las facturas)
  const { data: resultados = [] } = useSWR<any[]>(
    open && q.trim().length >= 1 ? `/api/facturas?tipo=${tipo}&doc_tipo=factura&buscar=${encodeURIComponent(q.trim())}` : null,
    fetcher,
  )

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input-base !mb-0 !py-1 w-[200px] text-left truncate cursor-pointer">
        {value ? `N° ${label || '—'}` : 'Buscar factura…'}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-[260px] bg-white border border-line rounded-lg shadow-lg max-h-[220px] overflow-y-auto">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Folio o proveedor…"
            className="w-full px-2.5 py-2 text-[12px] border-b border-line outline-none sticky top-0 bg-white" />
          {q.trim().length < 1
            ? <div className="px-2.5 py-3 text-[11px] text-muted text-center">Escribe para buscar…</div>
            : resultados.length === 0
            ? <div className="px-2.5 py-3 text-[11px] text-muted text-center">Sin facturas que coincidan</div>
            : resultados.map(f => (
              <button type="button" key={f.id} onClick={() => { onChange(f); setOpen(false); setQ('') }}
                className="w-full text-left px-2.5 py-2 text-[11px] hover:bg-canvas border-b border-[#F1ECE6] leading-tight">
                <span className="font-bold text-ink">N° {f.numero}</span>
                <span className="text-muted"> · {f.emision || '—'}</span><br />
                <span className="truncate">{f.cliente}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export default function ImportadorSII({ onImported }: Props) {
  const [open, setOpen]       = useState(false)
  const [tipo, setTipo]       = useState<'compra' | 'venta'>('compra')
  const [filas, setFilas]     = useState<FilaSII[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError]     = useState('')
  const [omitidas, setOmitidas] = useState(0)   // filas del CSV sin montos (no importables)
  // Cuando el archivo es SOLO notas (sin columna Tipo Doc), forzar el tipo
  const [docForzado, setDocForzado] = useState<'auto' | 'nota_credito' | 'nota_debito'>('auto')
  // Paso de asociación de notas a su factura
  const [asociar, setAsociar] = useState(false)
  const [refs, setRefs]       = useState<Record<number, string>>({})   // index -> id de factura (UUID)
  const [refLabels, setRefLabels] = useState<Record<number, string>>({})   // index -> folio (display)

  // Normaliza nombre de columna para buscar (sin tildes, minúsculas)
  const norm = (s: string) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

  const procesarArchivo = (file: File) => {
    setError(''); setResultado(null)
    setNombreArchivo(file.name)

    // Detectar tipo por nombre de archivo
    if (/venta/i.test(file.name)) setTipo('venta')
    else if (/compra/i.test(file.name)) setTipo('compra')

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        // Decodifica UTF-8 y, si viene corrupto (SII exporta Latin-1), reintenta en Windows-1252
        const texto = decodificarCSV(e.target?.result as ArrayBuffer)
        const lineas = texto.split(/\r?\n/).filter(l => l.trim())
        if (lineas.length < 2) { setError('El archivo está vacío o no tiene datos'); return }

        // Detectar separador (; o ,)
        const sep = lineas[0].includes(';') ? ';' : ','
        const header = splitCSVLine(lineas[0], sep).map(h => norm(h))

        // Buscar índices de columnas por nombre (flexible)
        const idx = (nombres: string[]) => {
          for (const n of nombres) {
            const i = header.findIndex(h => h.includes(norm(n)))
            if (i >= 0) return i
          }
          return -1
        }

        const iFolio  = idx(['folio'])
        const iRut    = idx(['rutproveedor', 'rutcliente', 'rut'])
        const iRazon  = idx(['razonsocial', 'razon'])
        const iFecha  = idx(['fechadocto', 'fechaemision', 'fecha'])
        const iNeto   = idx(['montoneto', 'neto'])
        const iExento = idx(['montoexento', 'exento'])
        const iIva    = idx(['montoivarecuperable', 'ivarecuperable', 'montoiva', 'iva'])
        const iTotal  = idx(['montototal', 'total'])
        const iTipoDoc= idx(['tipodoc', 'tipodte', 'tipodocumento'])
        const iRef    = idx(['nceondesobrefact', 'ndesobrefact', 'sobrefactdecompra', 'sobrefact', 'facturareferencia', 'referencia'])

        if (iNeto < 0 || iTotal < 0) {
          setError('No se reconocen las columnas del archivo. ¿Es un RCV del SII?')
          return
        }

        const parsed: FilaSII[] = []
        let sinMontos = 0
        for (let i = 1; i < lineas.length; i++) {
          // Split que respeta comillas: "EMPRESA X, LTDA" ya no corre las columnas
          const c = splitCSVLine(lineas[i], sep)
          const neto = parseMontoSII(c[iNeto])
          const exento = iExento >= 0 ? parseMontoSII(c[iExento]) : 0
          const total = parseMontoSII(c[iTotal])
          const iva = iIva >= 0 ? parseMontoSII(c[iIva]) : 0
          if (neto === 0 && total === 0 && exento === 0 && iva === 0) { sinMontos++; continue }

          const emision = iFecha >= 0 ? parseFechaSII(c[iFecha]) : null
          const codTipo = iTipoDoc >= 0 ? (c[iTipoDoc] || '').trim() : '33'

          parsed.push({
            numero: iFolio >= 0 ? (c[iFolio] || '').trim() : '',
            contraparte: iRazon >= 0 ? (c[iRazon] || '').trim() : 'Sin nombre',
            rut: iRut >= 0 ? (c[iRut] || '').trim() : '',
            neto: neto + exento,   // el neto total incluye lo exento (sin IVA)
            exento,
            iva,
            total,
            emision,
            periodo: emision ? emision.slice(0, 7) : null,
            doc_tipo: mapTipoDocSII(codTipo),
            ref_detectada: iRef >= 0 ? (c[iRef] || '').trim() : '',
          })
        }

        setOmitidas(sinMontos)
        if (parsed.length === 0) { setError('No se encontraron facturas válidas en el archivo'); return }
        setFilas(parsed)
      } catch (err: any) {
        setError('Error al leer el archivo: ' + (err?.message || 'desconocido'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const totales = filas.reduce((acc, f) => ({
    neto: acc.neto + f.neto,
    iva: acc.iva + f.iva,
    total: acc.total + f.total,
    nc: acc.nc + (f.doc_tipo === 'nota_credito' ? 1 : 0),
    nd: acc.nd + (f.doc_tipo === 'nota_debito' ? 1 : 0),
    boletas: acc.boletas + (f.doc_tipo === 'boleta' ? 1 : 0),
  }), { neto: 0, iva: 0, total: 0, nc: 0, nd: 0, boletas: 0 })

  const aplicarTipo = (f: FilaSII) => docForzado === 'auto' ? f : { ...f, doc_tipo: docForzado }
  const esNota = (dt: string) => dt === 'nota_credito' || dt === 'nota_debito'

  // Paso 1: al confirmar la previsualización. Si hay notas, va al paso de asociación.
  const revisar = async () => {
    setError('')
    const final = filas.map(aplicarTipo)
    const hayNotas = final.some(f => esNota(f.doc_tipo))
    if (hayNotas) {
      // Folios de factura referenciados que trae el SII (col 23)
      const foliosDetectados: Record<number, string> = {}
      final.forEach((f, i) => {
        if (esNota(f.doc_tipo)) {
          const r = (f.ref_detectada || '').replace(/[^\d]/g, '')
          if (r && r !== '0') foliosDetectados[i] = r
        }
      })

      // Resolver esos folios a facturas existentes (folio -> {id, numero})
      const listaFolios = Array.from(new Set(Object.values(foliosDetectados)))
      const idPorFolio: Record<string, string> = {}
      if (listaFolios.length > 0) {
        const fx = await fetch(`/api/facturas?tipo=${tipo}&doc_tipo=factura&folios=${listaFolios.join(',')}`)
          .then(r => r.json()).catch(() => [])
        for (const f of Array.isArray(fx) ? fx : []) idPorFolio[String(f.numero)] = f.id
      }

      const seedRefs: Record<number, string> = {}
      const seedLabels: Record<number, string> = {}
      for (const [iStr, folio] of Object.entries(foliosDetectados)) {
        const i = Number(iStr)
        if (idPorFolio[folio]) {           // la factura referenciada ya está cargada
          seedRefs[i] = idPorFolio[folio]
          seedLabels[i] = folio
        }
      }
      setRefs(seedRefs)
      setRefLabels(seedLabels)
      setAsociar(true)
    } else {
      guardar()
    }
  }

  // Paso 2: guardar (con la factura referenciada por cada nota).
  // La asociación es OPCIONAL: si la factura original no está en el sistema
  // (p. ej. es de un período anterior no importado), la nota se guarda igual
  // — el IVA la considera de todas formas — y se puede asociar después.
  const [avisadoSinAsociar, setAvisadoSinAsociar] = useState(false)
  const guardar = async (forzar = false) => {
    setError('')
    const final = filas.map(aplicarTipo)
    const sinAsociar = final.some((f, i) => esNota(f.doc_tipo) && !refs[i])
    if (sinAsociar && !forzar && !avisadoSinAsociar) {
      setAvisadoSinAsociar(true)
      setError('Hay notas sin factura asociada. Puedes asociarlas ahora, o presionar "Guardar de todas formas": se importan igual (el IVA las considera) y las puedes asociar después.')
      return
    }
    setImporting(true)
    const payload = final.map((f, i) => ({
      ...f,
      factura_ref: esNota(f.doc_tipo) ? (refs[i] || null) : null,
    }))
    const res = await fetch('/api/importar-sii', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filas: payload, tipo }),
    })
    const data = await res.json()
    setImporting(false)
    if (!res.ok) { setError(data.error || 'Error al importar'); return }
    setAsociar(false)
    setResultado(data)
    onImported?.()
  }

  const reset = () => { setFilas([]); setNombreArchivo(''); setResultado(null); setError(''); setDocForzado('auto'); setAsociar(false); setRefs({}); setRefLabels({}); setOmitidas(0); setAvisadoSinAsociar(false) }

  return (
    <>
      <Btn onClick={() => setOpen(true)} className="!bg-success-bg !border-[#b9e0c9] !text-success font-bold">
        Importar del SII
      </Btn>

      {open && (
        <Modal title="Importar Registro de Compras/Ventas (SII)" onClose={() => { setOpen(false); reset() }}>
          {!resultado ? (
            asociar ? (
              /* ─── PASO: asociar notas a su factura ─── */
              <>
                <p className="text-[13px] text-muted mb-4">
                  Estas notas de crédito/débito deben asociarse a su factura. El SII trae la referencia cuando existe; confírmala o corrígela antes de guardar.
                </p>
                <div className="max-h-[320px] overflow-y-auto border border-line rounded-lg mb-4">
                  <table className="w-full text-[12px]">
                    <thead className="bg-canvas sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 text-muted font-semibold">Nota</th>
                        <th className="text-left px-2 py-1.5 text-muted font-semibold">Proveedor/Cliente</th>
                        <th className="text-right px-2 py-1.5 text-muted font-semibold">Monto</th>
                        <th className="text-left px-2 py-1.5 text-muted font-semibold">N° factura asociada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map(aplicarTipo).map((f, i) => ({ f, i })).filter(x => esNota(x.f.doc_tipo)).map(({ f, i }) => (
                        <tr key={i} className="border-t border-[#F1ECE6]">
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {f.numero} <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${f.doc_tipo === 'nota_credito' ? 'bg-danger-bg text-danger' : 'bg-brand-bg text-brand'}`}>{f.doc_tipo === 'nota_credito' ? 'NC' : 'ND'}</span>
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[130px]">{f.contraparte}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.total)}</td>
                          <td className="px-2 py-1.5">
                            <BuscadorFactura
                              tipo={tipo}
                              value={refs[i] ?? ''}
                              label={refLabels[i]}
                              onChange={f => { setRefs(r => ({ ...r, [i]: f.id })); setRefLabels(l => ({ ...l, [i]: String(f.numero) })) }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {error && <div className="bg-danger-bg border border-[#f5c6c2] text-danger px-3 py-2.5 rounded-lg text-[12px] mb-4">{error}</div>}
                <div className="flex gap-2 justify-end">
                  <Btn onClick={() => setAsociar(false)}>Volver</Btn>
                  {avisadoSinAsociar && (
                    <Btn onClick={() => guardar(true)} disabled={importing}>Guardar de todas formas</Btn>
                  )}
                  <Btn variant="primary" onClick={() => guardar()} disabled={importing}>{importing ? 'Guardando…' : 'Asociar y guardar'}</Btn>
                </div>
              </>
            ) : (
            <>
              <p className="text-[13px] text-muted mb-4">
                Sube el archivo CSV que descargaste del SII (Registro de Compras y Ventas). El sistema detecta las columnas automáticamente.
              </p>

              {/* Tipo */}
              <div className="mb-4">
                <label className="label-base">Tipo de registro</label>
                <div className="flex gap-2">
                  <button onClick={() => setTipo('compra')}
                    className={`flex-1 py-2.5 rounded-lg border-[1.5px] text-[13px] font-bold transition ${tipo === 'compra' ? 'border-accent bg-accent-bg text-accent' : 'border-line2 text-muted'}`}>
                    Compras (IVA crédito)
                  </button>
                  <button onClick={() => setTipo('venta')}
                    className={`flex-1 py-2.5 rounded-lg border-[1.5px] text-[13px] font-bold transition ${tipo === 'venta' ? 'border-success bg-success-bg text-success' : 'border-line2 text-muted'}`}>
                    Ventas (IVA débito)
                  </button>
                </div>
              </div>

              {/* Carga de archivo */}
              <label className="block border-2 border-dashed border-line2 rounded-xl p-6 text-center cursor-pointer hover:border-brand hover:bg-brand-bg/30 transition mb-4">
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => e.target.files?.[0] && procesarArchivo(e.target.files[0])} />
                <div className="text-3xl mb-2"></div>
                <div className="text-[13px] font-semibold text-ink">{nombreArchivo || 'Haz clic para elegir el CSV del SII'}</div>
                <div className="text-[11px] text-muted mt-1">Archivo .csv separado por ; o ,</div>
              </label>

              {error && (
                <div className="bg-danger-bg border border-[#f5c6c2] text-danger px-3 py-2.5 rounded-lg text-[12px] mb-4">{error}</div>
              )}

              {/* Previsualización */}
              {filas.length > 0 && (
                <>
                  <div className="bg-canvas border border-line rounded-xl p-4 mb-4">
                    <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-3">Resumen del archivo</div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><div className="text-[11px] text-muted">Documentos</div><div className="text-base font-bold text-ink">{filas.length}</div></div>
                      <div><div className="text-[11px] text-muted">Neto</div><div className="text-base font-bold text-ink">{fmt(totales.neto)}</div></div>
                      <div><div className="text-[11px] text-muted">IVA {tipo === 'compra' ? 'crédito' : 'débito'}</div><div className={`text-base font-bold ${tipo === 'compra' ? 'text-success' : 'text-brand'}`}>{fmt(totales.iva)}</div></div>
                    </div>
                    {(totales.nc > 0 || totales.nd > 0 || totales.boletas > 0 || omitidas > 0) && (
                      <div className="flex flex-wrap gap-3 text-[11px] text-muted pt-2 border-t border-line">
                        {totales.boletas > 0 && <span>{totales.boletas} boleta(s)/comprobante(s)</span>}
                        {totales.nc > 0 && <span>{totales.nc} nota(s) de crédito</span>}
                        {totales.nd > 0 && <span>{totales.nd} nota(s) de débito</span>}
                        {omitidas > 0 && <span className="text-warning">{omitidas} fila(s) sin montos omitida(s)</span>}
                      </div>
                    )}
                  </div>

                  {/* Forzar tipo de documento (para archivos de solo notas sin columna Tipo Doc) */}
                  <div className="bg-canvas border border-line rounded-xl p-4 mb-4">
                    <label className="label-base">¿Qué tipo de documento contiene este archivo?</label>
                    <select value={docForzado} onChange={e => setDocForzado(e.target.value as any)} className="input-base cursor-pointer">
                      <option value="auto">Detectar automático (facturas, o por código si existe)</option>
                      <option value="nota_credito">Todo son notas de CRÉDITO</option>
                      <option value="nota_debito">Todo son notas de DÉBITO</option>
                    </select>
                    <p className="text-[11px] text-muted mt-1.5">
                      Si el SII te entrega las notas en un archivo separado (sin columna de tipo), elige aquí qué son.
                    </p>
                  </div>

                  {/* Primeras filas */}
                  <div className="max-h-[160px] overflow-y-auto mb-4 border border-line rounded-lg">
                    <table className="w-full text-[11px]">
                      <thead className="bg-canvas sticky top-0">
                        <tr><th className="text-left px-2 py-1.5 text-muted font-semibold">Folio</th><th className="text-left px-2 py-1.5 text-muted font-semibold">Proveedor/Cliente</th><th className="text-right px-2 py-1.5 text-muted font-semibold">Neto</th><th className="text-right px-2 py-1.5 text-muted font-semibold">IVA</th></tr>
                      </thead>
                      <tbody>
                        {filas.slice(0, 30).map((f, i) => (
                          <tr key={i} className="border-t border-[#F1ECE6]">
                            <td className="px-2 py-1.5">{f.numero}</td>
                            <td className="px-2 py-1.5 truncate max-w-[140px]">{f.contraparte}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.neto)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.iva)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filas.length > 30 && <div className="text-center text-[10px] text-muted py-1.5">… y {filas.length - 30} más</div>}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Btn onClick={reset}>Cambiar archivo</Btn>
                    <Btn variant="primary" onClick={revisar} disabled={importing}>
                      {importing ? 'Importando…' : (filas.map(aplicarTipo).some(f => esNota(f.doc_tipo)) ? 'Continuar → asociar notas' : `Importar ${filas.length} documentos`)}
                    </Btn>
                  </div>
                </>
              )}
            </>
            )
          ) : (
            /* Resultado */
            <div className="text-center py-4">
              <div className="text-4xl mb-3"></div>
              <div className="text-base font-bold text-ink mb-2">Importación completada</div>
              <div className="text-[13px] text-muted mb-1">{resultado.insertadas} documento(s) importado(s)</div>
              {resultado.duplicadas > 0 && (
                <div className="text-[12px] text-warning mb-1">{resultado.duplicadas} ya existían (omitidas)</div>
              )}
              {(resultado.omitidas ?? 0) > 0 && (
                <div className="text-[12px] text-warning mb-1">{resultado.omitidas} fila(s) sin montos válidos</div>
              )}
              {(resultado.fallidas ?? 0) > 0 && (
                <div className="text-[12px] text-danger mb-1">
                  <div className="font-semibold">{resultado.fallidas} fila(s) fallaron al guardar</div>
                  {resultado.detalle_fallidas?.length > 0 && (
                    <div className="mt-1.5 text-left bg-danger-bg border border-[#f5c6c2] rounded-lg p-2 max-w-[420px] mx-auto">
                      <div className="text-[11px] text-danger mb-1">Motivo (primer error):</div>
                      <div className="text-[11px] font-mono break-words">{resultado.detalle_fallidas[0]?.motivo || 'sin detalle'}</div>
                      <div className="text-[10px] text-muted mt-1">Folios: {resultado.detalle_fallidas.map((x: any) => `N°${x.numero || '?'}`).join(', ')}</div>
                    </div>
                  )}
                </div>
              )}
              {resultado.advertencia && (
                <div className="text-[11px] text-warning mb-2">{resultado.advertencia}</div>
              )}
              <div className="flex gap-2 justify-center mt-4">
                <Btn onClick={reset}>Importar otro archivo</Btn>
                <Btn variant="primary" onClick={() => { setOpen(false); reset() }}>Listo</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
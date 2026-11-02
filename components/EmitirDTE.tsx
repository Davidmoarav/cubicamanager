'use client'
// components/EmitirDTE.tsx
// Vista previa y emisión del documento tributario de una factura o nota de venta.
// En modo demo no se envía nada al SII y el documento no tiene validez tributaria.

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Btn, Modal, fmt } from '@/components/ui'
import { CODIGOS_REFERENCIA } from '@/lib/dte'
import { fmtFecha } from '@/lib/format'
import { confirmar } from '@/lib/avisos'

export default function EmitirDTE({ facturaId, onClose, onEmitido }: {
  facturaId: string
  onClose: () => void
  onEmitido: () => void
}) {
  const [codigo, setCodigo] = useState(3)
  const clave = `/api/dte?factura_id=${facturaId}&codigo_referencia=${codigo}`
  const { data, error, isLoading, mutate } = useSWR<any>(clave, fetcher)
  const [enviando, setEnviando] = useState(false)
  const [falla, setFalla] = useState('')

  const doc = data?.documento
  // Una prueba en demo no impide emitir de verdad con un proveedor conectado
  const delModo = (data?.emisiones ?? []).filter((e: any) => e.modo === data?.modo)
  const vigente = delModo.find((e: any) => ['enviando', 'enviado', 'aceptado'].includes(e.estado))
  const esDemo = data?.modo === 'demo'
  const esNota = data?.factura?.doc_tipo === 'nota_credito' || data?.factura?.doc_tipo === 'nota_debito'
  const ultimoFallo = delModo.find((e: any) => e.estado === 'error' || e.estado === 'rechazado')

  const emitir = async () => {
    if (data?.ya_tiene_folio && !(await confirmar(`Este documento ya tiene el número ${data.factura.numero}. Si ya se emitió en el SII, no lo emitas de nuevo. ¿Continuar?`))) return
    setEnviando(true)
    setFalla('')
    const res = await fetch('/api/dte', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factura_id: facturaId, codigo_referencia: codigo }),
    })
    const j = await res.json().catch(() => ({}))
    setEnviando(false)
    if (!res.ok) setFalla(j.error || 'No se pudo emitir')
    await mutate()
    onEmitido()
  }

  return (
    <Modal title="Emitir documento electrónico" onClose={onClose}>
      {isLoading ? (
        <p className="text-muted text-center py-8 text-[13px]">Preparando el documento…</p>
      ) : error || data?.error ? (
        <div className="text-[12px] text-danger bg-danger-bg rounded-lg px-3 py-2">
          No se pudo preparar el documento{data?.error ? `: ${data.error}` : ''}. Recarga la página; si sigue pasando, avisa al administrador.
        </div>
      ) : (
        <>
          {esDemo && (
            <div className="mb-3 text-[12px] font-semibold text-warning bg-warning-bg rounded-lg px-3 py-2">
              Modo demo: no se envía nada al SII y el documento no tiene validez tributaria.
            </div>
          )}
          {falla && <div className="mb-3 text-[12px] font-semibold text-danger bg-danger-bg rounded-lg px-3 py-2">{falla}</div>}

          {vigente && (
            <div className="mb-3 text-[12.5px] font-semibold text-success bg-success-bg rounded-lg px-3 py-2">
              Emitido{vigente.folio ? ` con folio ${vigente.folio}` : ''} · {vigente.estado}{vigente.modo === 'demo' ? ' · demo' : ''}
              {vigente.pdf_url && <> · <a href={vigente.pdf_url} target="_blank" rel="noreferrer" className="underline">Ver PDF</a></>}
            </div>
          )}

          {!vigente && ultimoFallo && (
            <div className="mb-3 text-[12px] text-warning bg-warning-bg rounded-lg px-3 py-2">
              El último intento quedó {ultimoFallo.estado === 'rechazado' ? 'rechazado' : 'con error'}{ultimoFallo.error ? `: ${ultimoFallo.error}` : ''}.
              Revísalo con tu proveedor antes de reintentar.
            </div>
          )}

          {esNota && !vigente && (
            <div className="mb-3">
              <label className="label-base" htmlFor="dte-codigo">Motivo de la nota</label>
              <select id="dte-codigo" value={codigo} onChange={e => setCodigo(Number(e.target.value))} className="input-base !mb-0 cursor-pointer">
                {CODIGOS_REFERENCIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          {data?.errores?.length > 0 ? (
            <div className="mb-3 border border-line rounded-lg p-3">
              <div className="text-[12.5px] font-bold text-ink mb-1.5">Falta para poder emitir:</div>
              <ul className="list-disc pl-5 text-[12.5px] text-ink">
                {data.errores.map((e: string) => <li key={e}>{e}</li>)}
              </ul>
              <p className="text-[11.5px] text-muted mt-2">
                Los datos del emisor están en <Link href="/configuracion" className="font-semibold text-brand">Configuración</Link> y
                los del receptor en <Link href="/clientes" className="font-semibold text-brand">Clientes</Link>.
              </p>
            </div>
          ) : doc && (
            <div className="border border-line rounded-lg p-3 text-[12.5px] mb-3">
              <div className="font-bold text-ink mb-2">{data.nombre_tipo} · {fmtFecha(doc.fecha)}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                {[['Emisor', doc.emisor], ['Receptor', doc.receptor]].map(([titulo, p]: any) => (
                  <div key={titulo}>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{titulo}</div>
                    <div className="font-semibold text-ink">{p.razon_social}</div>
                    <div className="text-muted">{p.rut} · {p.giro}</div>
                    <div className="text-muted">{p.direccion}, {p.comuna}</div>
                  </div>
                ))}
              </div>
              <div className="text-ink border-t border-line pt-2">{doc.detalle[0].descripcion}</div>
              {doc.referencias.map((r: any) => (
                <div key={r.folio} className="text-muted">Referencia: folio {r.folio} · {r.razon}</div>
              ))}
              <div className="flex justify-between mt-2 text-muted"><span>{doc.totales.exento ? 'Exento' : 'Neto'}</span><span className="tabular-nums">{fmt(doc.totales.exento || doc.totales.neto)}</span></div>
              <div className="flex justify-between text-muted"><span>IVA {doc.totales.tasa_iva}%</span><span className="tabular-nums">{fmt(doc.totales.iva)}</span></div>
              <div className="flex justify-between font-extrabold text-ink"><span>Total</span><span className="tabular-nums">{fmt(doc.totales.total)}</span></div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Btn onClick={onClose}>{vigente ? 'Cerrar' : 'Cancelar'}</Btn>
            {!vigente && (
              <Btn variant="primary" onClick={emitir} disabled={enviando || !doc}>
                {enviando ? 'Emitiendo…' : esDemo ? 'Emitir en modo demo' : 'Emitir al SII'}
              </Btn>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

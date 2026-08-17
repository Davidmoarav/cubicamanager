'use client'
// components/ResumenBoletas.tsx
// Registra el TOTAL de boletas/comprobantes de un período (no detalle).
// Las boletas afectas traen el IVA incluido → se calcula neto e IVA hacia atrás.

import { useState } from 'react'
import { Btn, Modal, fmt } from '@/components/ui'

interface Props {
  onSaved?: () => void
}

export default function ResumenBoletas({ onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7))
  const [tipo, setTipo] = useState<'afecto' | 'exento'>('afecto')
  const [monto, setMonto] = useState('')
  const [docNombre, setDocNombre] = useState('Boletas')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const montoNum = Number(monto) || 0
  // Boleta afecta: el monto INCLUYE IVA → desglosar hacia atrás
  const neto = tipo === 'afecto' ? Math.round(montoNum / 1.19) : montoNum
  const iva  = tipo === 'afecto' ? montoNum - neto : 0

  const guardar = async () => {
    if (montoNum <= 0) { setError('Ingresa un monto mayor a cero'); return }
    setSaving(true); setError('')
    // Número único por registro: cada resumen que registras es una fila nueva,
    // aunque repitas categoría/tipo/período. El sufijo (hora en base36) evita
    // el choque con el índice de duplicados, permitiendo agregar cuantos quieras.
    const sufijo = Date.now().toString(36).slice(-5).toUpperCase()
    const numero = `RESUMEN-${docNombre.toUpperCase()}-${tipo.toUpperCase()}-${periodo}-${sufijo}`
    const payload = {
      numero,
      cliente: `${docNombre}${tipo === 'exento' ? ' exentas' : ''} ${periodo}`,
      tipo: 'venta',
      doc_tipo: 'boleta',      // suma al IVA débito como venta; se muestra con la etiqueta
      neto,
      iva,
      monto: montoNum,
      emision: `${periodo}-01`,
      periodo,
      estado: 'pagada',
    }
    const res = await fetch('/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = String(err.error || '')
      if (msg.includes('duplicate') || msg.includes('uq_factura_clave_sii')) {
        setError(`Ya registraste el resumen de ${docNombre.toLowerCase()} ${tipo === 'exento' ? 'exentas' : 'afectas'} de ${periodo}. Para cambiarlo, elimina el registro anterior en la lista de facturas y vuelve a registrarlo.`)
      } else {
        setError('No se pudo guardar: ' + (msg || 'error'))
      }
      return
    }
    setMonto('')
    setOpen(false)
    onSaved?.()
  }

  return (
    <>
      <Btn onClick={() => setOpen(true)} className="!bg-[#fff7e6] !border-[#f0d9a8] !text-warning font-bold">
        Resumen boletas
      </Btn>

      {open && (
        <Modal title="Resumen de boletas / comprobantes" onClose={() => setOpen(false)}>
          <p className="text-[13px] text-muted mb-4">
            Registra el total de boletas o comprobantes del período. Suma al IVA débito del mes igual que las ventas.
          </p>

          {/* Tipo de documento */}
          <div className="mb-3">
            <label className="label-base">¿Qué estás registrando?</label>
            <div className="flex gap-2">
              {['Boletas', 'Comprobantes'].map(d => (
                <button key={d} onClick={() => setDocNombre(d)}
                  className={`flex-1 py-2 rounded-lg border-[1.5px] text-[13px] font-bold transition ${docNombre === d ? 'border-warning bg-warning-bg text-warning' : 'border-line2 text-muted'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Afecto / Exento */}
          <div className="mb-3">
            <label className="label-base">Tipo de monto</label>
            <div className="flex gap-2">
              <button onClick={() => setTipo('afecto')}
                className={`flex-1 py-2 rounded-lg border-[1.5px] text-[13px] font-bold transition ${tipo === 'afecto' ? 'border-success bg-success-bg text-success' : 'border-line2 text-muted'}`}>
                Afecto (con IVA)
              </button>
              <button onClick={() => setTipo('exento')}
                className={`flex-1 py-2 rounded-lg border-[1.5px] text-[13px] font-bold transition ${tipo === 'exento' ? 'border-accent bg-accent-bg text-accent' : 'border-line2 text-muted'}`}>
                Exento (sin IVA)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label-base">Período</label>
              <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-base" />
            </div>
            <div>
              <label className="label-base">Monto total {tipo === 'afecto' ? '(IVA incluido)' : ''}</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input-base" placeholder="0" />
            </div>
          </div>

          {/* Desglose calculado */}
          {montoNum > 0 && (
            <div className="bg-canvas border border-line rounded-xl p-4 mb-4">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">Desglose</div>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-muted">Neto</span>
                <span className="font-bold text-ink">{fmt(neto)}</span>
              </div>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-muted">IVA {tipo === 'afecto' ? '(19%)' : '(exento)'}</span>
                <span className="font-bold text-success">{fmt(iva)}</span>
              </div>
              <div className="flex justify-between text-[14px] pt-2 border-t border-line">
                <span className="font-bold text-ink">Total</span>
                <span className="font-extrabold text-brand">{fmt(montoNum)}</span>
              </div>
            </div>
          )}

          {error && <div className="bg-danger-bg border border-[#f5c6c2] text-danger px-3 py-2.5 rounded-lg text-[12px] mb-4">{error}</div>}

          <div className="flex gap-2 justify-end">
            <Btn onClick={() => setOpen(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Registrar resumen'}</Btn>
          </div>
        </Modal>
      )}
    </>
  )
}

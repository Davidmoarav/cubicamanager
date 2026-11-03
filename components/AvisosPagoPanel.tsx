'use client'
// components/AvisosPagoPanel.tsx
// Pagos que el cliente informó desde el portal. Confirmar deja pagado el estado de pago
// y su factura; rechazar le muestra el motivo al cliente.
import { useState } from 'react'
import useSWR from 'swr'
import { Btn } from '@/components/ui'
import { avisar, confirmar } from '@/lib/avisos'
import { fmt, fmtFecha } from '@/lib/format'

export default function AvisosPagoPanel({ proyectoId, onCambio }: { proyectoId: string; onCambio: () => void }) {
  const { data, mutate } = useSWR<any[]>(`/api/avisos-pago?proyecto_id=${proyectoId}`)
  const [rechazando, setRechazando] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState('')

  const avisos = Array.isArray(data) ? data : []
  const pendientes = avisos.filter(a => a.estado === 'pendiente')
  if (pendientes.length === 0) return null

  const resolver = async (a: any, accion: 'confirmar' | 'rechazar') => {
    if (accion === 'confirmar' && !(await confirmar(
      `¿Confirmar el pago de ${fmt(a.monto)} del estado de pago N°${a.estado_pago?.numero}? Quedará pagado junto con su factura.`))) return
    setOcupado(a.id)
    const res = await fetch('/api/avisos-pago', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, accion, motivo: accion === 'rechazar' ? motivo : undefined }),
    })
    setOcupado('')
    if (!res.ok) { avisar((await res.json().catch(() => ({})))?.error ?? 'No se pudo guardar'); return }
    setRechazando('')
    setMotivo('')
    await mutate()
    onCambio()
    avisar(accion === 'confirmar' ? 'Pago confirmado' : 'Aviso rechazado: el cliente verá el motivo', 'ok')
  }

  return (
    <div className="mb-4 rounded-card border border-warning/40 bg-warning-bg p-4">
      <div className="text-[13px] font-bold text-warning mb-2">
        {pendientes.length === 1 ? 'El cliente informó un pago' : `El cliente informó ${pendientes.length} pagos`}
      </div>
      <ul className="flex flex-col gap-3">
        {pendientes.map(a => {
          const total = Number(a.estado_pago?.total) || 0
          const distinto = total > 0 && Number(a.monto) !== total
          return (
            <li key={a.id} className="bg-white rounded-lg border border-line p-3 text-[12.5px]">
              <div className="flex justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-ink">Estado de pago N°{a.estado_pago?.numero} · {fmt(a.monto)}</div>
                  <div className="text-muted">
                    {a.pagador} · pagado el {fmtFecha(a.fecha_pago)} · referencia {a.referencia}
                  </div>
                  {a.comentario && <div className="text-muted mt-0.5">“{a.comentario}”</div>}
                  {distinto && <div className="text-danger font-semibold mt-0.5">El estado de pago es de {fmt(total)}: revisa la diferencia antes de confirmar.</div>}
                </div>
                {rechazando !== a.id && (
                  <div className="flex gap-2 items-start">
                    <Btn variant="primary" onClick={() => resolver(a, 'confirmar')} disabled={!!ocupado}>Confirmar pago</Btn>
                    <Btn onClick={() => { setRechazando(a.id); setMotivo('') }} disabled={!!ocupado}>Rechazar</Btn>
                  </div>
                )}
              </div>
              {rechazando === a.id && (
                <div className="mt-2 flex gap-2 flex-wrap items-center">
                  <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} autoFocus
                    placeholder="Motivo, por ejemplo: no vemos la transferencia en la cuenta"
                    aria-label="Motivo del rechazo" className="input-base !mb-0 flex-1 min-w-[220px]" />
                  <Btn variant="danger" onClick={() => resolver(a, 'rechazar')} disabled={!motivo.trim() || !!ocupado}>Rechazar aviso</Btn>
                  <Btn onClick={() => setRechazando('')}>Cancelar</Btn>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11.5px] text-muted mt-2">Confirma solo después de ver el dinero en tu cuenta.</p>
    </div>
  )
}

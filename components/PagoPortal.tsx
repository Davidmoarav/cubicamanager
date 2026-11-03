'use client'
// components/PagoPortal.tsx
// En el portal del cliente: datos para transferir y aviso de que ya pagó.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmt } from '@/lib/format'

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DatosBancarios({ banco }: { banco: Record<string, string | null> }) {
  const [copiado, setCopiado] = useState('')
  const filas = [
    ['Banco', banco.banco], ['Tipo de cuenta', banco.tipo_cuenta], ['Número de cuenta', banco.numero_cuenta],
    ['Titular', banco.titular], ['RUT', banco.rut], ['Correo', banco.correo],
  ].filter(([, v]) => v) as [string, string][]

  const copiar = async (etiqueta: string, valor: string) => {
    try { await navigator.clipboard.writeText(valor); setCopiado(etiqueta) } catch { /* sin portapapeles */ }
  }

  return (
    <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="contents">
          <dt className="text-muted">{etiqueta}</dt>
          <dd className="font-semibold text-ink break-all">{valor}</dd>
          <button onClick={() => copiar(etiqueta, valor)} className="text-[11.5px] font-bold text-om text-right">
            {copiado === etiqueta ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      ))}
    </dl>
  )
}

export function InformarPago({ token, numero, total }: { token: string; numero: number; total: number }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState(String(total))
  const [fecha, setFecha] = useState(hoyLocal)
  const [referencia, setReferencia] = useState('')
  const [pagador, setPagador] = useState('')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="mt-2 text-[12.5px] font-bold text-om hover:underline">
        Ya pagué este estado de pago
      </button>
    )
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const res = await fetch('/api/portal/pago', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, numero, monto: Number(monto), fecha_pago: fecha, referencia, pagador, comentario: comentario || undefined }),
    }).catch(() => null)
    setEnviando(false)
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
      return
    }
    setAbierto(false)
    router.refresh()
  }

  const campo = 'w-full border border-line rounded-lg px-3 py-2 text-[13px] outline-none focus:border-om'
  return (
    <form onSubmit={enviar} className="mt-3 bg-canvas/70 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12.5px]">
      <label className="flex flex-col gap-1">
        <span className="font-bold text-muted">Monto pagado</span>
        <input type="number" min="1" required value={monto} onChange={e => setMonto(e.target.value)} className={campo} />
        <span className="text-[11px] text-muted">Total del estado de pago: {fmt(total)}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold text-muted">Fecha del pago</span>
        <input type="date" required value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)} className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold text-muted">Número de operación o referencia</span>
        <input required minLength={3} maxLength={80} value={referencia} onChange={e => setReferencia(e.target.value)} className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-bold text-muted">Quién pagó</span>
        <input required minLength={2} maxLength={120} value={pagador} onChange={e => setPagador(e.target.value)}
          placeholder="Nombre o razón social" className={campo} />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="font-bold text-muted">Comentario (opcional)</span>
        <input maxLength={500} value={comentario} onChange={e => setComentario(e.target.value)} className={campo} />
      </label>
      {error && <p className="sm:col-span-2 text-danger font-semibold">{error}</p>}
      <div className="sm:col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={() => setAbierto(false)} className="px-3 py-2 rounded-lg border border-line font-bold text-ink">Cancelar</button>
        <button type="submit" disabled={enviando} className="px-3.5 py-2 rounded-lg bg-om text-white font-bold disabled:opacity-60">
          {enviando ? 'Enviando…' : 'Informar pago'}
        </button>
      </div>
      <p className="sm:col-span-2 text-[11px] text-muted">
        La empresa revisará el pago en su cuenta y lo confirmará. Esto no hace el pago: solo lo informa.
      </p>
    </form>
  )
}

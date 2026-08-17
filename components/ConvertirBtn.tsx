'use client'
// components/ConvertirBtn.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Cotizacion } from '@/types/cotizaciones'

interface Props {
  cotizacion: Cotizacion
  onSuccess?: () => void
}

export default function ConvertirBtn({ cotizacion, onSuccess }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Condiciones para mostrar/habilitar
  const yaConvertida = cotizacion.estado === 'convertida'
  const sinPartidas  = !cotizacion.partidas || cotizacion.partidas.length === 0
  const sinCliente   = !cotizacion.cliente_id && !cotizacion.cliente

  // Si ya está convertida, mostrar link al proyecto
  if (yaConvertida && cotizacion.proyecto_id) {
    return (
      <button
        onClick={() => router.push('/proyectos')}
        title="Ver proyecto creado"
        className="inline-flex items-center gap-1 px-[10px] py-1 bg-accent-bg text-accent border border-[#ccc5fc] rounded-[5px] text-[11px] font-bold cursor-pointer">
        → Proyecto
      </button>
    )
  }

  // Si no se puede convertir, mostrar deshabilitado con tooltip
  if (sinPartidas || sinCliente) {
    const motivo = sinCliente ? 'Asigna un cliente primero' : 'Agrega al menos una partida'
    return (
      <button disabled title={motivo}
        className="px-[10px] py-1 bg-canvas text-[#a0aab8] border border-[#d1d9e6] rounded-[5px] text-[11px] font-bold cursor-not-allowed">
        ↗ Convertir
      </button>
    )
  }

  const convertir = async () => {
    const partidas = cotizacion.partidas?.length ?? 0
    const ok = confirm(
      `¿Convertir esta cotización en proyecto?\n\n` +
      `Cliente: ${cotizacion.cliente}\n` +
      `Partidas: ${partidas}\n\n` +
      `Se creará un proyecto activo con avance 0% y la cotización quedará bloqueada en estado "convertida".`
    )
    if (!ok) return

    setLoading(true)
    try {
      const res = await fetch('/api/cotizaciones/convertir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotizacion_id: cotizacion.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert('Error: ' + data.error)
        setLoading(false)
        return
      }

      // Éxito: refrescar lista y ofrecer ir al proyecto
      onSuccess?.()
      const irAlProyecto = confirm(
        'Proyecto creado correctamente.\n\n' +
        '¿Quieres ir al módulo de Proyectos para verlo?'
      )
      if (irAlProyecto) router.push('/proyectos')
    } catch (err: any) {
      alert('Error de red: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={convertir}
      disabled={loading}
      title="Convertir esta cotización en proyecto activo"
      className={`inline-flex items-center gap-1 px-[10px] py-1 border-none rounded-[5px] text-[11px] font-bold text-white
        ${loading ? 'bg-[#a0aab8] cursor-default opacity-70' : 'bg-accent cursor-pointer opacity-100'}`}>
      {loading ? '...' : '↗ Convertir'}
    </button>
  )
}

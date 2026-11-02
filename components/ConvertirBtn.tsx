'use client'
// components/ConvertirBtn.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Cotizacion } from '@/types/cotizaciones'
import { avisar, confirmar } from '@/lib/avisos'
import { mutate } from 'swr'
import { usePermisos } from '@/lib/usePermisos'

interface Props {
  cotizacion: Cotizacion
  onSuccess?: () => void
}

export default function ConvertirBtn({ cotizacion, onSuccess }: Props) {
  const { puedeEditar } = usePermisos('obra')
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Condiciones para mostrar/habilitar
  const yaConvertida = cotizacion.estado === 'convertida'
  const sinPartidas  = !cotizacion.partidas || cotizacion.partidas.length === 0
  const sinCliente   = !cotizacion.cliente_id && !cotizacion.cliente

  if (!puedeEditar && !yaConvertida) return null

  // Si ya está convertida, mostrar link a la obra
  if (yaConvertida && cotizacion.proyecto_id) {
    return (
      <button
        onClick={() => router.push(`/obra/${cotizacion.proyecto_id}`)}
        title="Ver la obra creada"
        className="inline-flex items-center gap-1 px-[10px] py-1 bg-accent-bg text-accent border border-[#ccc5fc] rounded-[5px] text-[11px] font-bold cursor-pointer">
        → Ver obra
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
    const ok = (await confirmar(
      `¿Convertir esta cotización en obra?\n\n` +
      `Cliente: ${cotizacion.cliente}\n` +
      `Partidas: ${partidas}\n\n` +
      `Se creará una obra en curso con avance 0% y la cotización quedará bloqueada en estado "convertida".`
    ))
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
        avisar('Error: ' + data.error)
        setLoading(false)
        return
      }

      // Éxito: refrescar lista y ofrecer ir al proyecto
      onSuccess?.()
      const irAlProyecto = (await confirmar(
        'Obra creada correctamente.\n\n' +
        '¿Quieres ir a verla?'
      ))
      if (irAlProyecto) {
        await mutate('/api/proyectos')
        router.push(`/obra/${data.proyecto_id}`)
      }
    } catch (err: any) {
      avisar('Error de red: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={convertir}
      disabled={loading}
      title="Convertir esta cotización en obra"
      className={`inline-flex items-center gap-1 px-[10px] py-1 border-none rounded-[5px] text-[11px] font-bold text-white
        ${loading ? 'bg-[#a0aab8] cursor-default opacity-70' : 'bg-accent cursor-pointer opacity-100'}`}>
      {loading ? '...' : '↗ Convertir'}
    </button>
  )
}

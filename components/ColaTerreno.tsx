'use client'
// components/ColaTerreno.tsx
// Envía lo que quedó guardado en el teléfono y muestra lo que falta. Si no hay nada
// pendiente no se ve. También deja la app lista para abrirse sin señal.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Btn } from '@/components/ui'
import { avisar, confirmar } from '@/lib/avisos'
import {
  descartarDeCola, enviarIgualDeCola, fijarUsuarioCola, sincronizar, suscribirEnvios, type ItemCola,
} from '@/lib/cola-terreno'
import { prepararSinConexion } from '@/lib/sin-conexion'
import { useColaTerreno, useEnLinea, useEstadoEnvio } from '@/lib/useColaTerreno'

const CADA = 30000

function textoEstado(estado: string, enLinea: boolean): string {
  if (estado === 'sesion') return 'Tu sesión venció. Entra de nuevo para enviar; lo registrado sigue en este teléfono.'
  if (estado === 'otra_cuenta') return 'Lo registró otra cuenta. Se enviará cuando esa cuenta vuelva a entrar.'
  if (!enLinea || estado === 'sin_senal') return 'Quedó en este teléfono y se enviará solo cuando vuelva la señal.'
  return 'Enviando…'
}

export default function ColaTerreno({ usuario }: { usuario?: string }) {
  const cola = useColaTerreno()
  const estado = useEstadoEnvio()
  const enLinea = useEnLinea()
  const [enviando, setEnviando] = useState(false)
  const { data: proyectos } = useSWR<any[]>(cola.length > 0 ? '/api/proyectos' : null)

  useEffect(() => {
    fijarUsuarioCola(usuario ?? '')
    prepararSinConexion(usuario)
    sincronizar()

    const intentar = () => { if (document.visibilityState === 'visible') sincronizar() }
    window.addEventListener('online', intentar)
    document.addEventListener('visibilitychange', intentar)
    // navigator.onLine no siempre avisa cuando vuelve la señal
    const reloj = setInterval(intentar, CADA)
    return () => {
      window.removeEventListener('online', intentar)
      document.removeEventListener('visibilitychange', intentar)
      clearInterval(reloj)
    }
  }, [usuario])

  // Lo que se envió sin nadie mirando: si el servidor dejó un aviso, debe verse
  useEffect(() => suscribirEnvios((item, aviso) => { if (aviso) avisar(`${item.titulo}: ${aviso}`, 'info') }), [])

  const nombreObra = useMemo(() => {
    const lista = Array.isArray(proyectos) ? proyectos : []
    return (item: ItemCola) => lista.find(p => p.id === item.cuerpo.proyecto_id)?.nombre
  }, [proyectos])

  if (cola.length === 0) return null

  const pendientes = cola.filter(i => i.estado === 'pendiente')
  const porResolver = cola.filter(i => i.estado !== 'pendiente')

  const enviarAhora = async () => {
    setEnviando(true)
    const resultado = await sincronizar()
    setEnviando(false)
    if (resultado === 'sin_senal') avisar('Todavía no se pudo enviar. Quedó guardado en este teléfono.', 'info')
  }

  const descartar = async (item: ItemCola) => {
    if (await confirmar(`¿Descartar "${item.titulo}"? Se borrará de este teléfono y no se podrá recuperar.`)) {
      descartarDeCola(item.id)
    }
  }

  const reemplazar = async (item: ItemCola) => {
    if (await confirmar(`¿Reemplazar lo que está en el sistema con "${item.titulo}"? Se perderá lo que registró la otra persona.`)) {
      await enviarIgualDeCola(item.id)
    }
  }

  return (
    <div role="status" className="mb-4 rounded-lg bg-warning-bg px-3.5 py-3 text-[12.5px] text-warning">
      {pendientes.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold">{pendientes.length === 1 ? '1 registro sin enviar' : `${pendientes.length} registros sin enviar`}</div>
            <div className="font-semibold">{textoEstado(estado, enLinea)}</div>
            <ul className="mt-1 text-ink">
              {pendientes.map(i => (
                <li key={i.id}>{i.titulo}{nombreObra(i) ? ` · ${nombreObra(i)}` : ''}{i.error ? ` · Último intento: ${i.error}` : ''}</li>
              ))}
            </ul>
          </div>
          {estado !== 'sesion' && estado !== 'otra_cuenta' && (
            <Btn onClick={enviarAhora} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar ahora'}</Btn>
          )}
          {estado === 'sesion' && <a href="/auth/login" className="font-bold text-brand">Entrar</a>}
        </div>
      )}

      {porResolver.length > 0 && (
        <div className={pendientes.length > 0 ? 'mt-3 pt-3 border-t border-warning/30' : ''}>
          <div className="font-bold">{porResolver.length === 1 ? '1 registro necesita tu decisión' : `${porResolver.length} registros necesitan tu decisión`}</div>
          <ul className="mt-1 flex flex-col gap-2">
            {porResolver.map(i => (
              <li key={i.id} className="flex items-center justify-between gap-3 flex-wrap text-ink">
                <span className="min-w-0">
                  <span className="font-semibold">{i.titulo}{nombreObra(i) ? ` · ${nombreObra(i)}` : ''}</span>
                  <span className="block text-danger font-semibold">{i.error}</span>
                </span>
                <span className="flex gap-2">
                  {i.estado === 'conflicto' && <Btn onClick={() => reemplazar(i)}>Reemplazar con lo mío</Btn>}
                  <Btn variant="danger" onClick={() => descartar(i)}>Descartar lo mío</Btn>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

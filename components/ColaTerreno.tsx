'use client'
// components/ColaTerreno.tsx
// Envía lo que quedó guardado en el teléfono y muestra lo que falta. Si no hay nada
// pendiente no se ve. También deja la app lista para abrirse sin señal.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { Btn } from '@/components/ui'
import { avisar, confirmar } from '@/lib/avisos'
import {
  descartarDeCola, enviarIgualDeCola, fijarUsuarioCola, sincronizar, suscribirEnvios, type ItemCola,
} from '@/lib/cola-terreno'
import { prepararSinConexion } from '@/lib/sin-conexion'
import { createClient } from '@/lib/supabase'
import { cantidadFotos, descartarFoto, enviarFotos, listarFotos, suscribirFotos, type FotoPendiente } from '@/lib/fotos-pendientes'
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

    const subirFotos = () => { if (usuario) enviarFotos(createClient(), usuario).catch(() => {}) }
    subirFotos()
    const intentar = () => { if (document.visibilityState === 'visible') { sincronizar(); subirFotos() } }
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

  const fotos = useSyncExternalStore(suscribirFotos, cantidadFotos, () => 0)
  const [listaFotos, setListaFotos] = useState<FotoPendiente[]>([])
  useEffect(() => { if (fotos > 0) listarFotos().then(setListaFotos); else setListaFotos([]) }, [fotos])
  const fotosRechazadas = listaFotos.filter(f => f.error)

  const nombreObra = useMemo(() => {
    const lista = Array.isArray(proyectos) ? proyectos : []
    return (item: ItemCola) => lista.find(p => p.id === item.cuerpo.proyecto_id)?.nombre
  }, [proyectos])

  if (cola.length === 0 && fotos === 0) return null
  if (cola.length === 0) {
    return (
      <div role="status" className="mb-4 rounded-lg bg-warning-bg px-3.5 py-3 text-[12.5px] text-warning">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold">{fotos === 1 ? '1 foto sin subir' : `${fotos} fotos sin subir`}</div>
            <div className="font-semibold">{enLinea ? 'Subiendo…' : 'Quedaron en este teléfono y se subirán solas cuando vuelva la señal.'}</div>
            {fotosRechazadas.map(f => (
              <div key={f.id} className="text-ink mt-1">
                {f.nombre}: <span className="text-danger font-semibold">{f.error}</span>{' '}
                <button className="font-bold text-danger underline" onClick={async () => {
                  if (await confirmar(`¿Descartar "${f.nombre}"? Se borrará de este teléfono.`)) await descartarFoto(f.id)
                }}>Descartar</button>
              </div>
            ))}
          </div>
          <Btn onClick={() => usuario && enviarFotos(createClient(), usuario)}>Subir ahora</Btn>
        </div>
      </div>
    )
  }

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

      {fotos > 0 && (
        <div className="mt-3 pt-3 border-t border-warning/30 font-semibold">
          {fotos === 1 ? '1 foto sin subir' : `${fotos} fotos sin subir`}: se subirán solas cuando vuelva la señal.
        </div>
      )}
    </div>
  )
}

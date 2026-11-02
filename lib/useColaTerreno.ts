'use client'
// lib/useColaTerreno.ts
// La cola de Terreno y el estado de la conexión, para los componentes.

import { useSyncExternalStore } from 'react'
import { colaVacia, obtenerCola, obtenerEstadoEnvio, suscribirCola } from './cola-terreno'

export const useColaTerreno = () => useSyncExternalStore(suscribirCola, obtenerCola, colaVacia)

export const useEstadoEnvio = () => useSyncExternalStore(suscribirCola, obtenerEstadoEnvio, () => 'al_dia' as const)

function suscribirConexion(oyente: () => void) {
  window.addEventListener('online', oyente)
  window.addEventListener('offline', oyente)
  return () => {
    window.removeEventListener('online', oyente)
    window.removeEventListener('offline', oyente)
  }
}

export const useEnLinea = () => useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true)

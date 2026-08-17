'use client'
// components/useTemaChrome.ts — Tema del "chrome" (sidebar + header móvil):
// oscuro (default, estilo ObraMaestra) o claro (modo día).
// Persistido en localStorage y sincronizado entre componentes por evento.

import { useEffect, useState } from 'react'

const CLAVE = 'cm-chrome-tema'
const EVENTO = 'cm-chrome-tema'

export function useTemaChrome() {
  const [claro, setClaro] = useState(false)

  useEffect(() => {
    try { setClaro(localStorage.getItem(CLAVE) === 'claro') } catch { /* noop */ }
    const fn = (e: Event) => setClaro((e as CustomEvent).detail === 'claro')
    window.addEventListener(EVENTO, fn)
    return () => window.removeEventListener(EVENTO, fn)
  }, [])

  const toggle = () => {
    const nuevo = claro ? 'oscuro' : 'claro'
    try { localStorage.setItem(CLAVE, nuevo) } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: nuevo }))
  }

  return { claro, toggle }
}

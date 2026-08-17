'use client'
// components/obra/useDictado.ts — Dictado por voz con Web Speech API (es-CL).
// Gratis y en el navegador. Estilo ObraMaestra: toca una vez, habla, toca de nuevo.

import { useCallback, useEffect, useRef, useState } from 'react'

export function useDictado(onFinal: (texto: string) => void) {
  const [grabando, setGrabando] = useState(false)
  const [soportado, setSoportado] = useState(false)
  const recRef = useRef<any>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSoportado(!!SR)
  }, [])

  const detener = useCallback(() => {
    try { recRef.current?.stop() } catch { /* noop */ }
    setGrabando(false)
  }, [])

  const iniciar = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-CL'
    rec.continuous = true
    rec.interimResults = false

    rec.onresult = (e: any) => {
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
      }
      if (final.trim()) onFinalRef.current(final.trim())
    }
    rec.onerror = () => setGrabando(false)
    rec.onend = () => setGrabando(false)

    recRef.current = rec
    rec.start()
    setGrabando(true)
  }, [])

  const toggle = useCallback(() => {
    grabando ? detener() : iniciar()
  }, [grabando, detener, iniciar])

  useEffect(() => () => { try { recRef.current?.abort() } catch { /* noop */ } }, [])

  return { grabando, soportado, toggle }
}

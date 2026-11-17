// Fotos sin señal: qué error significa "reintentar después".
import { describe, it, expect } from 'vitest'
import { esFaltaDeSenal } from '../lib/fotos-pendientes'

describe('falta de señal', () => {
  it('reconoce los errores de red de los navegadores', () => {
    expect(esFaltaDeSenal(new TypeError('Failed to fetch'))).toBe(true)        // Chrome
    expect(esFaltaDeSenal(new TypeError('Load failed'))).toBe(true)            // Safari
    expect(esFaltaDeSenal(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true) // Firefox
  })
  it('un rechazo del servidor no es falta de señal', () => {
    expect(esFaltaDeSenal(new Error('El registro de la evidencia no existe'))).toBe(false)
    expect(esFaltaDeSenal(new Error('"plano.pdf" supera los 20 MB.'))).toBe(false)
  })
})

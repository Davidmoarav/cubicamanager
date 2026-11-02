// tests/auth-recuperacion.test.ts
// Recuperación de contraseña: a dónde lleva el link y qué se le dice al usuario.
import { describe, it, expect } from 'vitest'
import { destinoTrasCodigo, mensajeAuth, mensajeLink, motivoDeError, motivoDeHash } from '../lib/auth-recuperacion'

describe('motivoDeError', () => {
  it('sin verificador, el link se abrió en otro navegador', () => {
    expect(motivoDeError({ code: 'pkce_code_verifier_not_found' })).toBe('otro-navegador')
  })
  it('cualquier otro error es un link inválido', () => {
    expect(motivoDeError({ code: 'otp_expired' })).toBe('link-invalido')
    expect(motivoDeError({ code: null })).toBe('link-invalido')
    expect(motivoDeError(null)).toBe('link-invalido')
  })
})

describe('motivoDeHash', () => {
  it('detecta el link vencido que informa Supabase', () => {
    expect(motivoDeHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe('link-invalido')
  })
  it('no confunde un fragmento sin error', () => {
    expect(motivoDeHash('')).toBeNull()
    expect(motivoDeHash('#seccion')).toBeNull()
  })
})

describe('destinoTrasCodigo', () => {
  it('la recuperación pide la contraseña nueva', () => {
    expect(destinoTrasCodigo('recovery')).toBe('/auth/update-password')
  })
  it('la confirmación de cuenta entra a la app', () => {
    expect(destinoTrasCodigo(null)).toBe('/dashboard')
    expect(destinoTrasCodigo(undefined)).toBe('/dashboard')
  })
})

describe('mensajes', () => {
  it('un motivo desconocido en la URL no muestra nada', () => {
    expect(mensajeLink('otra-cosa')).toBe('')
    expect(mensajeLink('constructor')).toBe('')
    expect(mensajeLink(null)).toBe('')
    expect(mensajeLink('otro-navegador')).toContain('mismo navegador')
  })
  it('traduce los errores conocidos y conserva los demás', () => {
    expect(mensajeAuth({ code: 'over_email_send_rate_limit', message: 'rate limit' })).toContain('demasiados correos')
    expect(mensajeAuth({ code: 'same_password', message: 'x' })).toContain('distinta')
    expect(mensajeAuth({ code: 'otro', message: 'Detalle original' })).toBe('Detalle original')
    expect(mensajeAuth({})).toBe('No se pudo completar la operación.')
  })
})

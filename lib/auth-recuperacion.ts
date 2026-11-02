// lib/auth-recuperacion.ts
// Recuperación de contraseña: destino y mensajes según lo que responde Supabase.
// Funciones puras.

export type MotivoLink = 'link-invalido' | 'otro-navegador'

export const MENSAJE_LINK: Record<MotivoLink, string> = {
  'link-invalido': 'El link es inválido, expiró o ya se usó. Solicita uno nuevo.',
  'otro-navegador': 'Este link debe abrirse en el mismo navegador donde lo pediste. Ábrelo ahí o solicita uno nuevo.',
}

export function mensajeLink(motivo: string | null | undefined): string {
  return motivo === 'link-invalido' || motivo === 'otro-navegador' ? MENSAJE_LINK[motivo] : ''
}

// Sin el verificador guardado al pedir el link, Supabase no puede canjear el código
export function motivoDeError(error: { code?: string | null } | null | undefined): MotivoLink {
  return error?.code === 'pkce_code_verifier_not_found' ? 'otro-navegador' : 'link-invalido'
}

// Supabase informa los links vencidos en el fragmento de la URL, que el servidor no ve
export function motivoDeHash(hash: string): MotivoLink | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  return p.get('error') || p.get('error_code') || p.get('error_description') ? 'link-invalido' : null
}

// El link de la raíz también puede ser de una confirmación de cuenta
export function destinoTrasCodigo(redirectType: string | null | undefined): string {
  return redirectType === 'recovery' ? '/auth/update-password' : '/dashboard'
}

const MENSAJES_AUTH: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed: 'Falta confirmar tu correo. Revisa tu bandeja de entrada.',
  user_already_exists: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
  email_exists: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera un rato antes de pedir otro.',
  over_request_rate_limit: 'Demasiados intentos. Espera un rato y vuelve a intentar.',
  email_address_not_authorized: 'El servicio de correo no está autorizado para enviar a esta dirección. Avisa al administrador.',
  same_password: 'La nueva contraseña debe ser distinta de la anterior.',
  weak_password: 'La contraseña es demasiado débil. Usa una más larga o con más variedad de caracteres.',
  session_not_found: 'Tu sesión de recuperación expiró. Solicita un link nuevo.',
}

export function mensajeAuth(error: { code?: string | null; message?: string }): string {
  const traducido = error.code && Object.hasOwn(MENSAJES_AUTH, error.code) ? MENSAJES_AUTH[error.code] : ''
  return traducido || error.message || 'No se pudo completar la operación.'
}

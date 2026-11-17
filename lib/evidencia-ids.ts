// lib/evidencia-ids.ts
// Id estable para agrupar evidencia que no tiene un registro propio: el parte de un día
// en una obra. El mismo día y la misma obra dan siempre el mismo id (formato uuid v5).

function fnv(texto: string, semilla: number): string {
  let h = semilla >>> 0
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function idDeTexto(texto: string): string {
  const hex = fnv(texto, 0x811c9dc5) + fnv(texto, 0x01234567) + fnv(texto, 0x9e3779b9) + fnv(texto, 0x7f4a7c15)
  // Versión 5 y variante RFC 4122, para que pase la validación de uuid
  const v = hex.slice(0, 12) + '5' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32)
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`
}

export const idParteDia = (proyectoId: string, fecha: string) => idDeTexto(`parte|${proyectoId}|${fecha}`)

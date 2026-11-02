// lib/avisos.ts
// Avisos y confirmaciones de la app, en lugar de los diálogos del navegador.
// components/Avisos.tsx los muestra; se pueden llamar desde cualquier handler.

export type TipoAviso = 'error' | 'ok' | 'info'

export interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
}

export interface Pregunta {
  texto: string
  aceptar: string
  peligro: boolean
  responder: (ok: boolean) => void
}

export interface EstadoAvisos {
  avisos: Aviso[]
  pregunta: Pregunta | null
}

const INICIAL: EstadoAvisos = { avisos: [], pregunta: null }
let estado = INICIAL
let siguienteId = 1
const oyentes = new Set<() => void>()

const publicar = (nuevo: EstadoAvisos) => {
  estado = nuevo
  oyentes.forEach(o => o())
}

export const leerAvisos = () => estado
export const avisosIniciales = () => INICIAL

export function suscribirAvisos(oyente: () => void) {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

export function quitarAviso(id: number) {
  publicar({ ...estado, avisos: estado.avisos.filter(a => a.id !== id) })
}

export function avisar(texto: string, tipo: TipoAviso = 'error') {
  const id = siguienteId++
  publicar({ ...estado, avisos: [...estado.avisos, { id, texto, tipo }] })
  setTimeout(() => quitarAviso(id), tipo === 'error' ? 9000 : 5000)
}

const VERBO_PELIGROSO = /^¿(eliminar|quitar|revertir|desactivar)/i

// El botón repite el verbo de la pregunta: "¿Eliminar factura?" → Eliminar
export function textoAceptar(pregunta: string): string {
  return pregunta.match(/^¿([\p{L}]+)/u)?.[1] ?? 'Aceptar'
}

export function confirmar(texto: string): Promise<boolean> {
  return new Promise(resolver => {
    publicar({
      ...estado,
      pregunta: {
        texto,
        aceptar: textoAceptar(texto),
        peligro: VERBO_PELIGROSO.test(texto),
        responder: ok => {
          publicar({ ...estado, pregunta: null })
          resolver(ok)
        },
      },
    })
  })
}

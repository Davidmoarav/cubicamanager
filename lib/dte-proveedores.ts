// lib/dte-proveedores.ts
// Adaptador server-side de proveedores de facturación electrónica.
// Las credenciales NUNCA se exponen al navegador. Configuración: ver .env.example.
//
// Para conectar un proveedor real: implementar ProveedorDTE y agregarlo a proveedorDTE().
// Solo 'demo' viene incluido: no envía nada al SII y sus documentos no tienen validez tributaria.
import type { DocumentoDTE } from './dte'

export type EstadoDTE = 'enviado' | 'aceptado' | 'rechazado'

export interface ResultadoDTE {
  estado: EstadoDTE
  folio: string | null
  track_id?: string | null
  pdf_url?: string | null
  detalle?: unknown
}

export interface ProveedorDTE {
  nombre: string
  modo: 'demo' | 'produccion'
  emitir(documento: DocumentoDTE, idempotencia: string): Promise<ResultadoDTE>
  consultar(trackId: string): Promise<ResultadoDTE>
}

const demo: ProveedorDTE = {
  nombre: 'demo',
  modo: 'demo',
  async emitir(_documento, idempotencia) {
    return {
      estado: 'aceptado',
      folio: `DEMO-${idempotencia.slice(0, 8).toUpperCase()}`,
      track_id: `demo-${idempotencia}`,
      detalle: { aviso: 'Documento de demostración: no se envió al SII y no tiene validez tributaria.' },
    }
  },
  async consultar() {
    return { estado: 'aceptado', folio: null, detalle: { aviso: 'Modo demo' } }
  },
}

export function proveedorDTE(): ProveedorDTE {
  const nombre = (process.env.DTE_PROVEEDOR || 'demo').toLowerCase()
  if (nombre === 'demo') return demo
  throw new Error(`El proveedor de DTE "${nombre}" no está implementado`)
}

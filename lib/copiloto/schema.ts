// lib/copiloto/schema.ts
// Contratos de datos del Copiloto de Obra. Todo lo que devuelve la IA
// (o el modo demo) DEBE validar contra estos schemas antes de tocar la BD.

import { z } from 'zod'

// ─── Presupuesto generado ─────────────────────────────────
export const PartidaIASchema = z.object({
  descripcion: z.string().min(2).max(200),
  unidad: z.string().min(1).max(12),
  cantidad: z.number().positive().max(1_000_000),
  precio_unitario: z.number().nonnegative().max(1_000_000_000),
  origen_precio: z.enum(['catalogo', 'referencia']).optional(),
})

export const GrupoIASchema = z.object({
  nombre: z.string().min(2).max(80),
  partidas: z.array(PartidaIASchema).min(1).max(40),
})

export const PresupuestoIASchema = z.object({
  nombre_proyecto: z.string().min(2).max(120),
  grupos: z.array(GrupoIASchema).min(1).max(15),
})

export type PartidaIA = z.infer<typeof PartidaIASchema>
export type GrupoIA = z.infer<typeof GrupoIASchema>
export type PresupuestoIA = z.infer<typeof PresupuestoIASchema>

// ─── Operaciones de edición ───────────────────────────────
export const OpIASchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('agregar'),
    grupo: z.string().min(1).max(80),
    descripcion: z.string().min(2).max(200),
    unidad: z.string().min(1).max(12),
    cantidad: z.number().positive().max(1_000_000),
    precio_unitario: z.number().nonnegative().max(1_000_000_000),
  }),
  z.object({
    accion: z.literal('modificar'),
    id: z.string().min(1),
    descripcion: z.string().min(2).max(200).optional(),
    cantidad: z.number().positive().max(1_000_000).optional(),
    precio_unitario: z.number().nonnegative().max(1_000_000_000).optional(),
  }),
  z.object({
    accion: z.literal('eliminar'),
    id: z.string().min(1),
  }),
  z.object({
    accion: z.literal('ajustar_pct'),
    filtro: z.string().max(120).optional(),   // texto a buscar en descripción o grupo; vacío = todo
    pct: z.number().min(-90).max(500),        // +10 = sube 10%
  }),
])

export const EdicionIASchema = z.object({
  resumen: z.string().min(1).max(400),
  ops: z.array(OpIASchema).max(30),
})

export type OpIA = z.infer<typeof OpIASchema>
export type EdicionIA = z.infer<typeof EdicionIASchema>

// ─── Utilidades compartidas ───────────────────────────────
export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

export function netoDe(pres: PresupuestoIA): number {
  return pres.grupos.reduce(
    (s, g) => s + g.partidas.reduce((t, p) => t + Math.round(p.cantidad * p.precio_unitario), 0),
    0
  )
}

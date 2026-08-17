// types/partida-proyecto.ts

export interface PartidaProyecto {
  id: string
  proyecto_id: string
  parent_id?: string | null    // null = partida padre, uuid = sub-partida
  orden: number
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  avance: number
  notas?: string
  user_id?: string
  created_at?: string
  children?: PartidaProyecto[] // sub-partidas (solo en frontend)
  // Jerarquía y costos (columnas de sql/08, 13, 14 y 28)
  es_grupo?: boolean
  categoria?: string | null
  // Carta Gantt (sql/37)
  fecha_inicio?: string | null
  fecha_fin?: string | null
  responsable?: string | null
  costo_unitario?: number
  costo_material_unit?: number
  costo_mo_unit?: number
  markup_pct?: number | null
}

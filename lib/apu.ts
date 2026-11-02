// lib/apu.ts
// Análisis de precio unitario de una partida: función pura.
//
//   material   = suma de (rendimiento × precio) de sus materiales
//   recursos   = costo por día de la cuadrilla y los equipos ÷ rendimiento de la partida
//   costo      = material + mano de obra + equipos + otros
//   precio     = costo × (1 + markup)
//
// La partida guarda dos costos: mano de obra e "insumos" (material, equipos y otros).

export interface MaterialAPU {
  rendimiento?: number | null
  precio_unitario?: number | null
}

export interface RecursoAPU {
  tipo: 'mano_obra' | 'equipo' | 'otro' | string
  cantidad?: number | null
  costo_dia?: number | null
}

export function calcularAPU(
  partida: { cantidad?: number | null; rendimiento_dia?: number | null },
  materiales: MaterialAPU[],
  recursos: RecursoAPU[],
  markupPct: number
) {
  const rendimiento = Number(partida.rendimiento_dia) || 0
  const porDia = (tipo: string) => recursos
    .filter(r => r.tipo === tipo)
    .reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(r.costo_dia) || 0), 0)
  const porUnidad = (costoDia: number) => rendimiento > 0 ? costoDia / rendimiento : 0

  const material = materiales.reduce((s, m) => s + (Number(m.rendimiento) || 0) * (Number(m.precio_unitario) || 0), 0)
  const costoDiaCuadrilla = porDia('mano_obra')
  const mano_obra = porUnidad(costoDiaCuadrilla)
  const equipo = porUnidad(porDia('equipo'))
  const otro = porUnidad(porDia('otro'))

  const costoMaterial = Math.round(material + equipo + otro)
  const costoMO = Math.round(mano_obra)
  const costo = costoMaterial + costoMO
  const cantidad = Number(partida.cantidad) || 0

  return {
    material: Math.round(material),
    mano_obra: costoMO,
    equipo: Math.round(equipo),
    otro: Math.round(otro),
    costo_material_unit: costoMaterial,
    costo_mo_unit: costoMO,
    costo_unitario: costo,
    precio_unitario: Math.round(costo * (1 + (Number(markupPct) || 0) / 100)),
    // Días de una cuadrilla para hacer toda la partida
    duracion_dias: rendimiento > 0 && cantidad > 0 ? Math.ceil(cantidad / rendimiento) : null,
    // Hay cuadrilla o equipos, pero sin rendimiento no se pueden llevar a la unidad
    falta_rendimiento: rendimiento <= 0 && recursos.length > 0,
  }
}

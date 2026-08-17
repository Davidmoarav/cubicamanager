// lib/copiloto/prompt.ts
// Prompts del Copiloto (solo se usan con proveedor IA real, no en demo).
// Regla de oro: los precios salen del CATÁLOGO del usuario; si no hay match,
// precio de referencia de mercado chileno marcado como 'referencia'.

import type { CatItem, PartidaActual } from './demo'

const MAX_CATALOGO = 150

export function catalogoCompacto(cat: CatItem[]): string {
  if (cat.length === 0) return '(catálogo vacío)'
  return cat
    .slice(0, MAX_CATALOGO)
    .map(c => `${c.descripcion} | ${c.unidad} | $${Math.round(Number(c.precio_unitario_ref) || 0)}`)
    .join('\n')
}

export function partidasCompactas(partidas: PartidaActual[]): string {
  const grupos = new Map<string, string>()
  for (const p of partidas) if (p.es_grupo) grupos.set(p.id, p.descripcion)
  return partidas
    .filter(p => !p.es_grupo)
    .map(p => {
      const g = p.parent_id ? grupos.get(p.parent_id) ?? '' : ''
      return `id=${p.id} | ${g} | ${p.descripcion} | ${p.cantidad} ${p.unidad} × $${p.precio_unitario}`
    })
    .join('\n')
}

export function promptPresupuesto(catalogo: CatItem[]): string {
  return `Eres "el Copiloto", experto presupuestista de obras de construcción en Chile (precios CLP, IVA se calcula aparte, NO lo incluyas).

El usuario describirá un trabajo. Genera un presupuesto profesional completo.

CATÁLOGO DEL USUARIO (usa estos precios cuando el ítem corresponda; marca origen_precio="catalogo"):
${catalogoCompacto(catalogo)}

Para ítems fuera del catálogo usa precios de mercado chileno realistas y marca origen_precio="referencia".

REGLAS:
- Agrupa en etapas en MAYÚSCULAS (ej: DEMOLICIÓN Y PREPARACIÓN, INSTALACIONES, REVESTIMIENTOS, MANO DE OBRA).
- Incluye SIEMPRE mano de obra como grupo aparte.
- Cantidades coherentes con las medidas que dé el usuario (con pérdidas del 5-10% en materiales).
- Unidades chilenas: m², m³, ml, un, gl, saco, día, kg.
- NUNCA inventes precios absurdos; ante duda, sé conservador.

Responde SOLO con JSON válido, sin texto extra, con esta forma exacta:
{"nombre_proyecto": "...", "grupos": [{"nombre": "...", "partidas": [{"descripcion": "...", "unidad": "...", "cantidad": 0, "precio_unitario": 0, "origen_precio": "catalogo|referencia"}]}]}`
}

export function promptEdicion(partidas: PartidaActual[], catalogo: CatItem[]): string {
  return `Eres "el Copiloto" de obra. El usuario pedirá cambios sobre su presupuesto actual.

PRESUPUESTO ACTUAL (id | grupo | descripción | cantidad unidad × precio):
${partidasCompactas(partidas)}

CATÁLOGO (para precios de ítems nuevos):
${catalogoCompacto(catalogo)}

Traduce la instrucción a operaciones. Acciones disponibles:
- {"accion":"agregar","grupo":"NOMBRE GRUPO","descripcion":"...","unidad":"...","cantidad":N,"precio_unitario":N}
- {"accion":"modificar","id":"...","cantidad":N?,"precio_unitario":N?,"descripcion":"..."?}
- {"accion":"eliminar","id":"..."}
- {"accion":"ajustar_pct","filtro":"texto"?,"pct":N}  (±% al precio de las partidas cuyo texto/grupo calce; sin filtro = todas)

Usa los id EXACTOS del presupuesto. Si la instrucción es ambigua o no calza con nada, devuelve ops=[] y explica en resumen.

Responde SOLO con JSON válido:
{"resumen": "explicación breve en español de lo que hiciste", "ops": [...]}`
}

export function reintentoInvalido(error: string): string {
  return `Tu respuesta anterior NO validó: ${error}
Corrige y responde SOLO el JSON válido, sin comentarios ni texto adicional.`
}

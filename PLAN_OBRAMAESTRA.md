# Plan: complementar CubicaManager con un módulo estilo ObraMaestra

_Versión 1 · 11 ago 2026_

> **ESTADO: ✅ Fases 0–5 implementadas (11 ago 2026).**
> Pendientes manuales: ejecutar `sql/37_gantt_comentarios.sql` y `sql/38_portal_cliente.sql`
> en Supabase; opcional: API key de IA en `.env.local` (hoy corre en modo demo) y
> `NEXT_PUBLIC_APP_URL` en producción para los links del portal.

## 1. Idea en una frase

CubicaManager ya es el **ERP completo** del contratista (RRHH, finanzas, remuneraciones, órdenes de compra, estados de pago, SII, multiempresa). ObraMaestra es la **capa comercial y de terreno**: crear presupuestos hablando con una IA, un espacio de proyecto bonito con pestañas, y compartir con el cliente por link. El plan es **injertar esa capa dentro de CubicaManager**, reusando tu base de datos y adoptando el diseño de ObraMaestra que te gusta más.

No se reemplaza nada. Se agrega un módulo nuevo ("Obra" o "Copiloto") que se apoya en las tablas que ya tienes: `cotizaciones`, `partidas_proyecto`, `catalogo_partidas`, `partida_materiales`, `proveedor_productos`, `ordenes_compra`, `estados_pago`, `clientes`.

---

## 2. Qué hace ObraMaestra (lo que vimos en el video)

Del video se identifican estas piezas, ordenadas por valor:

**Presupuesto conversacional con IA ("Mae").** El usuario describe el trabajo por voz o texto ("Necesito remodelar un baño de 5m², cambiar la cerámica…") y la IA arma el presupuesto completo: partidas agrupadas (Albañilería, Impermeabilización, Mano de obra, Otros), con material, cantidad, unidad, precio unitario y subtotal. Luego se edita **hablándole** desde una barra de chat fija abajo: "Agrega o edita materiales y precios, o habla".

**Espacio de proyecto con pestañas.** Un proyecto tiene un header con estado (Cotizando / Borrador) y tarjetas: Monto, Pagado, Pendiente de cobro, Próximo cobro. Debajo, pestañas: **Presupuesto · Compras · Carta Gantt · Archivos · Cobros · Comentarios · Cliente**.

**Plan de compra (BETA).** Busca precios reales en catálogos de proveedores y genera una ruta de compra optimizada a partir de los materiales del presupuesto.

**Carta Gantt.** Línea de tiempo por etapa/responsable con % de avance, avance global, fase actual, días restantes y período. Vistas: Línea de tiempo / Lista / Avance. Exporta a PDF.

**Archivos.** Todo el proyecto en un lugar: planos, fotos de bitácora, OCs y facturas.

**Cliente / compartir.** Enviar al cliente, Copiar link, Descargar PDF, exportar a **Excel MINVU/DOM** (formato estándar chileno).

**Diseño.** Nav superior azul-marino oscuro + acento naranja/coral (~`#E5502A`), tarjetas blancas limpias con esquinas redondeadas, tipografía marcada, mucho aire. Barra de chat flotante con micrófono y cámara siempre visible. Mensaje de marca: _"Mucho más que presupuestos. Es tu copiloto de obra."_

---

## 3. Qué ya tienes vs. qué falta

| Capacidad ObraMaestra | En CubicaManager hoy | Acción |
|---|---|---|
| Presupuesto con partidas + materiales + IVA 19% | ✅ `cotizaciones`, `partida_materiales`, catálogo | Reusar datos |
| Catálogo de precios / proveedores | ✅ `catalogo_partidas`, `proveedor_productos` | Reusar |
| Órdenes de compra | ✅ `ordenes_compra` | Reusar para "Plan de compra" |
| Estados de pago / cobros | ✅ `estados_pago` | Alimenta pestaña Cobros |
| Export PDF y Excel | ✅ PDF; Excel parcial | Agregar plantilla MINVU/DOM |
| **Presupuesto por voz/texto con IA** | ❌ | **Construir (núcleo)** |
| **Edición conversacional (chat + voz)** | ❌ | **Construir (núcleo)** |
| **Plan de compra optimizado (IA)** | Parcial (OCs manuales) | Construir capa IA |
| **Carta Gantt visual** | Parcial (`ImportarPrograma`) | Construir vista |
| **Workspace de proyecto con pestañas** | Vistas separadas | Reorganizar en un contenedor |
| **Portal / link para cliente** | ❌ | Construir |
| **Diseño estilo ObraMaestra** | Azul `#1e6bb8`, sidebar | Nuevo tema + nav |

La conclusión: **~60% ya existe como datos y lógica**. Lo nuevo es la capa de IA conversacional, el ensamblaje en un "workspace" y el rediseño visual.

---

## 4. Diseño: adoptar el look de ObraMaestra

Tu `tailwind.config.ts` ya está bien estructurado. Se crea un **tema alternativo** sin romper lo existente:

- **Acento:** cambiar/duplicar `brand` a coral: `DEFAULT #E5502A`, `dark #C43D18`, `bg #FDEDE7`. Mantener el azul actual como tema legacy detrás de un flag (`NEXT_PUBLIC_THEME`).
- **Nav superior oscuro:** barra `#1a2535`→`#0F1826` con logo + tabs horizontales (Proyectos, Catálogos) y botón "Activar Pro". Sustituye/convive con el sidebar actual en el módulo nuevo.
- **Tarjetas:** ya tienes `rounded-card` y `shadow-card`; solo aumentar aire (padding) y usar el header de 4 métricas.
- **Barra de chat flotante:** componente nuevo `<CopilotoBar>` fijo abajo con input, micrófono (Web Speech API / Whisper) y cámara (subida de foto).

Recomendación: hacerlo **por ruta** (el módulo nuevo vive en `/obra`) para no tocar el resto de la app mientras se prueba.

---

## 5. Arquitectura técnica

Todo encaja en tu stack actual (Next.js 15 + Supabase + SWR + Zod + react-pdf).

**Capa IA (nueva).**
- Endpoint `POST /api/copiloto/presupuesto` que recibe texto (o transcripción) y devuelve partidas estructuradas. Usa un LLM con **salida JSON validada por Zod** contra tu tipo `PartidaCotizacion`.
- El prompt inyecta tu **catálogo real** (`catalogo_partidas` + `proveedor_productos`) como contexto para que los precios salgan de tus datos, no inventados.
- `POST /api/copiloto/editar` para comandos ("sube la mano de obra 10%", "agrega fragua 5kg") → devuelve un *diff* de partidas.
- Voz: transcripción en el cliente (Web Speech API) o `POST /api/copiloto/transcribir` (Whisper) para móviles.

**Datos.** No requiere tablas nuevas para el núcleo. Agregar solo:
- `proyecto_share` (token público, expira, permisos de solo-lectura) para el link del cliente.
- `proyecto_avance` / `gantt_etapa` si no cubre `ImportarPrograma`, para la Carta Gantt.
- Columna `origen_ia` en cotizaciones para métricas.

**Multiempresa / seguridad.** Respetar tu RLS existente (`29_seguridad_multiempresa.sql`, `25_roles_organizacion.sql`). El endpoint de share es la única superficie pública → token firmado + solo lectura.

**Costo IA.** Presupuestar por request; cachear catálogo en el prompt; usar modelo económico para edición y uno mayor solo para la generación inicial.

---

## 6. Hoja de ruta por fases

**Fase 0 — Diseño y andamiaje (1 semana).**
Tema coral + nav oscuro detrás de flag. Ruta `/obra`. Componente `<CopilotoBar>` (sin IA aún, solo UI). Header de proyecto con las 4 métricas reusando datos de `cotizaciones`/`estados_pago`.

**Fase 1 — Presupuesto conversacional (2–3 semanas). _El corazón._**
Endpoint IA texto→partidas con catálogo real y validación Zod. Pantalla "¿Qué trabajo necesitas presupuestar?" (voz/texto). Render del presupuesto con partidas agrupadas editable. Edición por chat (diff). Guardar como `cotizacion` normal → entra a todo tu flujo actual.

**Fase 2 — Workspace de proyecto (2 semanas).**
Contenedor `/obra/[id]` con pestañas: Presupuesto (Fase 1), Cobros (de `estados_pago`), Archivos (Supabase Storage + bitácora), Cliente. Acciones: Enviar al cliente, Copiar link, Descargar PDF, Excel MINVU/DOM.

**Fase 3 — Plan de compra IA (1–2 semanas).**
De los materiales del presupuesto → agrupar por proveedor usando `proveedor_productos`, sugerir ruta/precio óptimo, generar borradores de `ordenes_compra`.

**Fase 4 — Carta Gantt + Comentarios (1–2 semanas).**
Vista timeline por etapa con % avance, exportar PDF. Comentarios/bitácora por proyecto.

**Fase 5 — Portal del cliente (1 semana).**
`proyecto_share` + página pública de solo lectura con presupuesto, avance y cobros. "Copiar link" real.

Total estimado: **~8–11 semanas** para paridad con el video, entregando valor desde la Fase 1.

---

## 7. Decisiones que conviene cerrar antes de empezar

1. **¿Módulo aparte (`/obra`) o rediseño de toda la app?** Recomiendo módulo aparte primero, migrar después.
2. **Proveedor de IA** (OpenAI / Anthropic / Azure) y presupuesto mensual de tokens.
3. **Voz:** Web Speech API (gratis, navegador) vs. Whisper (mejor en móvil/español, con costo).
4. **Alcance MVP:** ¿lanzamos con Fases 0–2 (presupuesto conversacional + workspace) como primera versión vendible?

---

## 8. Riesgos

- **Precisión de la IA en precios.** Mitigación: anclar siempre al catálogo real; nunca inventar precios; mostrar de dónde vino cada precio.
- **Costo por presupuesto.** Mitigación: modelo barato para edición, caché de catálogo, límites por plan (encaja con "Activar Pro").
- **Duplicar lógica de cotizaciones.** Mitigación: el copiloto **escribe en tus tablas existentes**, no crea un sistema paralelo.
- **Seguridad del link público.** Mitigación: token firmado, expiración, solo lectura, sin datos de otras empresas.

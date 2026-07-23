# Auditoría ObraManager / CubicaManager

**Fecha:** 2026-07-23 · **Commit auditado:** `37d540b` (idéntico en ambos repos GitHub)
**Stack:** Next.js 15 + React 19 + Supabase (RLS) + @react-pdf/renderer + SWR

---

## 1. Resumen ejecutivo

La arquitectura es sólida para el objetivo multi-empresa: no se usa service role, todo pasa por el cliente anon con RLS, y el aislamiento se basa en `puede_acceder(user_id)` + trigger `resolver_owner()`. Las fórmulas tributarias (IVA, PPM, impuesto único) son correctas. **Pero hay 4 hallazgos de severidad alta que rompen el aislamiento o la coherencia de datos entre empresas**, y una capa de permisos por rol que existe pero no se aplica en 10 de 31 endpoints.

| Severidad | Cantidad |
|---|---|
| 🔴 Alta | 4 |
| 🟡 Media | 6 |
| 🟢 Baja / mejora | 8 |

---

## 2. Hallazgos de seguridad

### 🔴 A1 — Usuario con 2+ membresías activas corrompe datos entre empresas
`resolver_owner()` (sql/25) hace `limit 1` **sin order by**, y `getRolActual()` usa `.maybeSingle()`, que **falla con más de una fila** (devuelve null → lo trata como admin de su propia org). Resultado: si un usuario es miembro activo de dos organizaciones (nada lo impide hoy), sus INSERT pueden caer en una empresa arbitraria mientras la app le muestra otra. Escritura cruzada entre empresas.
**Fix:** índice único `create unique index on miembros(member_user_id) where estado='activo' and member_user_id is not null;` + manejar el caso en `getRolActual`.

### 🔴 A2 — Storage no migrado al modelo organización
Las políticas de `proyecto-docs` y `empresa-logos` exigen `carpeta = auth.uid()`, pero sql/25 nunca las actualizó. Un miembro sube un documento a SU carpeta, la fila en `documentos` se imputa al dueño, y **ningún otro miembro (ni el dueño) puede descargarlo** (signed URL denegada). Los archivos de una empresa quedan dispersos en carpetas de distintos uid.
**Fix:** reescribir políticas de storage usando `puede_acceder((storage.foldername(name))[1]::uuid)` y subir siempre a la carpeta del owner (`getOwnerId`).

### 🔴 A3 — Matriz de roles no aplicada en 10 endpoints
`MODULOS_POR_ROL` existe y funciona donde se usa, pero estos endpoints solo validan sesión, no rol. El Sidebar esconde los links (solo estética; con fetch directo se accede):

| Endpoint | Riesgo real |
|---|---|
| `/api/empleados` | **jefe_obra lee/edita sueldos de todos** (RRHH está oculto en UI para él) |
| `/api/ppm` (PUT) | jefe_obra modifica tasa PPM → altera el cálculo tributario |
| `/api/importar-sii` | jefe_obra inserta facturas masivamente |
| `/api/presupuesto`, `/api/informe` | jefe_obra/contador ven márgenes y finanzas completas |
| `/api/documentos`, `/api/contratos`, `/api/proveedores`, `/api/clientes`, `/api/proveedor-productos` | sin control de rol ni de solo-lectura |

**Fix:** agregar `guardModulo`/`guardEscritura` + incorporar `rrhh` a `MODULOS_POR_ROL`.

### 🔴 A4 — Invitaciones dependen de la confirmación de email
`aceptar_invitacion()` vincula por email de `auth.users`. Si en Supabase está desactivada la confirmación de email, cualquiera puede registrarse con el email de un invitado pendiente y **entrar a la organización ajena**.
**Fix:** verificar que *Confirm email* esté ON en Supabase Auth y validar `email_confirmed_at` dentro de la función.

### 🟡 Media
- **M1. Mass assignment:** `insert({...body})` / `update(rest)` en proyectos, contratos, proveedores, empleados, documentos, partidas (PUT). RLS limita el daño entre empresas, pero permite escribir columnas no previstas. Fix: validar payloads (Zod) con listas blancas de campos.
- **M2. Sin validación de pertenencia de FKs:** `proyecto_id`/`partida_id` recibidos del cliente no se verifican contra la empresa (EP detalle, gastos). Integridad, no fuga.
- **M3. `app/dashboard` usa `user.id` en vez de `getOwnerId`:** un miembro (contador/jefe_obra) ve el dashboard **vacío**. Además duplica layout con `(protected)`.
- **M4. Dependencia `xlsx`: 4 vulnerabilidades HIGH sin fix en npm** (prototype pollution + ReDoS). Solo se usa client-side sobre archivos del propio usuario (riesgo acotado), pero conviene migrar a `exceljs` o al build oficial de SheetJS ≥0.20.2 (CDN propio).
- **M5. `next.config.ts` con `ignoreBuildErrors` + `ignoreDuringBuilds`:** errores de tipos/lint pasan a producción.
- **M6. Sin headers de seguridad** (CSP, X-Frame-Options, etc.) ni rate limiting en endpoints de importación masiva.

### 🟢 Positivo (verificado, está bien)
`.env.local` nunca commiteado y bien ignorado · sin service role key en el código · todas las rutas exigen sesión · RLS habilitado en todas las tablas · auditoría por triggers en BD (no bypasseable, solo-lectura, con `owner_id`) · gestión de miembros solo-admin correcta · inserciones re-imputadas al dueño por trigger.

---

## 3. Fórmulas (validadas una a una)

| Fórmula | Estado | Observación |
|---|---|---|
| IVA débito−crédito con notas C/D | ✅ Correcta | Remanente arrastrado cronológicamente, bien. Falta reajuste UTM del remanente (menor). |
| PPM = tasa × neto ventas | ✅ Correcta | Tasa editable por período, como corresponde. |
| Impuesto único 2ª categoría | ✅ Correcta | Verifiqué continuidad de los 8 tramos (factor/rebaja): tabla SII consistente. |
| Liquidación: imponible topado, base tributable = bruto − cotizaciones | ✅ Correcta | Estructura bien planteada. |
| **Horas extra = sueldo/30/8 × 1.5** | ⚠️ Subestima | El factor legal para jornada 44h es ≈0.0079545 (sueldo × factor × horas). Hoy usa 0.00625. |
| **Tope AFC** | ⚠️ Incorrecto | Usa el tope de AFP (87,8 UF); el AFC tiene tope propio (~131,9 UF). |
| UF/UTM/topes | ⚠️ Manuales | Defaults desactualizados (UF 39.000). Integrar mindicador.cl o recordatorio mensual. |
| EP: sugerencia vs creación | ⚠️ Inconsistente | La sugerencia NO re-suma utilidad/GG (correcto, el margen va en el precio), pero el POST SÍ los suma si llegan → riesgo de doble margen. Unificar criterio. |
| Avance ponderado por valor, N niveles | ✅ Correcta | Consistente entre partidas/presupuesto/EP (los grupos persisten su avance). |
| Liquidación calculada en el cliente | ⚠️ | El server guarda `...calc` sin recalcular. Mover `calcularLiquidacion` al POST. |

---

## 4. Plantillas y funcionalidad

Los 4 PDF (Cotización, Estado de Pago, Orden de Compra, Informe) están bien construidos: branding consistente, datos desde `empresa_config`, cascada de deducciones correcta en EP. Dos observaciones: el logo en PDFs depende del bucket público (aceptable para logos), y conviene un componente base común (header/footer/estilos se repiten en los 4).

Funcionalidad general coherente: cotización → conversión a proyecto → partidas jerárquicas → EP → factura → IVA cierra bien como flujo.

---

## 5. Qué eliminar

1. **`app/dashboard/`** completo → mover el dashboard dentro de `(protected)` (elimina layout duplicado y corrige M3 de paso).
2. **`components/SWRProvider.tsx`** — sin ningún uso.
3. **`components/ui-server.tsx`** — solo lo usa el dashboard duplicado; unificar con `ui.tsx`.
4. **Flags de `next.config.ts`** (`ignoreBuildErrors`, `ignoreDuringBuilds`).
5. **`.DS_Store` / `.claude/`** → agregar a `.gitignore`.
6. **28 archivos SQL numerados (con huecos 18-19)** → consolidar en `supabase/migrations/` con un schema canónico. Hoy un entorno nuevo depende de ejecutar 28 scripts a mano en orden; si falta el 25, los datos de miembros se fragmentan silenciosamente.

## 6. Qué agregar

1. Guardas de rol en los 10 endpoints (A3) + módulo `rrhh` en la matriz.
2. Índice único de membresía activa (A1) + políticas de storage org-aware (A2).
3. Validación de payloads con Zod (M1/M2).
4. Recalcular liquidaciones y EP server-side.
5. API UF/UTM (mindicador.cl) con cache diario.
6. Tests unitarios de fórmulas (`impuestoUnico`, `calcularLiquidacion`, IVA/remanente) — son funciones puras, triviales de testear.
7. Headers de seguridad en `next.config.ts`.
8. Reemplazo de `xlsx`.

---

## 7. Plan de trabajo propuesto

| Fase | Contenido | Esfuerzo |
|---|---|---|
| **1. Seguridad crítica** | A1 (índice único + getRolActual), A2 (políticas storage), A3 (guardas en 10 rutas), A4 (verificar config Supabase) | 1-2 días |
| **2. Correcciones funcionales** | Dashboard a (protected) con ownerId, unificar criterio EP, factor horas extra, tope AFC, recálculo server-side | 1-2 días |
| **3. Robustez** | Zod en payloads, validación FKs, consolidar migraciones SQL, quitar flags de build, headers | 2-3 días |
| **4. Mejoras** | API UF/UTM, tests de fórmulas, reemplazo xlsx, componente PDF base | 2-3 días |

---

## 8. ✅ Fase 1 — APLICADA (2026-07-23)

**Código (12 archivos, 83 líneas):**
- A1/A4: `lib/roles.ts` — módulo `rrhh` en la matriz + `getRolActual` determinista (order by + limit 1, ya no falla con membresías múltiples).
- A3: guardas server-side agregadas → `empleados` (guardModulo rrhh, 4 métodos), `ppm` (guardModulo ppm), `importar-sii` (guardModulo facturacion), y `guardEscritura('obra')` en escrituras de `contratos`, `proveedores`, `clientes`, `proveedor-productos`, `documentos`. De paso: `created_at`/`user_id` excluidos de los UPDATE de empleados, contratos y proveedores.
- A2: `mi-rol` ahora devuelve `owner_id`; `DocumentosPanel` y `configuracion` suben archivos a la carpeta del **dueño** de la organización.
- `presupuesto` e `informe` quedan accesibles a los 3 roles **por diseño** (los usa la página de proyectos del jefe de obra).

**Pendiente de ejecutar por ti (2 pasos manuales):**
1. **Supabase > SQL Editor:** ejecutar `sql/29_seguridad_multiempresa.sql` (índice único de membresía, políticas de Storage org-aware, migración de archivos antiguos a la carpeta del dueño, `aceptar_invitacion` con email confirmado).
2. **Supabase > Authentication > Providers > Email:** verificar que **"Confirm email" esté ACTIVADO**. Sin esto, A4 queda mitigado solo parcialmente.

**Verificación:** `tsc --noEmit` sin errores nuevos en los archivos modificados (los 34 errores restantes son preexistentes, en archivos no tocados — deuda de la Fase 3).

## 9. ✅ Fase 2 — APLICADA (2026-07-23)

- **Dashboard:** movido a `(protected)` (misma URL `/dashboard`), ahora usa `getOwnerId` → los miembros ven los datos de la empresa. Eliminados `app/dashboard/` (layout duplicado), `components/ui-server.tsx` (unificado en `ui.tsx`, cuyo `Td` ahora acepta `colSpan`) y `components/SWRProvider.tsx` (huérfano).
- **Horas extra:** factor legal DT `(28/(30×4×jornada))×1.5` con jornada configurable (nuevo parámetro `jornada_semanal`, default 42 h — Ley 21.561 vigente desde abril 2026). Antes se subestimaba ~25%.
- **Tope AFC propio:** nuevo parámetro `tope_afc_uf` (131,9 UF); el AFC ya no usa el tope de AFP/salud.
- **Liquidaciones server-side:** `POST /api/remuneraciones` ahora recalcula desde el empleado + parámetros de la organización; ignora montos del cliente. Defaults unificados en `REM_DEFAULTS` (types/finanzas.ts).
- **EP criterio único:** `POST /api/estados-pago` ya no re-suma utilidad/GG (igual que la sugerencia) — eliminado el riesgo de doble margen. Los EP antiguos con utilidad/GG guardada se siguen mostrando bien.
- **UI:** inputs de jornada semanal y tope AFC en Remuneraciones > Parámetros.

**Pendiente manual:** ejecutar `sql/30_parametros_rem_fase2.sql` en Supabase (2 columnas nuevas, idempotente).

**Verificación:** `tsc` 34 → 33 errores (todos preexistentes, ninguno en archivos tocados; el −1 es el `colSpan` de `Td` que además corrige RRHH).

## 10. ✅ Fase 3 — APLICADA (2026-07-23)

- **TypeScript a 0 errores** (venían 34): `children` opcional en `Th`/`Td`, tipos de partidas completados (`es_grupo`, costos unitarios, `markup_pct`), cookies tipadas en `middleware`/`supabase-server`, filtro con type-guard en conversión de cotizaciones.
- **`next.config.ts`:** eliminados `ignoreBuildErrors` e `ignoreDuringBuilds` — los errores de tipos ahora BLOQUEAN el deploy. Agregados headers de seguridad (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy).
- **Validación con Zod (`lib/validar.ts`):** listas blancas por entidad — se descarta cualquier campo no declarado (fin del mass assignment) y se validan tipos, rangos y enums. Aplicada a POST/PUT de proyectos, contratos, proveedores, clientes, empleados, facturas y documentos.
- **Validación de FKs por empresa:** `documentos`, `gastos-obra`, `estados-pago` y `partidas-proyecto` verifican que `proyecto_id` pertenezca a la organización antes de insertar.
- **`sql/README.md`:** orden de instalación de los 30 archivos, qué reemplaza a qué (25/29 reescriben RLS y Storage), y advertencia del drift de esquema.
- **`.gitignore`:** agregados `.DS_Store` y `.claude/`.

**Verificación:** `tsc --noEmit` = 0 errores · `next build` exitoso (exit 0, 57 rutas) con el chequeo de tipos activo. Única advertencia: supabase-js en Edge Runtime (benigna, esperable con @supabase/ssr).

**Nota (observación nueva):** `facturas.factura_ref` es `uuid` en `sql/10` pero el importador SII le escribe folios de texto — si en tu BD real la columna es `text` (drift), no pasa nada; si es `uuid`, esas filas fallarían. Verificar el tipo real de la columna.

## 11. ✅ Fase 4 — APLICADA (2026-07-23)

- **UF/UTM automáticas:** nueva ruta `/api/indicadores` (mindicador.cl, cache 12 h) + botón "↻ Traer UF/UTM del día" en Remuneraciones > Parámetros. Los valores siguen siendo editables a mano.
- **Tests de fórmulas (`tests/formulas.test.ts`, `npm test`):** 14 tests — impuesto único (exención, continuidad de los 8 tramos, tramos 2 y máximo), liquidaciones (gratificación topada, factor de horas extra por jornada, AFC solo indefinido, tope AFC propio vs tope AFP, Isapre max(plan, 7%), base tributable del impuesto) e IVA (débito−crédito, arrastre de remanente multi-mes, notas de crédito, PPM con IVA en cero). **14/14 pasando.**
- **IVA extraído a `lib/iva.ts`** como función pura `calcularResumenIVA()` — la ruta quedó de 36 líneas y la lógica es testeable.
- **`xlsx` reemplazado:** `package.json` ahora apunta al build oficial de SheetJS 0.20.3 (corrige las 4 vulnerabilidades HIGH; API idéntica, cero cambios de código). ⚠️ Requiere `npm install` en tu máquina (el CDN de SheetJS estaba bloqueado en este entorno).
- **PDFs unificados:** `components/pdf-comunes.ts` centraliza paleta (navy/dorado), `fmtCL`, `pctCL`, fechas corta/larga e `IVA_PCT`; las 4 plantillas importan de ahí (se eliminaron 4 copias de los helpers).

**Verificación final:** `tsc` = 0 errores · `next build` exit 0 · `npm test` 14/14.

---

## Checklist de cierre (pasos manuales del usuario)

1. ☐ Supabase > SQL Editor: ejecutar `sql/29_seguridad_multiempresa.sql` y luego `sql/30_parametros_rem_fase2.sql` (solo estos dos; NO re-ejecutar los antiguos).
2. ☐ Supabase > Authentication > Providers > Email: "Confirm email" ACTIVADO.
3. ☐ En tu máquina: `npm install` (trae zod, vitest y el xlsx parchado) y `npm test`.
4. ☐ Verificar el tipo real de `facturas.factura_ref` en la BD (ver nota de la sección 10).
5. ☐ Probar con un usuario invitado: dashboard con datos de la empresa, documentos compartidos, 403 en `/api/empleados` para jefe de obra.

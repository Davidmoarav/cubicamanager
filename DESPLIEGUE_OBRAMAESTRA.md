# Checklist de despliegue · Módulo Obra (estilo ObraMaestra)

_Actualizado: 11 ago 2026_

Guía para dejar el complemento funcionando al 100%. Los pasos marcados **[TÚ]**
son manuales (Supabase / variables). El código ya está listo y probado
(73/73 tests, typecheck en cero).

---

## 1. Migraciones en Supabase **[TÚ]**

Abre **Supabase → SQL Editor → New query**, pega cada archivo y dale **Run**,
en este orden. Son idempotentes (`if not exists`), no rompen datos existentes.

| Orden | Archivo | Qué activa |
|---|---|---|
| 1 | `sql/37_gantt_comentarios.sql` | Fechas/responsable por etapa (Carta Gantt) + bitácora de Comentarios |
| 2 | `sql/38_portal_cliente.sql` | Link público del cliente (tabla + función segura por token) |

Cómo verificar que quedó bien:

- **Gantt**: entra a un proyecto en `/obra/[id]` → pestaña **Carta Gantt** →
  botón **✦ Planificar auto**. Si asigna fechas sin error, quedó.
- **Comentarios**: pestaña **Comentarios** → escribe uno. Si aparece, quedó.
- **Portal**: rail derecho → **Enviar al cliente** → copia el link y ábrelo en
  una ventana incógnito. Debe verse el presupuesto sin pedir login.

> Si ves un aviso amarillo "Falta ejecutar sql/3X…", es que esa migración aún
> no corrió. Ejecútala y recarga.

---

## 2. Buckets de Storage **[TÚ — verificar]**

Estos buckets deberían existir de migraciones previas. Confírmalos en
**Supabase → Storage**:

- `empresa-logos` (público) — logo de la empresa, sale en PDFs.
- `proyecto-docs` (privado) — pestaña Archivos y documentos de proyecto.

Si falta alguno, córrelo desde `sql/03_empresa_config.sql` (logos) y
`sql/06_documentos.sql` (docs).

---

## 3. Variables de entorno

### Desarrollo (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
COPILOTO_PROVEEDOR=demo          # copiloto sin costo (plantillas + catálogo real)
```

### Para IA real (opcional) **[TÚ]**
Cuando tengas API key, cambia el proveedor y agrega la clave:
```
COPILOTO_PROVEEDOR=openai         # o: gemini | anthropic
OPENAI_API_KEY=sk-...
# COPILOTO_MODELO=gpt-5-mini       # opcional, hay un default
```
El copiloto valida toda respuesta con Zod y, si la IA falla, cae solo a modo demo.
No subas `.env.local`: usa `.env.example` como plantilla y configura las mismas
variables en tu hosting.

### Producción **[TÚ]**
En tu hosting (Vercel u otro), además de las de Supabase, define:
```
NEXT_PUBLIC_APP_URL=https://tudominio.cl
```
Esto hace que los links "Enviar al cliente" usen tu dominio en vez de localhost.

---

## 4. Verificación local antes de publicar

```bash
npm install
npm run test        # 73/73 deben pasar
npm run build       # build de producción sin errores
npm run start       # prueba el build final en local
```

Recorrido de humo (5 min) en `/obra`:

1. Escribe "remodelar un baño de 5m2" → genera presupuesto.
2. Ábrelo → pestañas: Presupuesto, Compras, Carta Gantt, Archivos, Cobros,
   Comentarios, Cliente.
3. En la barra inferior: "sube la mano de obra 10%" → aplica el cambio.
4. Descarga PDF y Excel MINVU/DOM desde el rail.
5. Enviar al cliente → abre el link en incógnito.

---

## 5. Notas de seguridad (ya implementadas)

- El portal público **no** lee tablas directo: usa la función
  `portal_por_token` (SECURITY DEFINER) que solo devuelve el snapshot si el
  token existe y está activo. Sin token válido no se puede enumerar nada.
- El snapshot del cliente **oculta** EPs en borrador/rechazados y no expone
  costos internos ni márgenes.
- Todo lo demás respeta tu RLS multiempresa existente (cada request va scoped
  al dueño de la organización).

---

## 6. Estado de las fases

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Tema coral + workspace + CopilotoBar | ✅ |
| 1 | Presupuesto por voz/texto (IA enchufable) + edición por chat | ✅ |
| 2 | Archivos · Cliente · PDF · Excel MINVU/DOM | ✅ |
| 3 | Plan de compra → borradores de OC | ✅ |
| 4 | Carta Gantt + Comentarios | ✅ (requiere sql/37) |
| 5 | Portal público del cliente | ✅ (requiere sql/38) |
| — | Diseño coral global + modo día/noche | ✅ |
| — | Fix subida de archivos ("No content provided") | ✅ |

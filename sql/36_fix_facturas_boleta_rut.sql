-- ============================================================
-- 36 · FIX importación de facturas: boletas + dedup por RUT
--
-- Corrige las 2 causas de "filas que fallan al importar":
--   A) el CHECK de doc_tipo no aceptaba 'boleta' → rechazaba boletas
--      y comprobantes de pago electrónico (SII 35/38/39/41/48).
--   B) el índice único de dedup no incluía el RUT → dos proveedores
--      con el mismo folio chocaban. Se alinea con la lógica de la app.
--
-- Idempotente y seguro (agregar columnas/valores solo AMPLÍA lo permitido,
-- no puede romper filas existentes). Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── A) Permitir 'boleta' en doc_tipo ─────────────────────
alter table facturas drop constraint if exists facturas_doc_tipo_check;
alter table facturas add  constraint facturas_doc_tipo_check
  check (doc_tipo in ('factura', 'boleta', 'nota_credito', 'nota_debito'));

-- ─── B) Columna RUT de la contraparte (si no existía) ─────
alter table facturas add column if not exists rut_contraparte text;
create index if not exists idx_fact_rut on facturas(user_id, rut_contraparte);

-- ─── B) Índice único de dedup INCLUYENDO el RUT ───────────
-- Con el RUT en la clave, dos proveedores pueden emitir el mismo folio
-- en el mismo período sin chocar (es el mismo criterio que usa el
-- importador en lib/sii.ts → claveFactura).
drop index if exists uq_factura_clave_sii;
create unique index uq_factura_clave_sii
  on facturas(
    user_id, tipo,
    coalesce(doc_tipo, 'factura'),
    numero,
    coalesce(periodo, ''),
    coalesce(rut_contraparte, '')
  )
  where numero is not null and numero <> '';

-- ─── Verificación ─────────────────────────────────────────
-- El CHECK debe listar los 4 tipos y el índice incluir rut_contraparte:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='facturas'::regclass and conname='facturas_doc_tipo_check';
-- select indexdef from pg_indexes where indexname='uq_factura_clave_sii';

-- ============================================================
-- 33 · RUT DE LA CONTRAPARTE EN FACTURAS
--
-- Sin el RUT, el anti-duplicados de la importación SII descartaba
-- facturas legítimas: dos proveedores distintos pueden emitir el
-- MISMO folio en el MISMO período. Con esta columna, la clave de
-- duplicado pasa a ser folio+período+tipo_doc+RUT.
--
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table facturas
  add column if not exists rut_contraparte text;

create index if not exists idx_fact_rut
  on facturas(user_id, rut_contraparte);

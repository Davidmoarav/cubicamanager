-- ============================================================
-- 52 · COMPROBANTE DEL GASTO
-- Un gasto manual de obra puede llevar adjunta su factura o boleta (imagen o PDF).
-- El archivo vive en el bucket 'proyecto-docs' (carpeta del dueño: lo ven todos los miembros).
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table gastos_obra
  add column if not exists archivo_path   text,
  add column if not exists archivo_nombre text,
  add column if not exists archivo_tipo   text;

notify pgrst, 'reload schema';

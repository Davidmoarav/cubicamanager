-- ============================================================
-- 35 · DIAGNÓSTICO: por qué fallan filas al importar facturas
-- Solo lectura. Pega TODO y ejecuta; revisa las 3 tablas de resultado.
-- ============================================================

-- 1) Restricciones CHECK de la tabla facturas
--    (si doc_tipo tiene un check que NO incluye 'boleta', ese es el bug)
select conname as restriccion, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'facturas'::regclass and contype = 'c';

-- 2) Índices ÚNICOS de facturas
--    (si hay un unique sobre folio+período SIN rut_contraparte, choca
--     cuando dos proveedores repiten folio)
select indexname, indexdef
from pg_indexes
where tablename = 'facturas' and indexdef ilike '%unique%';

-- 3) Columnas NOT NULL sin default (si el importador no las llena, falla)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'facturas'
  and is_nullable = 'NO' and column_default is null
order by ordinal_position;

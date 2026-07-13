-- ============================================================
-- ÍNDICES DE RENDIMIENTO
-- Agrega índices por user_id a las tablas que filtran por él y
-- hoy hacen sequential scan (proyectos, partidas, gastos, etc.).
-- Idempotente: se puede correr varias veces sin problema.
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- ============================================================

-- Escaneadas por /api/presupuesto (las de mayor impacto)
create index if not exists idx_proyectos_user
  on proyectos (user_id, created_at desc);
create index if not exists idx_pp_user
  on partidas_proyecto (user_id);
create index if not exists idx_gastos_user
  on gastos_obra (user_id);

-- Listados que hoy escanean toda la tabla
create index if not exists idx_proveedores_user
  on proveedores (user_id, created_at desc);
create index if not exists idx_cotizaciones_user
  on cotizaciones (user_id, created_at desc);
create index if not exists idx_empleados_user
  on empleados (user_id, created_at desc);
create index if not exists idx_contratos_user
  on contratos (user_id, created_at desc);

-- Opcional (se consulta por proyecto_id, ya indexado, pero la RLS filtra por user_id)
create index if not exists idx_devoluciones_user
  on devoluciones (user_id);
create index if not exists idx_epd_user
  on estado_pago_detalle (user_id);

-- ============================================================
-- ÍNDICES DE BÚSQUEDA (pg_trgm)
-- Aceleran los ILIKE '%texto%' de los buscadores server-side
-- (facturas, cotizaciones, órdenes de compra). Sin esto, la
-- búsqueda hace sequential scan a gran volumen.
-- ============================================================
create extension if not exists pg_trgm;

-- Facturas (buscador de asociación de notas y listado)
create index if not exists idx_facturas_numero_trgm  on facturas       using gin (numero  gin_trgm_ops);
create index if not exists idx_facturas_cliente_trgm  on facturas       using gin (cliente gin_trgm_ops);

-- Cotizaciones
create index if not exists idx_cotiz_numero_trgm      on cotizaciones   using gin (numero          gin_trgm_ops);
create index if not exists idx_cotiz_cliente_trgm      on cotizaciones   using gin (cliente         gin_trgm_ops);
create index if not exists idx_cotiz_proyecto_trgm     on cotizaciones   using gin (proyecto_nombre gin_trgm_ops);

-- Órdenes de compra
create index if not exists idx_oc_proveedor_trgm       on ordenes_compra using gin (proveedor gin_trgm_ops);
create index if not exists idx_oc_proyecto_trgm        on ordenes_compra using gin (proyecto  gin_trgm_ops);

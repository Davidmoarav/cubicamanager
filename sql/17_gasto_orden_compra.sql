-- ============================================================
-- VÍNCULO OC → GASTO
-- Permite que una orden de compra "recibida" registre un gasto
-- en el proyecto, y evita duplicados (un gasto por OC).
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table gastos_obra
  add column if not exists orden_compra_id uuid references ordenes_compra(id) on delete set null;

create index if not exists idx_gastos_oc on gastos_obra(orden_compra_id);

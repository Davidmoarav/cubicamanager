-- ============================================================
-- MANO DE OBRA → GASTO DE OBRA
-- Vincula la liquidación de sueldo con el gasto del proyecto, para que
-- el costo de mano de obra entre al gasto real (evita duplicados).
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table gastos_obra
  add column if not exists liquidacion_id uuid references liquidaciones(id) on delete set null;

create index if not exists idx_gastos_liquidacion on gastos_obra(liquidacion_id);

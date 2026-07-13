-- ============================================================
-- RENDIMIENTOS DE MATERIAL POR PARTIDA
-- Cada partida de obra puede consumir varios materiales.
-- rendimiento = consumo de material por unidad de la partida.
--   cantidad necesaria = cantidad_partida x rendimiento
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- ============================================================

create table partida_materiales (
  id              uuid primary key default uuid_generate_v4(),
  partida_id      uuid references partidas_proyecto(id) on delete cascade,
  material        text not null,
  unidad          text default 'un',           -- kg, m2, un, sacos, etc.
  rendimiento     numeric(12,4) default 0,      -- consumo por unidad de la partida
  precio_unitario bigint default 0,             -- costo por unidad de material (opcional; alimenta las OC)
  notas           text,
  user_id         uuid references auth.users(id) on delete cascade,
  created_at      timestamptz default now()
);

alter table partida_materiales enable row level security;

create policy "partida_mat_own" on partida_materiales
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_pm_partida on partida_materiales(partida_id);
create index idx_pm_user    on partida_materiales(user_id);

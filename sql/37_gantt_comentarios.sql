-- ============================================================
-- FASE 4 · MÓDULO OBRA: Carta Gantt + Comentarios
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- ============================================================

-- ─── 1. Fechas y responsable por etapa (grupos de partidas) ─
alter table partidas_proyecto
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin    date,
  add column if not exists responsable  text;

-- ─── 2. Comentarios / bitácora del proyecto ────────────────
create table if not exists proyecto_comentarios (
  id          uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  texto       text not null,
  autor       text,                                   -- snapshot del email
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

alter table proyecto_comentarios enable row level security;

drop policy if exists "comentarios_own" on proyecto_comentarios;
create policy "comentarios_own" on proyecto_comentarios
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_coment_proyecto on proyecto_comentarios(proyecto_id, created_at desc);
create index if not exists idx_coment_user     on proyecto_comentarios(user_id);

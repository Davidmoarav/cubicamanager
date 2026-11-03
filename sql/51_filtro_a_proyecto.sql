-- ============================================================
-- 51 · FILTRO DS27 → OBRA
-- Un grupo terminado se pasa a una obra de Cubica Manager; el grupo guarda a qué obra pasó.
-- Requiere sql/50. Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table filtro_grupos
  add column if not exists proyecto_id uuid references proyectos (id) on delete set null;

create unique index if not exists filtro_grupos_proyecto_idx on filtro_grupos (proyecto_id) where proyecto_id is not null;

notify pgrst, 'reload schema';

-- ============================================================
-- FASE 5 · MÓDULO OBRA: Portal público del cliente
-- Link de solo lectura con snapshot del proyecto.
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- ============================================================

-- ─── Tabla de links compartidos (1 por proyecto) ───────────
create table if not exists proyecto_share (
  id             uuid primary key default uuid_generate_v4(),
  proyecto_id    uuid unique references proyectos(id) on delete cascade,
  token          text unique not null,
  activo         boolean default true,
  datos          jsonb not null default '{}'::jsonb,   -- snapshot que ve el cliente
  actualizado_en timestamptz default now(),
  user_id        uuid references auth.users(id) on delete cascade,
  created_at     timestamptz default now()
);

alter table proyecto_share enable row level security;

-- Solo el dueño gestiona sus links (el público NUNCA lee la tabla directo)
drop policy if exists "share_own" on proyecto_share;
create policy "share_own" on proyecto_share
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_share_token    on proyecto_share(token);
create index if not exists idx_share_proyecto on proyecto_share(proyecto_id);

-- ─── Acceso público SOLO vía función por token ─────────────
-- SECURITY DEFINER: entrega el snapshot si el token existe y está activo.
-- Sin token válido no se puede leer ni enumerar nada.
create or replace function portal_por_token(t text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select datos || jsonb_build_object('actualizado_en', actualizado_en)
  from proyecto_share
  where token = t and activo = true
  limit 1;
$$;

revoke all on function portal_por_token(text) from public;
grant execute on function portal_por_token(text) to anon, authenticated;

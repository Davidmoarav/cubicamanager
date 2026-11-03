-- ============================================================
-- 47 · SUELDOS PRIVADOS, PASO 1 DE 2: PREPARAR
-- No cambia quién ve qué. Deja lista la base para el paso 2 (sql/49).
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- El servidor reparte sueldos con la llave de servicio, que no tiene usuario (auth.uid() nulo).
-- Antes, este trigger dejaba user_id en nulo y la fila quedaba sin empresa: ahora conserva el que trae.
create or replace function resolver_owner() returns trigger as $$
begin
  new.user_id := coalesce(
    (select owner_id from miembros m
      where m.member_user_id = auth.uid() and m.estado = 'activo'
      order by m.created_at asc
      limit 1),
    auth.uid(),
    new.user_id
  );
  return new;
end;
$$ language plpgsql security definer;

-- Quién ve remuneraciones: el dueño y los miembros administrador o contador
create or replace function ve_sueldos(owner uuid) returns boolean as $$
  select owner = auth.uid()
      or exists (
        select 1 from miembros m
        where m.owner_id = owner
          and m.member_user_id = auth.uid()
          and m.estado = 'activo'
          and m.rol in ('admin', 'contador')
      );
$$ language sql security definer stable set search_path = public;

-- Quién ve la bitácora: el dueño y los administradores
create or replace function es_admin_org(owner uuid) returns boolean as $$
  select owner = auth.uid()
      or exists (
        select 1 from miembros m
        where m.owner_id = owner
          and m.member_user_id = auth.uid()
          and m.estado = 'activo'
          and m.rol = 'admin'
      );
$$ language sql security definer stable set search_path = public;

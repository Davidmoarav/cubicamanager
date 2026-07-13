-- ============================================================
-- ROLES Y ORGANIZACIÓN (RBAC multi-usuario)
-- Convierte el modelo "un usuario = una empresa" en
-- "una organización con miembros y roles".
--
-- La organización = la cuenta del administrador (su user_id sigue
-- siendo la llave de los datos). Los miembros acceden vía la tabla
-- `miembros`. RLS ahora permite el acceso si la fila es tuya O si
-- eres miembro activo de esa organización.
--
-- ⚠️ Reescribe las políticas RLS de todas las tablas. Es idempotente.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Tabla de miembros ─────────────────────────────────
create table if not exists miembros (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references auth.users(id) on delete cascade,  -- dueño de la organización
  member_user_id uuid references auth.users(id) on delete cascade,           -- null hasta que el invitado se registra
  member_email   text not null,
  rol            text not null default 'jefe_obra' check (rol in ('admin','contador','jefe_obra')),
  estado         text not null default 'pendiente' check (estado in ('pendiente','activo','suspendido')),
  created_at     timestamptz default now(),
  unique (owner_id, member_email)
);
create index if not exists idx_miembros_owner  on miembros(owner_id);
create index if not exists idx_miembros_member on miembros(member_user_id);

-- ─── 2. Función de acceso (la usa RLS en todas las tablas) ─
-- Puedes acceder a los datos de un dueño si eres ese dueño,
-- o si eres miembro activo de su organización.
create or replace function puede_acceder(owner uuid) returns boolean as $$
  select owner = auth.uid()
      or exists (
        select 1 from miembros m
        where m.owner_id = owner
          and m.member_user_id = auth.uid()
          and m.estado = 'activo'
      );
$$ language sql security definer stable;

-- ─── 3. Trigger: al insertar, imputa la fila al dueño de la organización ─
-- Un miembro que crea una fila la guarda bajo el user_id del dueño
-- (así queda en la empresa, visible para todos sus miembros).
create or replace function resolver_owner() returns trigger as $$
begin
  new.user_id := coalesce(
    (select owner_id from miembros m
      where m.member_user_id = auth.uid() and m.estado = 'activo'
      limit 1),
    auth.uid()
  );
  return new;
end;
$$ language plpgsql security definer;

-- ─── 4. RLS de la propia tabla miembros ───────────────────
alter table miembros enable row level security;
drop policy if exists miembros_acceso on miembros;
-- El dueño gestiona su organización; el miembro ve su propia membresía
create policy miembros_acceso on miembros for all
  using (owner_id = auth.uid() or member_user_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─── 5. Aceptar invitación (vincula al invitado por su email) ─
-- El invitado, al entrar, llama esta función: activa las membresías
-- pendientes que coincidan con SU email (no puede tomar otras).
create or replace function aceptar_invitacion() returns void as $$
  update miembros
     set member_user_id = auth.uid(), estado = 'activo'
   where estado = 'pendiente'
     and member_user_id is null
     and lower(member_email) = lower((select email from auth.users where id = auth.uid()));
$$ language sql security definer;

-- ─── 6. Reescritura de RLS en todas las tablas de datos ───
do $$
declare
  t text;
  pol record;
  tablas text[] := array[
    'catalogo_partidas','clientes','contratos','cotizaciones','devoluciones',
    'documentos','empleados','empresa_config','estado_pago_detalle','estados_pago',
    'facturas','gastos_obra','orden_compra_lineas','ordenes_compra','partida_materiales',
    'partidas_proyecto','ppm_config','proveedores','proyeccion_mo','proyectos',
    'liquidaciones','parametros_remuneracion','proveedor_productos'
  ];
begin
  -- Elimina las políticas antiguas (por si eran restrictivas y bloquearían a los miembros)
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename = any(tablas)
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;

  foreach t in array tablas loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy acceso_org on %I for all using (puede_acceder(user_id)) with check (puede_acceder(user_id))', t);
    -- Trigger para imputar el user_id al dueño de la organización al insertar
    execute format('drop trigger if exists trg_owner on %I', t);
    execute format(
      'create trigger trg_owner before insert on %I for each row execute function resolver_owner()', t);
  end loop;
end $$;

-- ─── 7. partidas_cotizacion (no tiene user_id: se protege vía su cotización) ─
alter table partidas_cotizacion enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='partidas_cotizacion' loop
    execute format('drop policy if exists %I on partidas_cotizacion', pol.policyname);
  end loop;
end $$;
create policy acceso_org on partidas_cotizacion for all
  using (exists (select 1 from cotizaciones c where c.id = cotizacion_id and puede_acceder(c.user_id)))
  with check (exists (select 1 from cotizaciones c where c.id = cotizacion_id and puede_acceder(c.user_id)));

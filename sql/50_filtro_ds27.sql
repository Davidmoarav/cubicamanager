-- ============================================================
-- 50 · MÓDULO FILTRO DS27 CAP. IV (aparte del resto de Cubica Manager)
-- Las mismas tablas de la app «Filtro de calificación por grupo» (001 y 002), con el
-- prefijo filtro_ y separadas por empresa. Solo las ven el dueño, administradores y
-- jefes de obra: guardan datos sensibles de las familias (RSH, discapacidad, prisión política).
-- Requiere sql/47 (resolver_owner). Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

create or replace function ve_filtro(owner uuid) returns boolean as $$
  select owner = auth.uid()
      or exists (
        select 1 from miembros m
        where m.owner_id = owner
          and m.member_user_id = auth.uid()
          and m.estado = 'activo'
          and m.rol in ('admin', 'jefe_obra')
      );
$$ language sql security definer stable set search_path = public;

-- Un llamado = una resolución con sus criterios (se editan en «Criterios»)
create table if not exists filtro_llamados (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  nombre      text not null,
  resolucion  text,
  region      text,
  parametros  jsonb not null,
  documento   jsonb,
  bloqueado   boolean not null default false,
  created_by  uuid default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists filtro_grupos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  llamado_id    uuid not null references filtro_llamados (id) on delete restrict,
  nombre        text not null,
  codigo        text,
  comuna        text not null,
  zona_termica  text not null,
  tipo_proyecto text not null default 'regular' check (tipo_proyecto in ('regular', 'pda')),
  modalidad     text not null default 'grupal' check (modalidad in ('grupal', 'individual')),
  organizacion  text,
  representacion text check (representacion in ('junta_vecinos', 'organizacion_funcional')),
  personalidad_juridica_vigente boolean not null default false,
  localidad     text,
  localidad_mas_5000 boolean not null default false,
  estado        text not null default 'En preparación'
    check (estado in ('En preparación', 'Postulado', 'Seleccionado', 'No seleccionado')),
  observaciones text,
  created_by    uuid default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists filtro_postulantes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  grupo_id    uuid not null references filtro_grupos (id) on delete cascade,
  nombre      text not null,
  rut         text not null,
  direccion   text,
  telefono    text,
  incluido    boolean not null default true,

  -- 7.1
  rsh_tramo   smallint check (rsh_tramo in (40, 50, 60, 70, 80, 90, 100)),
  integrantes smallint check (integrantes >= 1),
  adulto_mayor boolean not null default false,
  integrantes_discapacidad smallint not null default 0 check (integrantes_discapacidad >= 0),
  monoparental boolean not null default false,
  prision_politica boolean not null default false,
  seguridad_oportunidades boolean not null default false,
  anio_recepcion smallint check (anio_recepcion between 1800 and 2100),
  fecha_nacimiento date,

  -- 7.2 (solo PDA)
  recambio_calefactor_mma boolean not null default false,
  factores_extra jsonb not null default '{}'::jsonb,

  -- Vivienda (3.6)
  anio_permiso smallint check (anio_permiso between 1800 and 2100),
  es_vivienda_social boolean not null default false,
  avaluo_fiscal_uf numeric(10, 2) check (avaluo_fiscal_uf >= 0),
  m2_vivienda numeric(8, 2) check (m2_vivienda >= 0),
  copropiedad_tipo_a boolean not null default false,
  subsidio_termico_previo_anio smallint,
  recepcion_ley_20898 boolean not null default false,
  permiso_excepcion boolean not null default false,

  -- 5.4, 5.6 y 3.12
  requiere_regularizacion boolean not null default false,
  pisos_ventilados boolean not null default false,
  techumbre text not null default 'no_aplica' check (techumbre in ('no_aplica', 'sin_asbesto', 'con_asbesto')),
  costo_proyecto_uf numeric(10, 2) check (costo_proyecto_uf >= 0),
  ahorro_uf numeric(8, 2) check (ahorro_uf >= 0),

  documentos  jsonb not null default '{}'::jsonb,
  observaciones text,
  created_by  uuid default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists filtro_llamados_user_idx on filtro_llamados (user_id);
create index if not exists filtro_grupos_llamado_idx on filtro_grupos (llamado_id);
create index if not exists filtro_postulantes_grupo_idx on filtro_postulantes (grupo_id);
create index if not exists filtro_postulantes_rut_idx on filtro_postulantes (user_id, rut);

create or replace function filtro_tocar_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['filtro_llamados', 'filtro_grupos', 'filtro_postulantes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists acceso_filtro on %I', t);
    execute format('create policy acceso_filtro on %I for all using (ve_filtro(user_id)) with check (ve_filtro(user_id))', t);
    -- La fila queda en la empresa de quien la crea
    execute format('drop trigger if exists trg_owner on %I', t);
    execute format('create trigger trg_owner before insert on %I for each row execute function resolver_owner()', t);
    execute format('drop trigger if exists trg_updated_at on %I', t);
    execute format('create trigger trg_updated_at before update on %I for each row execute function filtro_tocar_updated_at()', t);
  end loop;
end $$;

-- Un grupo solo puede apuntar a un llamado de su misma empresa, y un postulante a un grupo de ella.
-- Una función por tabla: plpgsql falla al leer un campo que esa tabla no tiene.
create or replace function filtro_grupo_misma_empresa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from filtro_llamados l where l.id = new.llamado_id and l.user_id = new.user_id) then
    raise exception 'El llamado no pertenece a esta empresa';
  end if;
  return new;
end;
$$;

create or replace function filtro_postulante_misma_empresa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from filtro_grupos g where g.id = new.grupo_id and g.user_id = new.user_id) then
    raise exception 'El grupo no pertenece a esta empresa';
  end if;
  return new;
end;
$$;

-- Postgres corre los triggers por orden alfabético: "trg_validar" va después de "trg_owner",
-- que es el que fija la empresa de la fila
drop trigger if exists trg_validar_empresa on filtro_grupos;
create trigger trg_validar_empresa before insert or update on filtro_grupos
  for each row execute function filtro_grupo_misma_empresa();
drop trigger if exists trg_validar_empresa on filtro_postulantes;
create trigger trg_validar_empresa before insert or update on filtro_postulantes
  for each row execute function filtro_postulante_misma_empresa();

notify pgrst, 'reload schema';

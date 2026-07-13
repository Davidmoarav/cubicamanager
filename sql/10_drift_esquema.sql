-- ============================================================
-- VERSIONADO DEL ESQUEMA "DRIFT"
-- Reconstruye las tablas que existían en la base pero no estaban
-- en el repo, con su RLS. Así un entorno nuevo nace COMPLETO y SEGURO.
-- Idempotente: en la base actual no cambia nada (todo con IF NOT EXISTS
-- y políticas recreadas limpias).
--
-- Va en el hueco de la 10: necesita proyectos (05) y partidas_proyecto (07).
-- La columna gastos_obra.orden_compra_id se agrega aparte en la 17
-- (porque referencia ordenes_compra, que es la 15).
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── GASTOS DE OBRA (base, sin orden_compra_id) ───────────
create table if not exists gastos_obra (
  id          uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  partida_id  uuid references partidas_proyecto(id) on delete set null,
  fecha       date default current_date,
  categoria   text default 'materiales',
  descripcion text not null,
  monto       bigint default 0,
  proveedor   text,
  documento   text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);
create index if not exists idx_gastos_proyecto on gastos_obra(proyecto_id);
create index if not exists idx_gastos_partida   on gastos_obra(partida_id);

-- ─── DEVOLUCIONES (de retención / anticipo) ───────────────
create table if not exists devoluciones (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade,
  proyecto_id uuid references proyectos(id) on delete cascade,
  tipo        text not null,
  monto       bigint not null default 0,
  fecha       date default current_date,
  glosa       text,
  created_at  timestamptz default now()
);
create index if not exists idx_devoluciones_proyecto on devoluciones(proyecto_id);

-- ─── PPM CONFIG (por período) ─────────────────────────────
create table if not exists ppm_config (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  periodo    text not null,
  regimen    text default 'pro_pyme_general',
  tasa       numeric default 0,
  updated_at timestamptz default now(),
  unique (user_id, periodo)
);

-- ─── PROYECCIÓN DE MANO DE OBRA ───────────────────────────
create table if not exists proyeccion_mo (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references auth.users(id) on delete cascade,
  proyecto_id    uuid references proyectos(id) on delete cascade,
  mes            text not null,
  dotacion       integer default 0,
  costo_unitario bigint default 0,
  finiquito      bigint default 0,
  created_at     timestamptz default now(),
  unique (user_id, proyecto_id, mes)
);
create index if not exists idx_proyeccion_proyecto on proyeccion_mo(proyecto_id);

-- ─── RLS + POLÍTICAS (cada usuario solo su data) ──────────
alter table gastos_obra   enable row level security;
alter table devoluciones  enable row level security;
alter table ppm_config    enable row level security;
alter table proyeccion_mo enable row level security;

drop policy if exists "gastos_own"       on gastos_obra;
drop policy if exists "devoluciones_own" on devoluciones;
drop policy if exists "ppm_own"          on ppm_config;
drop policy if exists "proyeccion_own"   on proyeccion_mo;

create policy "gastos_own" on gastos_obra
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "devoluciones_own" on devoluciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ppm_own" on ppm_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "proyeccion_own" on proyeccion_mo
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── COLUMNAS DE NOTAS DE CRÉDITO/DÉBITO EN FACTURAS ──────
-- (factura_ref referencia el id de la factura que la nota modifica)
alter table facturas add column if not exists doc_tipo    text default 'factura';
alter table facturas add column if not exists factura_ref uuid references facturas(id) on delete set null;
alter table facturas add column if not exists partida_id  uuid;
create index if not exists idx_facturas_ref on facturas(factura_ref);

-- ─── COLUMNAS DE VÍNCULO SUELTAS ──────────────────────────
alter table empleados add column if not exists proyecto_id uuid references proyectos(id) on delete set null;

-- ============================================================
-- TABLAS DE REMUNERACIONES (faltaban en la base) + IMPUESTO ÚNICO
-- Crea parametros_remuneracion y liquidaciones si no existen, con RLS,
-- e incluye la columna desc_impuesto (Impuesto Único de 2ª Categoría).
-- Idempotente: si ya existen, solo asegura la columna del impuesto.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── Parámetros previsionales (tasas, topes, UF/UTM) ──────
create table if not exists parametros_remuneracion (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid unique references auth.users(id) on delete cascade,
  afp_pct               numeric(5,2) default 10.00,
  afp_comision_pct      numeric(5,2) default 1.44,
  salud_pct             numeric(5,2) default 7.00,
  afc_trabajador_pct    numeric(5,2) default 0.60,
  afc_empleador_pct     numeric(5,2) default 2.40,
  uf_valor              bigint default 39000,
  utm_valor             bigint default 68000,
  tope_imponible_uf     numeric(6,2) default 87.80,
  gratificacion_tope    bigint default 209396,
  colacion_default      bigint default 0,
  movilizacion_default  bigint default 0,
  updated_at            timestamptz default now()
);

-- ─── Liquidaciones de sueldo (incluye desc_impuesto) ──────
create table if not exists liquidaciones (
  id                uuid primary key default uuid_generate_v4(),
  empleado_id       uuid references empleados(id) on delete cascade,
  periodo           text not null,
  sueldo_base       bigint default 0,
  horas_extra_monto bigint default 0,
  gratificacion     bigint default 0,
  bono_imponible    bigint default 0,
  colacion          bigint default 0,
  movilizacion      bigint default 0,
  total_imponible   bigint default 0,
  total_haberes     bigint default 0,
  desc_afp          bigint default 0,
  desc_salud        bigint default 0,
  desc_afc          bigint default 0,
  desc_impuesto     bigint default 0,
  otros_descuentos  bigint default 0,
  total_descuentos  bigint default 0,
  liquido_pagar     bigint default 0,
  estado            text default 'borrador' check (estado in ('borrador','pagada')),
  user_id           uuid references auth.users(id) on delete cascade,
  created_at        timestamptz default now()
);

-- Por si la tabla ya existía sin la columna del impuesto
alter table liquidaciones add column if not exists desc_impuesto bigint default 0;

-- ─── RLS ──────────────────────────────────────────────────
alter table parametros_remuneracion enable row level security;
alter table liquidaciones            enable row level security;

drop policy if exists "param_rem_own"     on parametros_remuneracion;
drop policy if exists "liquidaciones_own" on liquidaciones;

create policy "param_rem_own" on parametros_remuneracion
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "liquidaciones_own" on liquidaciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_liq_empleado on liquidaciones(empleado_id);
create index if not exists idx_liq_periodo  on liquidaciones(user_id, periodo);

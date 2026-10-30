-- ============================================================
-- 41 · FASE 1: COMPLETAR LA IMPUTACIÓN DEL COSTO REAL
--
-- 1. Orden de compra → partida (y la factura, con FK real).
-- 2. Parte diario: horas por trabajador, obra, partida y día.
-- 3. Gastos de sueldo: una liquidación puede repartirse en varias filas.
-- 4. Parámetros de aportes del empleador (costo empresa de la liquidación).
--
-- Idempotente. Requiere la 25 (organizaciones) y la 26 (auditoría).
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Partida en órdenes de compra y facturas ───────────
alter table ordenes_compra
  add column if not exists partida_id uuid references partidas_proyecto(id) on delete set null;

create index if not exists idx_oc_partida on ordenes_compra(partida_id);

-- facturas.partida_id existe desde la 10, pero sin FK ni uso.
update facturas f
   set partida_id = null
 where f.partida_id is not null
   and not exists (select 1 from partidas_proyecto p where p.id = f.partida_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_partida_id_fkey') then
    alter table facturas
      add constraint facturas_partida_id_fkey
      foreign key (partida_id) references partidas_proyecto(id) on delete set null;
  end if;
end $$;

create index if not exists idx_facturas_partida on facturas(partida_id);

-- ─── 2. Parte diario ──────────────────────────────────────
create table if not exists parte_diario (
  id          uuid primary key default uuid_generate_v4(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  partida_id  uuid references partidas_proyecto(id) on delete set null,
  fecha       date not null,
  horas       numeric(4,1) not null check (horas > 0 and horas <= 24),
  notas       text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

-- Solo con partida: si la partida se borra, las filas quedan en NULL y un
-- índice sobre ese caso impediría borrarla. La API deduplica las filas sin partida.
create unique index if not exists uq_parte_diario
  on parte_diario(empleado_id, proyecto_id, partida_id, fecha)
  where partida_id is not null;

create index if not exists idx_parte_proyecto on parte_diario(proyecto_id, fecha);
create index if not exists idx_parte_empleado on parte_diario(empleado_id, fecha);
create index if not exists idx_parte_user     on parte_diario(user_id);

-- RLS, dueño y auditoría: igual que las tablas de la 25 y la 26
alter table parte_diario enable row level security;

drop policy if exists acceso_org on parte_diario;
create policy acceso_org on parte_diario
  for all using (puede_acceder(user_id)) with check (puede_acceder(user_id));

drop trigger if exists trg_owner on parte_diario;
create trigger trg_owner before insert on parte_diario
  for each row execute function resolver_owner();

drop trigger if exists trg_auditoria on parte_diario;
create trigger trg_auditoria after insert or update or delete on parte_diario
  for each row execute function registrar_auditoria();

-- ─── 3. Gastos de sueldo repartidos ───────────────────────
-- La 32 permitía un solo gasto por liquidación; ahora hay uno por obra y partida.
drop index if exists uq_gasto_liquidacion;

create unique index if not exists uq_gasto_liquidacion_partida
  on gastos_obra(liquidacion_id, proyecto_id, partida_id)
  where liquidacion_id is not null and partida_id is not null;

-- La categoría automática usaba otra clave que la del formulario de gastos
update gastos_obra
   set categoria = 'mano_obra'
 where categoria = 'mano de obra';

-- ─── 4. Aportes del empleador ─────────────────────────────
-- Valores de referencia a octubre de 2026: el usuario debe mantenerlos al día
-- con Previred. La tasa de mutual depende de la adhesión de cada empresa.
alter table parametros_remuneracion
  add column if not exists afc_empleador_plazo_pct  numeric(5,2) default 3.00,
  add column if not exists sis_pct                  numeric(5,2) default 1.78,
  add column if not exists cotizacion_empleador_pct numeric(5,2) default 3.50,
  add column if not exists mutual_pct               numeric(5,2) default 0.93;

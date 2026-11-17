-- ============================================================
-- 55 · TRATOS Y FORMAS DE PAGO DE LA MANO DE OBRA
-- 1. Trabajador: además de sueldo mensual, pago por día, por hora, a trato o mixto.
-- 2. Tratos: lo pactado (por unidad, a suma alzada, por vivienda, por hora o por día)
--    con un trabajador, una cuadrilla o un tercero (boleta o factura).
-- 3. Avances del trato: lo ejecutado, con aprobación. Aprobado:
--      · trabajador o cuadrilla → se reparte y entra a la liquidación del mes (es imponible)
--      · tercero                → es gasto directo de la obra
-- 4. Liquidación: haber por trato y semana corrida.
-- Requiere 25, 26, 41 y 42. Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Forma de pago del trabajador ──────────────────────
--   mensual   → sueldo fijo (como hasta hoy)
--   por_metas → monto mensual pactado, escrito a mano (se conserva lo existente)
--   diario    → valor_dia  × días con parte diario
--   por_hora  → valor_hora × horas del parte diario
--   trato     → lo aprobado en sus tratos; `sueldo` es el mínimo garantizado del mes
--   mixto     → `sueldo` fijo + lo aprobado en sus tratos
alter table empleados
  add column if not exists valor_dia  bigint not null default 0 check (valor_dia >= 0),
  add column if not exists valor_hora bigint not null default 0 check (valor_hora >= 0);

alter table empleados drop constraint if exists empleados_modalidad_check;
alter table empleados add constraint empleados_modalidad_check
  check (modalidad in ('mensual','por_metas','diario','por_hora','trato','mixto'));

-- ─── 2. Tratos ────────────────────────────────────────────
create table if not exists tratos (
  id               uuid primary key default gen_random_uuid(),
  proyecto_id      uuid not null references proyectos(id) on delete cascade,
  partida_id       uuid references partidas_proyecto(id) on delete set null,  -- partida o vivienda
  descripcion      text not null,
  tipo             text not null check (tipo in ('unidad','suma_alzada','vivienda','por_hora','por_dia')),
  ejecutor         text not null default 'cuadrilla' check (ejecutor in ('trabajador','cuadrilla','tercero')),
  tercero_nombre   text,
  proveedor_id     uuid references proveedores(id) on delete set null,
  documento        text check (documento in ('boleta_honorarios','factura')),
  unidad           text,
  precio_unitario  bigint not null default 0 check (precio_unitario >= 0),   -- por unidad, hora o día
  cantidad_pactada numeric(14,2) not null default 0 check (cantidad_pactada >= 0),
  monto_fijo       bigint not null default 0 check (monto_fijo >= 0),        -- suma alzada o por vivienda
  retencion_pct    numeric(5,2) not null default 0 check (retencion_pct between 0 and 100),
  reparto          text not null default 'iguales' check (reparto in ('iguales','porcentaje','dias')),
  fecha_inicio     date,
  fecha_fin        date,
  estado           text not null default 'vigente' check (estado in ('vigente','terminado','anulado')),
  notas            text,
  user_id          uuid references auth.users(id) on delete cascade,
  created_at       timestamptz default now()
);
create index if not exists idx_tratos_proyecto on tratos(proyecto_id);
create index if not exists idx_tratos_user on tratos(user_id);

create table if not exists trato_participantes (
  id          uuid primary key default gen_random_uuid(),
  trato_id    uuid not null references tratos(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  porcentaje  numeric(5,2) not null default 0 check (porcentaje between 0 and 100),
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (trato_id, empleado_id)
);
create index if not exists idx_tratopart_empleado on trato_participantes(empleado_id);
create index if not exists idx_tratopart_user on trato_participantes(user_id);

create table if not exists trato_avances (
  id          uuid primary key default gen_random_uuid(),
  trato_id    uuid not null references tratos(id) on delete cascade,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  fecha       date not null default current_date,
  cantidad    numeric(14,2) not null check (cantidad > 0),   -- unidades, horas, días, o % en suma alzada
  bruto       bigint not null default 0,
  retencion   bigint not null default 0,
  neto        bigint not null default 0,
  estado      text not null default 'borrador' check (estado in ('borrador','aprobado','pagado')),
  aprobado_por uuid references auth.users(id) on delete set null,
  aprobado_en  timestamptz,
  notas       text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);
create index if not exists idx_tratoav_trato on trato_avances(trato_id, fecha);
create index if not exists idx_tratoav_proyecto on trato_avances(proyecto_id, fecha);
create index if not exists idx_tratoav_user on trato_avances(user_id, fecha);

-- Lo que le toca a cada trabajador de un avance aprobado (se fija al aprobar)
create table if not exists trato_avance_reparto (
  id          uuid primary key default gen_random_uuid(),
  avance_id   uuid not null references trato_avances(id) on delete cascade,
  empleado_id uuid not null references empleados(id) on delete cascade,
  monto       bigint not null default 0,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (avance_id, empleado_id)
);
create index if not exists idx_tratorep_empleado on trato_avance_reparto(empleado_id);
create index if not exists idx_tratorep_user on trato_avance_reparto(user_id);

-- ─── 3. Gasto de obra de un trato con terceros ────────────
alter table gastos_obra
  add column if not exists trato_avance_id uuid references trato_avances(id) on delete cascade;
create index if not exists idx_gastos_tratoav on gastos_obra(trato_avance_id);

-- ─── 4. Liquidación: trato y semana corrida ───────────────
alter table liquidaciones
  add column if not exists trato_monto    bigint default 0,
  add column if not exists semana_corrida bigint default 0;

-- ─── 5. RLS, dueño y auditoría: igual que las tablas de la 25 y la 26 ───
do $$
declare t text;
begin
  foreach t in array array['tratos','trato_participantes','trato_avances','trato_avance_reparto'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists acceso_org on %I', t);
    execute format('create policy acceso_org on %I for all using (puede_acceder(user_id)) with check (puede_acceder(user_id))', t);
    execute format('drop trigger if exists trg_owner on %I', t);
    execute format('create trigger trg_owner before insert on %I for each row execute function resolver_owner()', t);
    execute format('drop trigger if exists trg_auditoria on %I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

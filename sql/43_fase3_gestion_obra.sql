-- ============================================================
-- 43 · FASE 3: COMPLETAR LA GESTIÓN DE OBRA
--
-- 1. Carta Gantt: dependencias entre partidas (ruta crítica).
-- 2. Libro de obra digital, con fotos.
-- 3. Prevención de riesgos por obra.
-- 4. APU: rendimiento de la partida y recursos de su cuadrilla.
--
-- Idempotente. Requiere la 25, la 26, la 37 y la 42.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Dependencias de la Carta Gantt ────────────────────
-- partida_id parte cuando termina depende_de_id, más desfase_dias.
create table if not exists partida_dependencias (
  id            uuid primary key default uuid_generate_v4(),
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  partida_id    uuid not null references partidas_proyecto(id) on delete cascade,
  depende_de_id uuid not null references partidas_proyecto(id) on delete cascade,
  desfase_dias  integer not null default 0 check (desfase_dias between -365 and 365),
  user_id       uuid references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  unique (partida_id, depende_de_id),
  check (partida_id <> depende_de_id)
);
create index if not exists idx_dep_proyecto on partida_dependencias(proyecto_id);
create index if not exists idx_dep_user on partida_dependencias(user_id);

-- ─── 2. Libro de obra ─────────────────────────────────────
-- Es un registro: los folios no se editan ni se borran, se anulan con un motivo.
create table if not exists libro_obra (
  id                uuid primary key default uuid_generate_v4(),
  proyecto_id       uuid not null references proyectos(id) on delete cascade,
  folio             integer not null,
  fecha             date not null default current_date,
  tipo              text not null default 'avance'
                    check (tipo in ('avance','observacion','instruccion_ito','visita','otro')),
  clima             text,
  texto             text not null,
  autor             text,
  anulado           boolean not null default false,
  motivo_anulacion  text,
  user_id           uuid references auth.users(id) on delete cascade,
  created_at        timestamptz default now(),
  unique (proyecto_id, folio)
);
create index if not exists idx_libro_proyecto on libro_obra(proyecto_id, fecha desc);
create index if not exists idx_libro_user on libro_obra(user_id);

-- ─── 3. Prevención de riesgos ─────────────────────────────
create table if not exists prevencion_registros (
  id            uuid primary key default uuid_generate_v4(),
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  tipo          text not null check (tipo in ('charla','epp','inspeccion','incidente')),
  fecha         date not null default current_date,
  titulo        text not null,
  detalle       text,
  responsable   text,
  asistentes    integer not null default 0 check (asistentes >= 0),
  gravedad      text check (gravedad in ('leve','grave','fatal')),
  dias_perdidos integer not null default 0 check (dias_perdidos >= 0),
  estado        text not null default 'cerrado' check (estado in ('abierto','cerrado')),
  user_id       uuid references auth.users(id) on delete cascade,
  created_at    timestamptz default now()
);
create index if not exists idx_prev_proyecto on prevencion_registros(proyecto_id, fecha desc);
create index if not exists idx_prev_user on prevencion_registros(user_id);

-- Fotos y respaldos: siguen siendo documentos de la obra
alter table documentos
  add column if not exists libro_id      uuid references libro_obra(id) on delete set null,
  add column if not exists prevencion_id uuid references prevencion_registros(id) on delete set null;
create index if not exists idx_docs_libro on documentos(libro_id);
create index if not exists idx_docs_prevencion on documentos(prevencion_id);

-- ─── 4. APU ───────────────────────────────────────────────
-- Unidades de la partida que hace la cuadrilla en un día
alter table partidas_proyecto
  add column if not exists rendimiento_dia numeric(12,4);

-- Cuadrilla y equipos, a costo por día. Los materiales ya están en partida_materiales.
create table if not exists partida_apu_recursos (
  id          uuid primary key default uuid_generate_v4(),
  partida_id  uuid not null references partidas_proyecto(id) on delete cascade,
  tipo        text not null default 'mano_obra' check (tipo in ('mano_obra','equipo','otro')),
  descripcion text not null,
  cantidad    numeric(10,2) not null default 1 check (cantidad > 0),
  costo_dia   bigint not null default 0 check (costo_dia >= 0),
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);
create index if not exists idx_apu_partida on partida_apu_recursos(partida_id);
create index if not exists idx_apu_user on partida_apu_recursos(user_id);

-- ─── 5. RLS, dueño y auditoría: igual que las tablas de la 25 y la 26 ───
do $$
declare
  t text;
begin
  foreach t in array array['partida_dependencias','libro_obra','prevencion_registros','partida_apu_recursos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists acceso_org on %I', t);
    execute format(
      'create policy acceso_org on %I for all using (puede_acceder(user_id)) with check (puede_acceder(user_id))', t);
    execute format('drop trigger if exists trg_owner on %I', t);
    execute format(
      'create trigger trg_owner before insert on %I for each row execute function resolver_owner()', t);
    execute format('drop trigger if exists trg_auditoria on %I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on %I
       for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

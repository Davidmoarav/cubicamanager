-- ============================================================
-- 42 · FASE 2: CERRAR EL COSTO REAL
--
-- 1. Recepción por línea de las órdenes de compra (y partida por línea).
-- 2. Bodega por obra: entradas, consumo, ajustes y traspasos.
-- 3. Subcontratos con estados de pago, retenciones y avance propios.
-- 4. Equipos y maquinaria con costeo por obra.
--
-- Idempotente. Requiere la 25, la 26 y la 41.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Recepción de órdenes de compra ────────────────────
alter table ordenes_compra drop constraint if exists ordenes_compra_estado_check;
alter table ordenes_compra add constraint ordenes_compra_estado_check
  check (estado in ('borrador','enviada','parcial','recibida','anulada'));

alter table orden_compra_lineas
  add column if not exists partida_id uuid references partidas_proyecto(id) on delete set null;
create index if not exists idx_ocl_partida on orden_compra_lineas(partida_id);

create table if not exists recepciones_oc (
  id         uuid primary key default uuid_generate_v4(),
  orden_id   uuid not null references ordenes_compra(id) on delete restrict,
  linea_id   uuid not null references orden_compra_lineas(id) on delete restrict,
  fecha      date not null default current_date,
  cantidad   numeric(12,2) not null check (cantidad > 0),
  documento  text,                                   -- guía de despacho
  notas      text,
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists idx_rec_orden on recepciones_oc(orden_id);
create index if not exists idx_rec_linea on recepciones_oc(linea_id);
create index if not exists idx_rec_user  on recepciones_oc(user_id);

-- ─── 2. Bodega por obra ───────────────────────────────────
-- cantidad con signo: lo que entra suma y lo que sale resta.
create table if not exists bodega_movimientos (
  id             uuid primary key default uuid_generate_v4(),
  proyecto_id    uuid not null references proyectos(id) on delete cascade,
  material       text not null,
  unidad         text not null default 'un',
  tipo           text not null check (tipo in ('entrada','consumo','ajuste','traspaso')),
  cantidad       numeric(14,2) not null check (cantidad <> 0),
  costo_unitario bigint not null default 0,
  fecha          date not null default current_date,
  partida_id     uuid references partidas_proyecto(id) on delete set null,
  recepcion_id   uuid references recepciones_oc(id) on delete cascade,
  traspaso_id    uuid,                               -- une la salida con su entrada
  notas          text,
  user_id        uuid references auth.users(id) on delete cascade,
  created_at     timestamptz default now(),
  check ((tipo = 'entrada' and cantidad > 0) or (tipo = 'consumo' and cantidad < 0) or tipo in ('ajuste','traspaso'))
);
create index if not exists idx_bodega_proyecto on bodega_movimientos(proyecto_id, fecha);
create index if not exists idx_bodega_recepcion on bodega_movimientos(recepcion_id);
create index if not exists idx_bodega_traspaso on bodega_movimientos(traspaso_id);
create index if not exists idx_bodega_user on bodega_movimientos(user_id);

-- ─── 3. Subcontratos ──────────────────────────────────────
create table if not exists subcontratos (
  id                 uuid primary key default uuid_generate_v4(),
  proyecto_id        uuid not null references proyectos(id) on delete cascade,
  proveedor_id       uuid references proveedores(id) on delete set null,
  subcontratista     text not null,                  -- snapshot del nombre
  descripcion        text,
  partida_id         uuid references partidas_proyecto(id) on delete set null,
  monto_contrato     bigint not null default 0 check (monto_contrato >= 0),
  retencion_pct      numeric(5,2) not null default 0 check (retencion_pct between 0 and 100),
  anticipo           bigint not null default 0 check (anticipo >= 0),
  retencion_devuelta bigint not null default 0 check (retencion_devuelta >= 0),
  fecha_inicio       date,
  fecha_fin          date,
  estado             text not null default 'vigente' check (estado in ('vigente','terminado','anulado')),
  notas              text,
  user_id            uuid references auth.users(id) on delete cascade,
  created_at         timestamptz default now()
);
create index if not exists idx_sub_proyecto on subcontratos(proyecto_id);
create index if not exists idx_sub_user on subcontratos(user_id);

create table if not exists subcontrato_eps (
  id               uuid primary key default uuid_generate_v4(),
  subcontrato_id   uuid not null references subcontratos(id) on delete cascade,
  numero           integer not null,
  fecha            date not null default current_date,
  avance_acumulado numeric(5,2) not null check (avance_acumulado > 0 and avance_acumulado <= 100),
  bruto            bigint not null default 0,
  retencion        bigint not null default 0,
  anticipo_desc    bigint not null default 0,
  neto             bigint not null default 0,
  estado           text not null default 'borrador' check (estado in ('borrador','aprobado','pagado')),
  factura_id       uuid references facturas(id) on delete set null,
  notas            text,
  user_id          uuid references auth.users(id) on delete cascade,
  created_at       timestamptz default now(),
  unique (subcontrato_id, numero)
);
create index if not exists idx_subep_user on subcontrato_eps(user_id);
create index if not exists idx_subep_factura on subcontrato_eps(factura_id);

-- ─── 4. Equipos y maquinaria ──────────────────────────────
create table if not exists equipos (
  id           uuid primary key default uuid_generate_v4(),
  nombre       text not null,
  codigo       text,
  tipo         text not null default 'arrendado' check (tipo in ('propio','arrendado')),
  proveedor    text,
  unidad_cobro text not null default 'dia' check (unidad_cobro in ('hora','dia','mes')),
  tarifa       bigint not null default 0 check (tarifa >= 0),
  activo       boolean not null default true,
  user_id      uuid references auth.users(id) on delete cascade,
  created_at   timestamptz default now()
);
create index if not exists idx_equipos_user on equipos(user_id);

create table if not exists equipo_usos (
  id          uuid primary key default uuid_generate_v4(),
  equipo_id   uuid not null references equipos(id) on delete restrict,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  partida_id  uuid references partidas_proyecto(id) on delete set null,
  fecha_desde date not null,
  fecha_hasta date,
  cantidad    numeric(10,2) not null check (cantidad > 0),
  tarifa      bigint not null default 0 check (tarifa >= 0),
  monto       bigint not null default 0,
  factura_id  uuid references facturas(id) on delete set null,
  notas       text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);
create index if not exists idx_uso_proyecto on equipo_usos(proyecto_id, fecha_desde);
create index if not exists idx_uso_equipo on equipo_usos(equipo_id);
create index if not exists idx_uso_factura on equipo_usos(factura_id);
create index if not exists idx_uso_user on equipo_usos(user_id);

-- ─── 5. Origen de los gastos automáticos ──────────────────
alter table gastos_obra
  add column if not exists subcontrato_ep_id uuid references subcontrato_eps(id) on delete cascade,
  add column if not exists equipo_uso_id     uuid references equipo_usos(id) on delete cascade,
  add column if not exists traspaso_id       uuid;
create index if not exists idx_gastos_subep on gastos_obra(subcontrato_ep_id);
create index if not exists idx_gastos_uso on gastos_obra(equipo_uso_id);
create index if not exists idx_gastos_traspaso on gastos_obra(traspaso_id);

-- ─── 6. RLS, dueño y auditoría: igual que las tablas de la 25 y la 26 ───
do $$
declare
  t text;
begin
  foreach t in array array['recepciones_oc','bodega_movimientos','subcontratos','subcontrato_eps','equipos','equipo_usos'] loop
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

-- ─── 7. Órdenes ya recibidas: su recepción completa ───────
-- Sin esto el gasto de esas órdenes pasaría a cero. No generan entrada a bodega:
-- ese material ya no se puede dar por disponible.
-- Los triggers se apagan: en el SQL Editor no hay usuario, y trg_owner dejaría user_id en NULL.
alter table recepciones_oc disable trigger user;

insert into recepciones_oc (orden_id, linea_id, fecha, cantidad, documento, user_id)
select o.id, l.id, coalesce(o.fecha, current_date), l.cantidad, 'Recepción previa a la Fase 2', o.user_id
  from ordenes_compra o
  join orden_compra_lineas l on l.orden_id = o.id
 where o.estado = 'recibida'
   and l.cantidad > 0
   and not exists (select 1 from recepciones_oc r where r.linea_id = l.id);

alter table recepciones_oc enable trigger user;

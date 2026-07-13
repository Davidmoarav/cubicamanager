-- ============================================================
-- ÓRDENES DE COMPRA
-- Cabecera + líneas. Precios/cantidades pueden auto-generarse
-- desde los rendimientos de material de las partidas del proyecto.
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- ============================================================

-- ─── Cabecera ──────────────────────────────────────────────
create table ordenes_compra (
  id            uuid primary key default uuid_generate_v4(),
  numero        integer not null default 1,
  proveedor_id  uuid references proveedores(id) on delete set null,
  proveedor     text,                                   -- snapshot del nombre
  proyecto_id   uuid references proyectos(id)   on delete set null,
  proyecto      text,                                   -- snapshot del nombre
  fecha         date default current_date,
  estado        text default 'borrador'
                check (estado in ('borrador','enviada','recibida','anulada')),
  neto          bigint default 0,
  iva           bigint default 0,
  total         bigint default 0,
  notas         text,
  user_id       uuid references auth.users(id) on delete cascade,
  created_at    timestamptz default now()
);

alter table ordenes_compra enable row level security;

create policy "oc_own" on ordenes_compra
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_oc_user      on ordenes_compra(user_id, numero desc);
create index idx_oc_proveedor on ordenes_compra(proveedor_id);
create index idx_oc_proyecto  on ordenes_compra(proyecto_id);

-- ─── Líneas ────────────────────────────────────────────────
create table orden_compra_lineas (
  id              uuid primary key default uuid_generate_v4(),
  orden_id        uuid references ordenes_compra(id) on delete cascade,
  material        text not null,
  unidad          text default 'un',
  cantidad        numeric(12,2) default 0,
  precio_unitario bigint default 0,
  subtotal        bigint default 0,
  user_id         uuid references auth.users(id) on delete cascade,
  created_at      timestamptz default now()
);

alter table orden_compra_lineas enable row level security;

create policy "ocl_own" on orden_compra_lineas
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_ocl_orden on orden_compra_lineas(orden_id);
create index idx_ocl_user  on orden_compra_lineas(user_id);

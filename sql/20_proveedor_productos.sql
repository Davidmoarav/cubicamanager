-- ============================================================
-- CATÁLOGO DE PRODUCTOS POR PROVEEDOR
-- Cada proveedor puede tener su lista de productos con precio,
-- cargable por CSV. Al hacer una OC se eligen desde acá (precio automático).
-- Requiere pg_trgm (migración 16). Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

create table if not exists proveedor_productos (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) on delete cascade,
  proveedor_id uuid references proveedores(id) on delete cascade,
  codigo       text,
  descripcion  text not null,
  unidad       text default 'un',
  precio       bigint default 0,
  created_at   timestamptz default now()
);

create index if not exists idx_prod_prov      on proveedor_productos(proveedor_id);
create index if not exists idx_prod_user      on proveedor_productos(user_id);
create index if not exists idx_prod_desc_trgm on proveedor_productos using gin (descripcion gin_trgm_ops);
create index if not exists idx_prod_cod_trgm  on proveedor_productos using gin (codigo gin_trgm_ops);

alter table proveedor_productos enable row level security;
drop policy if exists "prod_prov_own" on proveedor_productos;
create policy "prod_prov_own" on proveedor_productos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

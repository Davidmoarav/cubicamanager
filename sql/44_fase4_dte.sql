-- ============================================================
-- 44 · FASE 4: EMISIÓN DE DOCUMENTOS TRIBUTARIOS ELECTRÓNICOS
--
-- Registro de cada emisión de una factura o nota de venta.
-- modo = 'demo': generado sin enviar al SII, sin validez tributaria.
--
-- Idempotente. Requiere la 25 y la 26.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

create table if not exists dte_emisiones (
  id          uuid primary key default uuid_generate_v4(),
  factura_id  uuid not null references facturas(id) on delete cascade,
  tipo_dte    integer not null check (tipo_dte in (33, 34, 56, 61)),
  estado      text not null default 'enviando'
              check (estado in ('enviando', 'enviado', 'aceptado', 'rechazado', 'error')),
  modo        text not null check (modo in ('demo', 'produccion')),
  proveedor   text not null,
  folio       text,
  track_id    text,
  pdf_url     text,
  documento   jsonb not null default '{}'::jsonb,
  respuesta   jsonb,
  error       text,
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Una factura no puede emitirse dos veces; tras un rechazo o error se puede reintentar.
-- Va por modo: una prueba en demo no impide la emisión real al conectar un proveedor.
create unique index if not exists uq_dte_factura_vigente
  on dte_emisiones(factura_id, modo)
  where estado in ('enviando', 'enviado', 'aceptado');

create index if not exists idx_dte_user on dte_emisiones(user_id, created_at desc);

-- RLS, dueño y auditoría: igual que las tablas de la 25 y la 26
alter table dte_emisiones enable row level security;

drop policy if exists acceso_org on dte_emisiones;
create policy acceso_org on dte_emisiones
  for all using (puede_acceder(user_id)) with check (puede_acceder(user_id));

drop trigger if exists trg_owner on dte_emisiones;
create trigger trg_owner before insert on dte_emisiones
  for each row execute function resolver_owner();

drop trigger if exists trg_auditoria on dte_emisiones;
create trigger trg_auditoria after insert or update or delete on dte_emisiones
  for each row execute function registrar_auditoria();

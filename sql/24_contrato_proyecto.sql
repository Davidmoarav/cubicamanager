-- ============================================================
-- CONTRATOS → PROYECTO / CLIENTE
-- Enlaza el contrato con el proyecto que ejecuta (para ver avance
-- facturado real) y con el cliente contraparte.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table contratos
  add column if not exists proyecto_id uuid references proyectos(id) on delete set null;
alter table contratos
  add column if not exists cliente_id  uuid references clientes(id)  on delete set null;

create index if not exists idx_contratos_proyecto on contratos(proyecto_id);

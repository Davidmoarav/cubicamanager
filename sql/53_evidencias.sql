-- ============================================================
-- 53 · EVIDENCIAS EN TODOS LOS PROCESOS
-- Un documento o foto puede colgar de cualquier registro de la obra:
-- una partida o vivienda, un estado de pago, un parte diario, una recepción,
-- un subcontrato, un movimiento de bodega, un uso de equipo, un gasto, un trato.
--   entidad_tipo + entidad_id → el registro que respalda.
--   partida_id                → la partida o la vivienda (grupo) a la que pertenece,
--                               para sacar la carpeta completa de una vivienda.
--   etapa                     → antes / durante / después (lo que pide SERVIU por vivienda).
--   tomada_en, lat, lng       → cuándo y dónde se tomó la foto.
--   subido_por                → quién la subió (user_id es el dueño de la organización).
-- No cambia nada de lo existente: libro de obra y prevención siguen con sus columnas.
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table documentos
  add column if not exists entidad_tipo text,
  add column if not exists entidad_id   uuid,
  add column if not exists partida_id   uuid references partidas_proyecto(id) on delete set null,
  add column if not exists etapa        text,
  add column if not exists tomada_en    timestamptz,
  add column if not exists lat          numeric(9,6),
  add column if not exists lng          numeric(9,6),
  add column if not exists subido_por   uuid references auth.users(id) on delete set null;

alter table documentos drop constraint if exists documentos_etapa_check;
alter table documentos add constraint documentos_etapa_check
  check (etapa is null or etapa in ('antes','durante','despues'));

alter table documentos drop constraint if exists documentos_entidad_check;
alter table documentos add constraint documentos_entidad_check
  check ((entidad_tipo is null) = (entidad_id is null));

create index if not exists idx_docs_entidad on documentos(entidad_tipo, entidad_id) where entidad_id is not null;
create index if not exists idx_docs_partida on documentos(partida_id) where partida_id is not null;

-- Listados de una obra: siempre por proyecto y del más nuevo al más antiguo
create index if not exists idx_docs_proyecto_fecha on documentos(proyecto_id, created_at desc);

notify pgrst, 'reload schema';

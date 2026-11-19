-- ============================================================
-- 57 · RECUPERAR PARTIDAS DAÑADAS (cantidad 1 y precio 0)
-- Hasta noviembre de 2026, mover la barra de avance o guardar las notas de una partida
-- le escribía cantidad = 1 y precio_unitario = 0. La Bitácora (sql/26) guardó los valores
-- de antes: este script los devuelve.
--
-- Solo toca partidas que SIGUEN en cantidad 1 y precio 0 y cuya Bitácora muestra que
-- antes tenían otros valores. Si alguien ya las corrigió a mano, no las toca.
--
-- PASO 1: ejecuta solo la consulta de REVISIÓN y mira la lista.
-- PASO 2: si está bien, ejecuta el bloque de RECUPERACIÓN.
-- PASO 3: en la app, en cada obra recuperada, mueve una barra de avance (o guarda una
--         partida) para que se recalcule el avance de la obra.
-- ============================================================

-- ─── PASO 1 · REVISIÓN (no cambia nada) ───────────────────
with dano as (
  -- El primer cambio que dejó la partida en 1 × $0: su "antes" es el valor original
  select distinct on (a.registro_id)
         a.registro_id,
         (a.antes->>'cantidad')::numeric        as cantidad_original,
         (a.antes->>'precio_unitario')::numeric as precio_original,
         a.creado_en                             as danada_el,
         a.actor_email
    from auditoria a
   where a.tabla = 'partidas_proyecto'
     and a.accion = 'modificó'
     and (a.despues->>'cantidad')::numeric = 1
     and coalesce((a.despues->>'precio_unitario')::numeric, 0) = 0
     and (coalesce((a.antes->>'precio_unitario')::numeric, 0) > 0
          or coalesce((a.antes->>'cantidad')::numeric, 1) <> 1)
   order by a.registro_id, a.creado_en asc
)
select pr.nombre as obra, p.descripcion, p.unidad,
       p.cantidad as cantidad_hoy, p.precio_unitario as precio_hoy,
       d.cantidad_original, d.precio_original, d.danada_el, d.actor_email
  from dano d
  join partidas_proyecto p on p.id = d.registro_id
  join proyectos pr on pr.id = p.proyecto_id
 where p.cantidad = 1 and coalesce(p.precio_unitario, 0) = 0
 order by pr.nombre, p.orden;

-- ─── PASO 2 · RECUPERACIÓN (descomenta y ejecuta) ─────────
-- with dano as (
--   select distinct on (a.registro_id)
--          a.registro_id,
--          (a.antes->>'cantidad')::numeric        as cantidad_original,
--          (a.antes->>'precio_unitario')::numeric as precio_original
--     from auditoria a
--    where a.tabla = 'partidas_proyecto'
--      and a.accion = 'modificó'
--      and (a.despues->>'cantidad')::numeric = 1
--      and coalesce((a.despues->>'precio_unitario')::numeric, 0) = 0
--      and (coalesce((a.antes->>'precio_unitario')::numeric, 0) > 0
--           or coalesce((a.antes->>'cantidad')::numeric, 1) <> 1)
--    order by a.registro_id, a.creado_en asc
-- )
-- update partidas_proyecto p
--    set cantidad        = d.cantidad_original,
--        precio_unitario = round(d.precio_original)
--   from dano d
--  where p.id = d.registro_id
--    and p.cantidad = 1 and coalesce(p.precio_unitario, 0) = 0;

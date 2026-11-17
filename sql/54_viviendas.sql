-- ============================================================
-- 54 · VIVIENDAS: OBRA ÚNICA Y PROGRAMA CON EL MISMO MOTOR
-- Una obra es 'unica' (como hasta hoy) o 'programa' (varias viviendas de beneficiarios).
-- En un programa, cada vivienda tiene su ficha (beneficiario, RUT, dirección, subsidio,
-- estado y recepción) y apunta a su grupo raíz de partidas, que sigue llevando
-- el costo y el avance. La obra única no cambia.
--
-- Además deja en la misma forma las obras que vinieron del Filtro DS27: antes cada vivienda
-- era una partida suelta; ahora es un grupo con su partida debajo, igual que las del Excel.
-- Los estados de pago ya emitidos quedan apuntando al grupo, para no cobrar dos veces.
--
-- Requiere 25, 26, 28 y 29. La parte del Filtro solo corre si existen la 50 y la 51.
-- Idempotente. Ejecutar COMPLETO en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Tipo de obra y datos del programa ─────────────────
alter table proyectos
  add column if not exists tipo                 text not null default 'unica',
  add column if not exists programa             text,   -- DS27, DS49, DS10, DS255, otro
  add column if not exists codigo_grupo         text,
  add column if not exists entidad_patrocinante text,
  add column if not exists resolucion           text,
  add column if not exists comuna               text;

alter table proyectos drop constraint if exists proyectos_tipo_check;
alter table proyectos add constraint proyectos_tipo_check check (tipo in ('unica','programa'));

-- ─── 2. Viviendas ─────────────────────────────────────────
create table if not exists viviendas (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references proyectos(id) on delete cascade,
  -- Grupo raíz de partidas de la vivienda: si se borra el grupo, se va la ficha
  partida_id      uuid not null references partidas_proyecto(id) on delete cascade,
  beneficiario    text not null,
  rut             text,
  direccion       text,
  rol_avaluo      text,
  telefono        text,
  subsidio_uf     numeric(10,2) check (subsidio_uf >= 0),
  ahorro_uf       numeric(10,2) check (ahorro_uf >= 0),
  postulante_id   uuid,                         -- postulante del Filtro DS27, si vino de ahí
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','en_ejecucion','terminada','recepcionada')),
  fecha_inicio    date,
  fecha_termino   date,
  fecha_recepcion date,
  notas           text,
  user_id         uuid references auth.users(id) on delete cascade,
  created_at      timestamptz default now()
);
create unique index if not exists uq_viviendas_partida on viviendas(partida_id);
create index if not exists idx_viviendas_proyecto on viviendas(proyecto_id);
create index if not exists idx_viviendas_user on viviendas(user_id);
create index if not exists idx_viviendas_rut on viviendas(user_id, rut);

-- RLS, dueño y auditoría: igual que las tablas de la 25 y la 26
alter table viviendas enable row level security;

drop policy if exists acceso_org on viviendas;
create policy acceso_org on viviendas
  for all using (puede_acceder(user_id)) with check (puede_acceder(user_id));

drop trigger if exists trg_owner on viviendas;
create trigger trg_owner before insert on viviendas
  for each row execute function resolver_owner();

drop trigger if exists trg_auditoria on viviendas;
create trigger trg_auditoria after insert or update or delete on viviendas
  for each row execute function registrar_auditoria();

-- ─── 3. Obras que vinieron del Filtro DS27 ────────────────
-- Cada partida suelta 'viv' pasa a ser: grupo (la vivienda) → partida (las obras).
-- La partida conserva su id: gastos, horas y avance siguen apuntando a ella.
do $$
declare
  r        record;
  v_grupo  uuid;
  v_post   record;
  v_n      integer := 0;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'filtro_grupos' and column_name = 'proyecto_id') then
    raise notice 'Sin Filtro DS27 enlazado a obras: nada que convertir';
    return;
  end if;

  -- Desde el editor SQL no hay usuario: los triggers pondrían el dueño en nulo
  alter table partidas_proyecto disable trigger user;
  alter table viviendas disable trigger user;
  alter table estado_pago_detalle disable trigger user;
  alter table proyectos disable trigger user;

  for r in
    execute $q$
      select p.*, g.id as filtro_grupo_id
        from partidas_proyecto p
        join filtro_grupos g on g.proyecto_id = p.proyecto_id
       where p.parent_id is null
         and coalesce(p.es_grupo, false) = false
         and p.unidad = 'viv'
         and not exists (select 1 from partidas_proyecto h where h.parent_id = p.id)
       order by p.proyecto_id, p.orden
    $q$
  loop
    v_grupo := gen_random_uuid();

    insert into partidas_proyecto
      (id, proyecto_id, parent_id, nivel, es_grupo, orden, descripcion, unidad,
       cantidad, precio_unitario, costo_unitario, avance, user_id)
    values
      (v_grupo, r.proyecto_id, null, 1, true, r.orden, r.descripcion, 'gl',
       0, 0, 0, r.avance, r.user_id);

    update partidas_proyecto
       set parent_id = v_grupo, nivel = 2, orden = 0, descripcion = 'Obras de la vivienda'
     where id = r.id;

    -- Lo ya cobrado de esta vivienda queda a nombre del grupo
    update estado_pago_detalle set partida_id = v_grupo where partida_id = r.id;

    execute $q$
      select fp.id, fp.nombre, fp.rut, fp.direccion, fp.telefono, fp.ahorro_uf
        from filtro_postulantes fp
       where fp.grupo_id = $1
         and ($2 = 'Vivienda ' || fp.nombre or $2 like 'Vivienda ' || fp.nombre || ' – %')
       limit 1
    $q$ into v_post using r.filtro_grupo_id, r.descripcion;

    insert into viviendas
      (proyecto_id, partida_id, beneficiario, rut, direccion, telefono, ahorro_uf, postulante_id, estado, user_id)
    values
      (r.proyecto_id, v_grupo,
       coalesce(v_post.nombre, regexp_replace(r.descripcion, '^Vivienda ', '')),
       v_post.rut, v_post.direccion, v_post.telefono, v_post.ahorro_uf, v_post.id,
       case when r.avance >= 100 then 'terminada' when r.avance > 0 then 'en_ejecucion' else 'pendiente' end,
       r.user_id);

    v_n := v_n + 1;
  end loop;

  execute $q$
    update proyectos p set tipo = 'programa', programa = coalesce(p.programa, 'DS27')
      from filtro_grupos g where g.proyecto_id = p.id
  $q$;

  alter table partidas_proyecto enable trigger user;
  alter table viviendas enable trigger user;
  alter table estado_pago_detalle enable trigger user;
  alter table proyectos enable trigger user;

  raise notice 'Viviendas del Filtro convertidas: %', v_n;
end $$;

-- Las obras importadas por Excel NO se convierten solas: un grupo raíz puede ser una vivienda
-- o un capítulo. Se convierten desde la pestaña Viviendas de cada obra, con un botón.

notify pgrst, 'reload schema';

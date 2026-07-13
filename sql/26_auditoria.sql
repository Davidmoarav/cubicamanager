-- ============================================================
-- BITÁCORA DE AUDITORÍA
-- Registra TODO cambio de datos: quién, cuándo, qué, antes y después.
-- Se captura con triggers en la base: cualquier cambio queda registrado
-- venga de donde venga (la app, un script, el panel de Supabase).
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

create table if not exists auditoria (
  id           bigserial primary key,
  owner_id     uuid not null,                 -- organización a la que pertenece el dato
  actor_id     uuid,                          -- usuario que hizo el cambio
  actor_email  text,                          -- email legible (sobrevive aunque se elimine el usuario)
  actor_rol    text,                          -- rol que tenía al hacerlo
  accion       text not null,                 -- creó / modificó / eliminó
  tabla        text not null,
  registro_id  uuid,                          -- id de la fila afectada
  descripcion  text,                          -- texto legible (ej: "Factura N° 1234")
  antes        jsonb,                         -- valores previos (solo en modificar/eliminar)
  despues      jsonb,                         -- valores nuevos (solo en crear/modificar)
  cambios      text[],                        -- nombres de los campos que cambiaron
  creado_en    timestamptz not null default now()
);

create index if not exists idx_aud_owner  on auditoria(owner_id, creado_en desc);
create index if not exists idx_aud_tabla  on auditoria(owner_id, tabla);
create index if not exists idx_aud_actor  on auditoria(owner_id, actor_email);
create index if not exists idx_aud_fecha  on auditoria(creado_en desc);

-- ─── RLS: cada organización ve solo su propia bitácora ────
-- Es de solo lectura desde la app: nadie puede editar ni borrar el historial.
alter table auditoria enable row level security;
drop policy if exists auditoria_lectura on auditoria;
create policy auditoria_lectura on auditoria
  for select using (puede_acceder(owner_id));

-- ─── Etiqueta legible de cada registro ───────────────────
create or replace function etiqueta_registro(t text, r jsonb) returns text as $$
begin
  return coalesce(
    case t
      when 'facturas'          then 'Factura N° '  || coalesce(r->>'numero', '?')
      when 'cotizaciones'      then 'Cotización N° '|| coalesce(r->>'numero', '?')
      when 'ordenes_compra'    then 'OC N° '       || coalesce(r->>'numero', '?')
      when 'proyectos'         then coalesce(r->>'nombre', 'Proyecto')
      when 'clientes'          then coalesce(r->>'razon_social', 'Cliente')
      when 'proveedores'       then coalesce(r->>'nombre', 'Proveedor')
      when 'empleados'         then coalesce(r->>'nombre', 'Empleado')
      when 'estados_pago'      then 'Estado de pago N° ' || coalesce(r->>'numero', '?')
      when 'partidas_proyecto' then coalesce(r->>'descripcion', 'Partida')
      when 'gastos_obra'       then coalesce(r->>'descripcion', 'Gasto')
      when 'contratos'         then 'Contrato ' || coalesce(r->>'numero', '')
      when 'liquidaciones'     then 'Liquidación ' || coalesce(r->>'periodo', '')
      when 'miembros'          then 'Usuario ' || coalesce(r->>'member_email', '')
      else null
    end,
    coalesce(r->>'descripcion', r->>'nombre', r->>'numero', '')
  );
end;
$$ language plpgsql immutable;

-- ─── Trigger de auditoría ────────────────────────────────
create or replace function registrar_auditoria() returns trigger as $$
declare
  v_owner   uuid;
  v_email   text;
  v_rol     text;
  v_accion  text;
  v_antes   jsonb;
  v_despues jsonb;
  v_cambios text[];
  k         text;
begin
  -- Datos del actor
  select email into v_email from auth.users where id = auth.uid();
  select m.rol into v_rol from miembros m
    where m.member_user_id = auth.uid() and m.estado = 'activo' limit 1;
  v_rol := coalesce(v_rol, 'admin');

  if (tg_op = 'DELETE') then
    v_accion  := 'eliminó';
    v_antes   := to_jsonb(old);
    v_owner   := (to_jsonb(old)->>'user_id')::uuid;
  elsif (tg_op = 'UPDATE') then
    v_accion  := 'modificó';
    v_antes   := to_jsonb(old);
    v_despues := to_jsonb(new);
    v_owner   := (to_jsonb(new)->>'user_id')::uuid;
    -- Solo los campos que realmente cambiaron (ignora los de sistema)
    for k in select jsonb_object_keys(v_despues) loop
      if k not in ('id','user_id','created_at','updated_at')
         and (v_antes->>k) is distinct from (v_despues->>k) then
        v_cambios := array_append(v_cambios, k);
      end if;
    end loop;
    -- Si no cambió nada relevante, no registrar ruido
    if v_cambios is null then return new; end if;
  else
    v_accion  := 'creó';
    v_despues := to_jsonb(new);
    v_owner   := (to_jsonb(new)->>'user_id')::uuid;
  end if;

  if v_owner is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  insert into auditoria (owner_id, actor_id, actor_email, actor_rol, accion, tabla,
                         registro_id, descripcion, antes, despues, cambios)
  values (
    v_owner, auth.uid(), v_email, v_rol, v_accion, tg_table_name,
    (coalesce(v_despues, v_antes)->>'id')::uuid,
    etiqueta_registro(tg_table_name, coalesce(v_despues, v_antes)),
    v_antes, v_despues, v_cambios
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql security definer;

-- ─── Aplicar el trigger a las tablas de datos ────────────
do $$
declare
  t text;
  tablas text[] := array[
    'proyectos','partidas_proyecto','partida_materiales','estados_pago','gastos_obra',
    'facturas','cotizaciones','ordenes_compra','orden_compra_lineas','clientes',
    'proveedores','proveedor_productos','empleados','liquidaciones','contratos',
    'devoluciones','catalogo_partidas','ppm_config','parametros_remuneracion',
    'empresa_config','proyeccion_mo','miembros'
  ];
begin
  foreach t in array tablas loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists trg_auditoria on %I', t);
      execute format(
        'create trigger trg_auditoria after insert or update or delete on %I
         for each row execute function registrar_auditoria()', t);
    end if;
  end loop;
end $$;

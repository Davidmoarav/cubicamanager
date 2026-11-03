-- ============================================================
-- 48 · PORTAL DEL CLIENTE: COBROS AL DÍA Y PAGOS INFORMADOS
-- El cliente ve sus estados de pago al día, los datos para transferir, y puede
-- avisar que pagó. El pago no se registra hasta que la empresa lo confirma.
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── Datos para recibir transferencias ───
alter table empresa_config add column if not exists banco          text;
alter table empresa_config add column if not exists tipo_cuenta    text;
alter table empresa_config add column if not exists numero_cuenta  text;
alter table empresa_config add column if not exists titular_cuenta text;
alter table empresa_config add column if not exists rut_titular    text;
alter table empresa_config add column if not exists correo_pagos   text;

-- ─── Pagos que informa el cliente ───
create table if not exists avisos_pago (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  proyecto_id     uuid not null references proyectos(id) on delete cascade,
  estado_pago_id  uuid not null references estados_pago(id) on delete cascade,
  monto           bigint not null check (monto > 0),
  fecha_pago      date not null,
  referencia      text not null,
  pagador         text not null,
  comentario      text,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado')),
  motivo          text,
  resuelto_en     timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_avisos_pago_ep on avisos_pago(estado_pago_id, created_at desc);
create index if not exists idx_avisos_pago_pend on avisos_pago(user_id, estado);

alter table avisos_pago enable row level security;
drop policy if exists acceso_org on avisos_pago;
create policy acceso_org on avisos_pago for all
  using (puede_acceder(user_id)) with check (puede_acceder(user_id));

-- ─── Lo que ve el cliente, siempre al día (no depende de "Actualizar datos del link") ───
create or replace function portal_cobros(t text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with s as (
    select proyecto_id, user_id from proyecto_share where token = t and activo = true limit 1
  )
  select jsonb_build_object(
    'cobros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', ep.numero, 'fecha', ep.fecha, 'periodo', ep.periodo, 'estado', ep.estado, 'total', ep.total,
        'factura', f.numero, 'vencimiento', f.vencimiento,
        'aviso', (
          select jsonb_build_object('estado', a.estado, 'monto', a.monto, 'fecha_pago', a.fecha_pago, 'motivo', a.motivo)
          from avisos_pago a where a.estado_pago_id = ep.id order by a.created_at desc limit 1
        )
      ) order by ep.numero)
      from estados_pago ep
      left join facturas f on f.id = ep.factura_id
      where ep.proyecto_id = s.proyecto_id and ep.user_id = s.user_id
        and ep.estado not in ('borrador', 'rechazado')
    ), '[]'::jsonb),
    'banco', (
      select jsonb_build_object('banco', e.banco, 'tipo_cuenta', e.tipo_cuenta, 'numero_cuenta', e.numero_cuenta,
        'titular', e.titular_cuenta, 'rut', e.rut_titular, 'correo', e.correo_pagos)
      from empresa_config e where e.user_id = s.user_id and e.numero_cuenta is not null and e.numero_cuenta <> ''
    )
  )
  from s;
$$;

-- ─── El cliente informa un pago ───
create or replace function portal_avisar_pago(
  t text, p_numero int, p_monto bigint, p_fecha date, p_referencia text, p_pagador text, p_comentario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share record;
  v_ep    record;
begin
  select proyecto_id, user_id into v_share from proyecto_share where token = t and activo = true limit 1;
  if v_share is null then return jsonb_build_object('ok', false, 'error', 'Este link ya no está disponible'); end if;

  select id, estado into v_ep from estados_pago
  where proyecto_id = v_share.proyecto_id and user_id = v_share.user_id and numero = p_numero limit 1;
  if v_ep is null or v_ep.estado not in ('presentado', 'aprobado') then
    return jsonb_build_object('ok', false, 'error', 'Este estado de pago no está por pagar');
  end if;

  if p_monto is null or p_monto <= 0 or p_monto > 999999999999 then
    return jsonb_build_object('ok', false, 'error', 'Revisa el monto');
  end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 365 then
    return jsonb_build_object('ok', false, 'error', 'Revisa la fecha del pago');
  end if;
  if length(trim(coalesce(p_referencia, ''))) not between 3 and 80
     or length(trim(coalesce(p_pagador, ''))) not between 2 and 120
     or length(coalesce(p_comentario, '')) > 500 then
    return jsonb_build_object('ok', false, 'error', 'Revisa los datos del pago');
  end if;

  if exists (select 1 from avisos_pago where estado_pago_id = v_ep.id and estado = 'pendiente') then
    return jsonb_build_object('ok', false, 'error', 'Ya informaste un pago para este estado de pago; está en revisión');
  end if;
  -- Un link público no debe servir para llenar la base
  if (select count(*) from avisos_pago where estado_pago_id = v_ep.id) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Comunícate con la empresa para informar este pago');
  end if;

  insert into avisos_pago (user_id, proyecto_id, estado_pago_id, monto, fecha_pago, referencia, pagador, comentario)
  values (v_share.user_id, v_share.proyecto_id, v_ep.id, p_monto, p_fecha,
          trim(p_referencia), trim(p_pagador), nullif(trim(coalesce(p_comentario, '')), ''));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function portal_cobros(text) from public;
revoke all on function portal_avisar_pago(text, int, bigint, date, text, text, text) from public;
grant execute on function portal_cobros(text) to anon, authenticated;
grant execute on function portal_avisar_pago(text, int, bigint, date, text, text, text) to anon, authenticated;

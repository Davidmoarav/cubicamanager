-- ============================================================
-- 56 · MODALIDAD DE CONTRATO, SUBCONTRATOS Y PARÁMETROS DE REMUNERACIÓN
-- 1. Obra: modalidad del contrato con el mandante (suma alzada, serie de precios,
--    administración) y su honorario. El estado de pago se calcula según ella.
-- 2. Estado de pago: alcance (viviendas cobradas), cantidades medidas, costo rendido y honorario.
-- 3. Subcontrato: precios unitarios (ítems), por hora o día, o administración.
-- 4. Remuneraciones: ingreso mínimo y días laborales de la semana (semana corrida).
-- Requiere 12, 13, 42 y 22. Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- ─── 1. Obra ──────────────────────────────────────────────
alter table proyectos
  add column if not exists modalidad_contrato  text not null default 'suma_alzada',
  add column if not exists honorario_admin_pct numeric(5,2) not null default 0;
alter table proyectos drop constraint if exists proyectos_modalidad_contrato_check;
alter table proyectos add constraint proyectos_modalidad_contrato_check
  check (modalidad_contrato in ('suma_alzada','serie_precios','administracion'));
alter table proyectos drop constraint if exists proyectos_honorario_admin_check;
alter table proyectos add constraint proyectos_honorario_admin_check
  check (honorario_admin_pct between 0 and 100);

-- Los contratos ya enlazados a una obra le pasan su tipo
update proyectos p
   set modalidad_contrato = case c.tipo
         when 'Serie de precios' then 'serie_precios'
         when 'Administración delegada' then 'administracion'
         else 'suma_alzada' end
  from contratos c
 where c.proyecto_id = p.id
   and c.tipo in ('Serie de precios','Administración delegada')
   and p.modalidad_contrato = 'suma_alzada'
   and not exists (select 1 from estados_pago e where e.proyecto_id = p.id and e.estado <> 'rechazado');

-- ─── 2. Estado de pago ────────────────────────────────────
alter table estados_pago
  add column if not exists modalidad       text,
  add column if not exists alcance         uuid[],
  add column if not exists costo_rendido   bigint not null default 0,
  add column if not exists honorario_pct   numeric(5,2) not null default 0,
  add column if not exists honorario_monto bigint not null default 0;

alter table estado_pago_detalle
  add column if not exists unidad            text,
  add column if not exists precio_unitario   bigint,
  add column if not exists cantidad_anterior numeric(14,3),
  add column if not exists cantidad_actual   numeric(14,3);

-- Los % del detalle pueden tener decimales (un cobro parcial no es un % entero)
alter table estado_pago_detalle alter column avance_anterior type numeric(7,2);
alter table estado_pago_detalle alter column avance_actual   type numeric(7,2);
alter table estado_pago_detalle alter column avance_periodo  type numeric(7,2);

-- ─── 3. Subcontratos ──────────────────────────────────────
alter table subcontratos
  add column if not exists modalidad     text not null default 'suma_alzada',
  add column if not exists items         jsonb not null default '[]'::jsonb,
  add column if not exists tarifa        bigint not null default 0,
  add column if not exists unidad_tiempo text not null default 'hora',
  add column if not exists honorario_pct numeric(5,2) not null default 0;
alter table subcontratos drop constraint if exists subcontratos_modalidad_check;
alter table subcontratos add constraint subcontratos_modalidad_check
  check (modalidad in ('suma_alzada','precios_unitarios','por_tiempo','administracion'));
alter table subcontratos drop constraint if exists subcontratos_unidad_tiempo_check;
alter table subcontratos add constraint subcontratos_unidad_tiempo_check check (unidad_tiempo in ('hora','dia'));

alter table subcontrato_eps
  add column if not exists cantidad   numeric(14,2),
  add column if not exists cantidades jsonb,
  add column if not exists costo      bigint;
-- Por precios unitarios lo medido puede pasar del contrato; por tiempo no hay % de avance
alter table subcontrato_eps drop constraint if exists subcontrato_eps_avance_acumulado_check;
alter table subcontrato_eps add constraint subcontrato_eps_avance_acumulado_check
  check (avance_acumulado >= 0 and avance_acumulado <= 999);

-- ─── 4. Parámetros de remuneración ────────────────────────
-- Ingreso mínimo mensual: verificar el valor vigente; se reajusta por ley.
alter table parametros_remuneracion
  add column if not exists ingreso_minimo bigint   not null default 539000,
  add column if not exists dias_laborales smallint not null default 5;
alter table parametros_remuneracion drop constraint if exists parametros_dias_laborales_check;
alter table parametros_remuneracion add constraint parametros_dias_laborales_check check (dias_laborales in (5, 6));

notify pgrst, 'reload schema';

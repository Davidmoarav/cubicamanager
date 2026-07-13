-- ============================================================
-- PRESUPUESTO / MARGEN  (reconstrucción versionada)
-- Columnas de costo y markup que ya existían en la base pero no
-- estaban versionadas en el repo. Idempotente: si ya existen, no hace nada.
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- Costo y markup por partida de proyecto
alter table partidas_proyecto
  add column if not exists costo_unitario bigint default 0;
alter table partidas_proyecto
  add column if not exists markup_pct numeric(6,2);          -- null = usa el markup global del proyecto

-- Markup por defecto a nivel de proyecto
alter table proyectos
  add column if not exists markup_global numeric(6,2) default 20;

-- Porcentajes de gestión del proyecto (usados en estados de pago)
alter table proyectos
  add column if not exists utilidad_pct numeric(6,2) default 0;
alter table proyectos
  add column if not exists gg_pct       numeric(6,2) default 0;
alter table proyectos
  add column if not exists anticipo_pct numeric(6,2) default 0;
alter table proyectos
  add column if not exists monto_contrato bigint default 0;

-- Columnas de gestión en estados de pago (desglose de utilidad, GG, etc.)
alter table estados_pago add column if not exists avance_obra    bigint  default 0;
alter table estados_pago add column if not exists utilidad_pct   numeric default 0;
alter table estados_pago add column if not exists utilidad_monto bigint  default 0;
alter table estados_pago add column if not exists gg_pct         numeric default 0;
alter table estados_pago add column if not exists gg_monto       bigint  default 0;
alter table estados_pago add column if not exists bruto          bigint  default 0;
alter table estados_pago add column if not exists descuentos     bigint  default 0;
alter table estados_pago add column if not exists anticipo_pct   numeric default 0;
alter table estados_pago add column if not exists multas         bigint  default 0;

-- Markup por defecto a nivel de empresa (fallback global)
alter table empresa_config
  add column if not exists markup_default numeric default 20.00;

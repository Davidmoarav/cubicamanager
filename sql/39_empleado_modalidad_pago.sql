-- 39_empleado_modalidad_pago.sql
-- Modalidad de pago del trabajador:
--   'mensual'   → sueldo base mensual (comportamiento actual)
--   'por_metas' → pago por avance/meta (trato). El monto pactado se guarda en
--                 la columna `sueldo` (se reutiliza) y SÍ suma a la nómina mensual.
-- Idempotente: se puede correr varias veces sin error.

alter table empleados
  add column if not exists modalidad text not null default 'mensual';

-- Asegura el check (lo recrea por si ya existía con otra definición)
alter table empleados drop constraint if exists empleados_modalidad_check;
alter table empleados
  add constraint empleados_modalidad_check
  check (modalidad in ('mensual','por_metas'));

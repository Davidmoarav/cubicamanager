-- ============================================================
-- 46 · CARTA GANTT: DÍAS DE TRABAJO DE CADA OBRA
-- Las obras existentes no cambian de fechas: solo se cuentan en días hábiles.
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table proyectos add column if not exists calendario_gantt text not null default 'lun_vie';

alter table proyectos drop constraint if exists proyectos_calendario_gantt_check;
alter table proyectos add constraint proyectos_calendario_gantt_check
  check (calendario_gantt in ('lun_vie', 'lun_sab', 'corridos'));

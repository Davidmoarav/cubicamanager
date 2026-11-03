-- ============================================================
-- 49 · SUELDOS PRIVADOS, PASO 2 DE 2: BLOQUEAR
-- Hasta ahora cualquier miembro podía leer sueldos consultando la base directo,
-- saltándose la app. Desde aquí solo el dueño, administradores y contadores.
--
-- ANTES de ejecutarlo:
--   1. sql/47_sueldos_preparar.sql ejecutado
--   2. SUPABASE_SERVICE_ROLE_KEY configurada en Vercel (Supabase > Settings > API > service_role)
--   3. La app desplegada con el código que usa esa llave
-- Sin los pasos 2 y 3, el jefe de obra deja de ver trabajadores en el parte diario y
-- sus correcciones de horas no reparten los sueldos.
--
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

-- Trabajadores, liquidaciones y parámetros: solo quien ve remuneraciones
do $$
declare t text;
begin
  foreach t in array array['empleados', 'liquidaciones', 'parametros_remuneracion'] loop
    execute format('drop policy if exists acceso_org on %I', t);
    execute format('drop policy if exists acceso_sueldos on %I', t);
    execute format(
      'create policy acceso_sueldos on %I for all using (ve_sueldos(user_id)) with check (ve_sueldos(user_id))', t);
  end loop;
end $$;

-- Gastos de obra: todos los ven, salvo las filas que vienen de una liquidación
drop policy if exists acceso_org on gastos_obra;
drop policy if exists acceso_gastos on gastos_obra;
create policy acceso_gastos on gastos_obra for all
  using (puede_acceder(user_id) and (liquidacion_id is null or ve_sueldos(user_id)))
  with check (puede_acceder(user_id) and (liquidacion_id is null or ve_sueldos(user_id)));

-- La bitácora guarda copias de cada cambio, sueldos incluidos: solo administradores
drop policy if exists auditoria_lectura on auditoria;
create policy auditoria_lectura on auditoria
  for select using (es_admin_org(owner_id));

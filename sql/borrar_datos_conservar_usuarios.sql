-- ============================================================
-- BORRAR TODOS LOS DATOS Y CONSERVAR LOS USUARIOS
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE. Vacía todas las tablas de la app (obras, facturas,
--    empleados, cotizaciones, Filtro DS27, auditoría…) de TODAS las empresas.
--    Se conservan:
--      · auth.*   → las cuentas de login (correo y contraseña)
--      · miembros → quién pertenece a cada empresa y con qué rol (incluye invitaciones)
--      · Si conservar_configuracion = true (por defecto): empresa_config (RUT, razón social,
--        logo, datos bancarios), parametros_remuneracion y ppm_config
--
-- NO es una migración: no se ejecuta en el orden de sql/.
-- ANTES: haz un backup (Supabase > Database > Backups).
-- Ejecutar en Supabase > SQL Editor, primero el PASO 1 solo y después el PASO 2.
-- ============================================================

-- ─── PASO 1: revisar qué se va a vaciar (no borra nada) ────
select c.relname as tabla,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as filas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
   and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')  -- tablas de extensiones
   and c.relname not in ('miembros', 'empresa_config', 'parametros_remuneracion', 'ppm_config')
 order by filas desc, tabla;

-- ============================================================
-- ─── PASO 2: borrar ────────────────────────────────────────
-- Cambia la confirmación a 'BORRAR TODO' y ejecuta este bloque.
-- Todo va en una sola instrucción: si algo falla, no se borra nada.
-- ============================================================

do $$
declare
  confirmacion text := 'escribe aquí: BORRAR TODO';
  conservar_configuracion boolean := true;   -- false = borra también RUT, logo, datos bancarios y parámetros
  conservar text[] := array['miembros'];
  lista text;
begin
  if confirmacion <> 'BORRAR TODO' then
    raise exception 'No se borró nada: cambia la confirmación a BORRAR TODO';
  end if;
  if conservar_configuracion then
    conservar := conservar || array['empresa_config', 'parametros_remuneracion', 'ppm_config'];
  end if;

  select string_agg(format('public.%I', c.relname), ', ')
    into lista
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
     and c.relname <> all (conservar);

  -- TRUNCATE no dispara los triggers por fila (auditoría, bloqueo de sueldos) y reinicia los correlativos.
  -- Sin CASCADE: si una tabla conservada dependiera de una vaciada, falla y no borra nada.
  execute 'truncate table ' || lista || ' restart identity';
  raise notice 'Tablas vaciadas: %', lista;
end $$;

-- ─── PASO 3: archivos (desde el panel, no por SQL) ─────────
-- Supabase no permite borrar archivos de Storage con SQL. Vacía a mano en
-- Supabase > Storage el bucket "proyecto-docs" (documentos y fotos de las obras).
-- Deja "empresa-logos" si conservaste la configuración.

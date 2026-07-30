-- ============================================================
-- 34 · ELIMINAR TODOS LOS DATOS DE UNA EMPRESA (una organización)
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE. Borra TODO lo de un owner_id:
--    proyectos, facturas, empleados, documentos, miembros, etc.
--    NO borra la cuenta de login (auth.users) — eso se hace aparte.
--
-- ANTES: haz un backup (Supabase > Database > Backups) por si acaso.
-- ============================================================

-- ─── PASO 1: identificar el owner_id de la empresa ────────
-- Ejecuta SOLO esta consulta primero y copia el id correcto:

select
  u.id  as owner_id,
  u.email,
  ec.razon_social,
  (select count(*) from proyectos p where p.user_id = u.id) as proyectos,
  (select count(*) from facturas  f where f.user_id = u.id) as facturas,
  (select count(*) from empleados e where e.user_id = u.id) as empleados
from auth.users u
left join empresa_config ec on ec.user_id = u.id
order by u.email;

-- ============================================================
-- ─── PASO 2: borrar. Reemplaza el UUID de abajo y ejecuta ──
-- Todo va dentro de una transacción: si algo falla, no borra nada.
-- ============================================================

do $$
declare
  -- ⬇️⬇️⬇️  PEGA AQUÍ EL owner_id DEL PASO 1  ⬇️⬇️⬇️
  v_owner uuid := '00000000-0000-0000-0000-000000000000';
  -- ⬆️⬆️⬆️  (no dejes el de ceros: no borrará nada)   ⬆️⬆️⬆️
  t text;
  -- Tablas con columna user_id (mismo array de la 25/26).
  -- Se borran las hijas primero; las que dependen por FK caen en cascada.
  tablas text[] := array[
    'estado_pago_detalle','partida_materiales','orden_compra_lineas',
    'gastos_obra','proyeccion_mo','devoluciones',
    'estados_pago','ordenes_compra','partidas_proyecto',
    'liquidaciones','facturas','cotizaciones','contratos',
    'documentos','catalogo_partidas','proveedor_productos',
    'empleados','proveedores','clientes',
    'ppm_config','parametros_remuneracion','empresa_config','proyectos'
  ];
begin
  if v_owner = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Debes reemplazar v_owner por el owner_id real (Paso 1)';
  end if;

  -- Archivos de Storage de la empresa (carpeta = owner_id)
  delete from storage.objects
   where bucket_id in ('proyecto-docs','empresa-logos')
     and (storage.foldername(name))[1] = v_owner::text;

  -- Datos de negocio, tabla por tabla (solo si la tabla existe)
  foreach t in array tablas loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format('delete from %I where user_id = $1', t) using v_owner;
    end if;
  end loop;

  -- Miembros de la organización (invitaciones y accesos)
  delete from miembros where owner_id = v_owner;

  -- Bitácora de auditoría de la organización
  delete from auditoria where owner_id = v_owner;

  raise notice 'Empresa % eliminada correctamente.', v_owner;
end $$;

-- ─── PASO 3 (opcional): eliminar también los logins ───────
-- Esto quita a los USUARIOS de la empresa (se van del sistema).
-- Hazlo solo si de verdad quieres borrar las cuentas, no solo los datos.
--
-- El dueño:
--   delete from auth.users where id = 'PEGA-EL-OWNER-ID';
-- Los miembros ya no aparecen en `miembros` (se borraron arriba); si
-- también quieres eliminar sus cuentas de login, bórralas por email:
--   delete from auth.users where email in ('miembro1@...', 'miembro2@...');

-- ─── Verificación: debe devolver 0 en todo ────────────────
-- select
--   (select count(*) from proyectos where user_id = 'PEGA-EL-OWNER-ID') as proyectos,
--   (select count(*) from facturas  where user_id = 'PEGA-EL-OWNER-ID') as facturas,
--   (select count(*) from miembros  where owner_id = 'PEGA-EL-OWNER-ID') as miembros;

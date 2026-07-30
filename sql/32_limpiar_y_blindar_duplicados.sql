-- ============================================================
-- 32 · LIMPIEZA DE DUPLICADOS + CANDADOS PREVENTIVOS
--
-- ⚠️ Ejecutar DESPUÉS de revisar el resultado del 31.
-- Limpia automáticamente solo los duplicados MECÁNICOS (generados
-- por el propio sistema) y crea índices únicos para que no vuelvan:
--
--   · Liquidaciones repetidas → conserva la MÁS RECIENTE (último recálculo)
--   · Gasto MO duplicado por liquidación → conserva el MÁS RECIENTE
--
-- Lo que representa documentos de negocio (facturas, EP, cotizaciones,
-- OC, clientes) NO se borra automáticamente: queda al final, comentado,
-- para decidir caso a caso.
-- Idempotente.
-- ============================================================

-- ─── 1. Liquidaciones: conservar la más reciente por empleado+período ─
delete from liquidaciones l
 where exists (
   select 1 from liquidaciones l2
    where l2.user_id = l.user_id
      and l2.empleado_id = l.empleado_id
      and l2.periodo = l.periodo
      and (l2.created_at > l.created_at
           or (l2.created_at = l.created_at and l2.id > l.id))
 );

create unique index if not exists uq_liq_empleado_periodo
  on liquidaciones(user_id, empleado_id, periodo);

-- ─── 2. Gastos de MO: uno por liquidación (conserva el más reciente) ─
delete from gastos_obra g
 where g.liquidacion_id is not null
   and exists (
     select 1 from gastos_obra g2
      where g2.liquidacion_id = g.liquidacion_id
        and (g2.created_at > g.created_at
             or (g2.created_at = g.created_at and g2.id > g.id))
   );

create unique index if not exists uq_gasto_liquidacion
  on gastos_obra(liquidacion_id) where liquidacion_id is not null;

-- ─── 3. Candados que solo se crean si NO quedan duplicados ──
-- Si alguno falla con "could not create unique index", hay duplicados
-- de negocio pendientes de resolver a mano (ver 31, detalle).
do $$
begin
  begin
    create unique index if not exists uq_ep_proyecto_numero
      on estados_pago(user_id, proyecto_id, numero);
    raise notice 'OK: candado estados_pago(numero) creado';
  exception when others then
    raise notice 'PENDIENTE: estados_pago tiene números repetidos, resolver a mano (chequeo 3 del 31)';
  end;

  begin
    create unique index if not exists uq_doc_archivo
      on documentos(archivo_path);
    raise notice 'OK: candado documentos(archivo_path) creado';
  exception when others then
    raise notice 'PENDIENTE: documentos apuntando al mismo archivo (chequeo 5 del 31)';
  end;

  begin
    -- Incluye rut_contraparte: dos proveedores pueden repetir folio (ver sql/36)
    create unique index if not exists uq_factura_clave_sii
      on facturas(user_id, tipo, coalesce(doc_tipo,'factura'), numero,
                  coalesce(periodo,''), coalesce(rut_contraparte,''))
      where numero is not null and numero <> '';
    raise notice 'OK: candado facturas(clave SII) creado';
  exception when others then
    raise notice 'PENDIENTE: facturas duplicadas, revisar antes de blindar (chequeo 4 del 31)';
  end;
end $$;

-- ─── 4. Decisiones de negocio (REVISAR ANTES, ejecutar a mano) ──
-- Facturas duplicadas — conservar la más antigua del grupo:
-- delete from facturas f
--  where f.numero is not null and f.numero <> ''
--    and exists (
--      select 1 from facturas f2
--       where f2.user_id = f.user_id and f2.tipo = f.tipo
--         and coalesce(f2.doc_tipo,'factura') = coalesce(f.doc_tipo,'factura')
--         and f2.numero = f.numero
--         and coalesce(f2.periodo,'') = coalesce(f.periodo,'')
--         and (f2.created_at < f.created_at
--              or (f2.created_at = f.created_at and f2.id < f.id))
--    );

-- EP con número repetido — renumerar o eliminar el borrador sobrante a mano.
-- Clientes/proveedores/empleados repetidos — fusionar a mano (tienen FKs).

-- ─── Verificación: repetir el 31; todo debería quedar en 0 ──

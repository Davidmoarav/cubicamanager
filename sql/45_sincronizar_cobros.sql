-- ============================================================
-- 45 · COBROS: ALINEAR FACTURAS CON SUS ESTADOS DE PAGO (OPCIONAL)
--
-- Antes, pagar un estado de pago no marcaba como pagada su factura, y al revés.
-- La app ya los mantiene iguales; esto corrige lo registrado hasta ahora.
-- Cambia los montos de "Cobrado" y "Por cobrar" de esas facturas.
--
-- Primero revisa cuáles cambiarían:
--   select f.numero, f.cliente, f.monto, f.estado, ep.numero as estado_pago, ep.estado as estado_ep
--   from facturas f join estados_pago ep on ep.factura_id = f.id
--   where ep.estado = 'pagado' and f.estado <> 'pagada';
--
-- Idempotente. Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

update facturas f
set estado = 'pagada'
from estados_pago ep
where ep.factura_id = f.id
  and ep.user_id = f.user_id
  and ep.estado = 'pagado'
  and f.estado <> 'pagada';

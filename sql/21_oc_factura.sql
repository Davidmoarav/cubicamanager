-- ============================================================
-- OC → FACTURA (evita doble conteo del gasto)
-- Cuando una OC se asocia a su factura de compra, el gasto de la OC
-- se apaga y cuenta solo la factura (que es el documento definitivo).
-- Ejecutar en Supabase > SQL Editor > Run
-- ============================================================

alter table ordenes_compra
  add column if not exists factura_id uuid references facturas(id) on delete set null;

create index if not exists idx_oc_factura on ordenes_compra(factura_id);

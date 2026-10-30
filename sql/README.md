# Instalación de la base de datos

Ejecutar los archivos **en orden numérico** en Supabase > SQL Editor. Los huecos (18, 19) no existen. Para un entorno nuevo, ejecutar TODOS en orden; los archivos son acumulativos y los últimos corrigen a los primeros.

| Rango | Qué hace | Notas |
|---|---|---|
| 01 | Tablas base (proyectos, empleados, proveedores, contratos, facturas) + RLS por usuario | RLS **reemplazada** por la 25 |
| 02-09 | Cotizaciones, config empresa (+bucket logos), clientes, conversión, documentos (+bucket docs), partidas de proyecto, jerarquía, catálogo | Políticas de Storage de 03 y 06 **reemplazadas** por la 29 |
| 10 | Drift: tablas que existían en la BD pero no en el repo (gastos_obra, ppm_config, etc.) | |
| 11-17 | Finanzas avanzado (previsional, IVA), estados de pago, márgenes, materiales, OC, índices, gasto-OC | |
| 20-24 | Catálogo proveedor, OC-factura, liquidaciones + impuesto único, gasto MO, contrato-proyecto | RLS de 22 **reemplazada** por la 25 |
| **25** | **Organizaciones: miembros, roles, `puede_acceder()`, `resolver_owner()`, reescribe TODA la RLS** | Obligatoria; sin ella el multi-usuario no funciona |
| 26 | Auditoría por triggers (bitácora inmutable por organización) | |
| 27-28 | factura.proyecto_id, partidas 3 niveles | |
| **29** | **Seguridad multi-empresa (Fase 1): membresía única, Storage org-aware, invitación con email confirmado** | Ejecutar SIEMPRE después de la 25 |
| **30** | Parámetros rem. Fase 2: `jornada_semanal`, `tope_afc_uf` | |
| 31-40 | Duplicados, facturas por RUT, Gantt, portal, modalidad de pago, invitaciones | |
| **41** | **Imputación Fase 1: partida en OC y facturas, `parte_diario`, sueldos repartidos, aportes del empleador** | Trae su propia RLS y triggers: no agregar `parte_diario` al array de la 25 (corre antes y la tabla aún no existe) |
| **42** | **Costo real Fase 2: recepción por línea, bodega, subcontratos y equipos** | Igual que la 41: trae su propia RLS y triggers. Registra como recibidas las órdenes que ya estaban en ese estado |

Reglas: nunca ejecutar 25/29 a medias (reescriben políticas); después de agregar una tabla nueva con `user_id`, agregarla al array de la 25 (RLS + trigger) y de la 26 (auditoría) y re-ejecutarlas — son idempotentes.

Requisito de Auth: **Confirm email debe estar ACTIVADO** (Authentication > Providers > Email); las invitaciones dependen de ello.

> Deuda conocida: la BD real tiene columnas que no están en estos archivos (p. ej. `proyectos.moneda`, `proyectos.valor_uf`). Al clonar el entorno, exportar el esquema real (`supabase db dump`) es más fiable que correr los 30 archivos.

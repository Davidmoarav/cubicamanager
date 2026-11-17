# Auditoría ObraManager — obra única, programas SERVIU, evidencias, tratos y rendimiento

**Fecha:** 2026-11-16 · **Base:** commit `1355e82` + cambios sin confirmar del árbol de trabajo
**Alcance pedido:** que la lógica sirva para obras únicas y para obras SERVIU con varias viviendas de beneficiarios, que todo proceso pueda llevar evidencia, que los procesos sean rápidos, y revisar los tipos de trato y contrato (por hora, monto fijo y otros).
**Verificación de lo aplicado:** `tsc --noEmit` sin errores · `vitest` 339/339 (23 archivos, 9 pruebas nuevas). No se ejecutó `next build` ni se probó contra la base real.

---

## 1. Conclusión

La aplicación gestiona bien una obra única. Un programa con viviendas funciona "por convención": cada vivienda es una partida agrupadora, sin entidad propia. Eso alcanzaba para presupuestar, pero producía tres fallas reales (dos corregidas hoy) y deja sin lugar los datos del beneficiario, la recepción por vivienda y la evidencia por vivienda. La mano de obra solo conoce dos formas de pago (mensual y "por metas"), sin pago por hora, por día ni tratos medibles.

| Tema | Estado | Qué se hizo hoy |
|---|---|---|
| Rendimiento del servidor | Corregido en lo principal | Sección 2 |
| Estados de pago en programas con viviendas | **Error corregido** | Sección 3.1 |
| Obras con más de 1.000 partidas | **Error corregido** | Sección 3.2 |
| Evidencia en todos los procesos | Base construida, 4 pantallas conectadas | Sección 4 |
| Vivienda como entidad propia | **Construido** (segunda entrega, mismo día) | Secciones 5 y 9 |
| Tratos y contratos | **Construido en lo principal** (tercera entrega) | Secciones 6 y 10 |

---

## 2. Rendimiento: aplicado

| Dónde | Antes | Ahora |
|---|---|---|
| Toda ruta de escritura (57 rutas) | 3 validaciones de sesión + 2 consultas de membresía antes de empezar | 1 + 1. `createServerSupabase` valida la sesión una vez por petición y `getRolActual` se comparte entre `guardEscritura`, `guardModulo` y `getOwnerId`. Sin tocar las rutas |
| Recalcular avance (cada % que se guarda) | Leía todas las columnas, recorría el árbol en O(n²) y hacía un UPDATE por grupo, uno tras otro | Lee 5 columnas, una pasada, y a lo más un UPDATE por valor de avance, en paralelo (`lib/avance.ts`, `lib/avance-server.ts`) |
| Importar programa | Una consulta por beneficiario + lotes de 100 | Todos los beneficiarios en un lote y las partidas en lotes de 500. Si falla, no queda a medias |
| Aplicar matriz | Un UPDATE por celda en serie; búsqueda lineal por celda | Índice en memoria, solo escribe lo que cambió, de a 25 en paralelo |
| Abrir una obra | Descargaba el código de las 18 pestañas | Cada pestaña se descarga al abrirla (`next/dynamic`); el árbol se arma en una pasada |
| Subir fotos | Foto de 3 a 8 MB tal cual, de a una, preguntando el dueño en cada archivo | Se reduce a 2.000 px JPEG antes de subir, 3 en paralelo, dueño consultado una vez |

Además: `importar-programa` no verificaba que la obra fuera de la organización; ahora sí.

### Rendimiento: pendiente (recomendado)

1. **Middleware:** valida la sesión contra Supabase también en cada llamada a `/api/*`, que la vuelve a validar. Es un viaje extra por petición. Opciones: `getClaims()` (verificación local del JWT, requiere llaves asimétricas en el proyecto) o excluir `/api` del middleware.
2. **26 componentes** cargan con `fetch` en `useEffect` (por ejemplo `DocumentosPanel`): no comparten caché ni evitan recargas. Pasarlos a SWR, como los otros 44.
3. **79 `select('*')`**: en listados grandes (facturas, partidas) pedir solo las columnas que se muestran.
4. **`DocumentosPanel`** tiene su propia copia de la subida y sube de a un archivo: usar `subirVarios`.
5. Mover el recálculo de avance a una función SQL (`rpc`) lo dejaría en una sola consulta; hoy son 2 a 4.

---

## 3. Errores encontrados en el modelo de programas

### 3.1 El estado de pago sugerido salía en $0 para programas importados — corregido
`sugerirEP` valoraba cada raíz como `cantidad × precio` de la raíz. En un programa la raíz es el beneficiario (grupo con cantidad 0 y precio 0), así que cada vivienda aportaba $0, y además ignoraba el tercer nivel. Ahora usa el mismo criterio que el resto del sistema: el valor de un grupo es la suma de sus partidas, a cualquier profundidad. Cubierto por `tests/avance.test.ts`.

### 3.2 Obras de más de 1.000 partidas se truncaban sin aviso — corregido
PostgREST entrega 1.000 filas por consulta. 40 viviendas × 30 partidas ya lo supera: la lista de partidas, el avance de la obra, la matriz y el estado de pago se calculaban con datos incompletos. Las cuatro lecturas ahora van por páginas.

### 3.3 Dos formas distintas de representar una vivienda — pendiente
- **Importar programa (Excel):** vivienda = grupo raíz (`es_grupo`) con sus partidas debajo.
- **Filtro DS27 → obra:** vivienda = una sola partida raíz, unidad `viv`, sin grupo y sin enlace al postulante.

Consecuencias: el selector "estado de pago por beneficiario" (filtra `es_grupo`) no muestra las viviendas que vienen del Filtro; la matriz trata como beneficiario cualquier raíz, incluidos los capítulos de una obra única; y al pasar de postulante a vivienda se pierden RUT, dirección y subsidio.

### 3.4 El estado de pago confía en el cliente — pendiente
`POST /api/estados-pago` dice recalcular en el servidor pero toma `avance_obra` y el detalle tal como llegan. No valida la secuencia de estados y el alcance por vivienda queda solo en las notas. Recomendado: recalcular desde las partidas, y guardar `partida_id` del alcance.

### 3.5 Otros
- `PUT /api/partidas-proyecto` acepta cualquier columna (`...rest`), a diferencia de las rutas con Zod.
- Borrar una obra elimina las filas de documentos pero deja los archivos en Storage.
- La nómina estimada de RRHH usa `sueldo/30/8 × 1,5` para horas extra; la liquidación ya usa el factor legal.
- No existe `proyectos.tipo`: nada distingue una obra única de un programa.

---

## 4. Evidencia en todos los procesos

**Antes:** documentos generales de la obra, fotos del libro de obra, respaldo en prevención y (sin confirmar) comprobante del gasto. Sin evidencia: avance de partida o vivienda, estados de pago, parte diario, recepción de materiales, bodega, equipos, subcontratos, contratos y facturas.

**Construido hoy:**
- `sql/53_evidencias.sql`: un documento puede colgar de cualquier registro (`entidad_tipo` + `entidad_id`), pertenecer a una partida o vivienda (`partida_id`), llevar etapa (antes / durante / después), fecha de la toma y quién lo subió.
- `GET /api/documentos` filtra por registro o por vivienda y entrega los enlaces firmados en un solo viaje (`urls=1`). `POST` verifica que el registro sea de la organización y la partida de la obra.
- `components/Evidencias.tsx`: un componente para todas las pantallas. Cámara, varios archivos, etapas, miniaturas.
  ```tsx
  <Evidencias proyectoId={id} entidadTipo="estado_pago" entidadId={ep.id} />
  ```
- Conectado en: partidas y viviendas (formulario de edición), avance en Terreno, estados de pago, subcontratos.

**Falta conectar** (una línea cada uno, la base ya los admite): parte diario, recepción de órdenes de compra, bodega, uso de equipos, contratos, facturas. **Falta construir:** carpeta de una vivienda (todas sus fotos por etapa) con descarga en PDF o ZIP para entregar a SERVIU o a la entidad patrocinante; evidencia sin conexión en Terreno (hoy necesita señal); ubicación GPS (las columnas existen, no se llenan).

Hasta ejecutar `sql/53`, lo existente sigue igual y las pantallas nuevas avisan qué archivo falta.

---

## 5. Propuesta: obra única y programa con el mismo motor

Mantener el árbol de partidas como motor de costo y avance, y agregar encima lo que hoy no tiene dónde vivir.

1. `proyectos.tipo`: `unica` | `programa`. En programa: llamado o decreto (DS27, DS49, DS10, DS255), código de grupo, entidad patrocinante, resolución, comuna.
2. Tabla `viviendas` (una por beneficiario): nombre, RUT, dirección, rol, subsidio y ahorro en UF, enlace al postulante del Filtro, enlace a su grupo raíz de partidas, estado (`pendiente`, `en ejecución`, `terminada`, `recepcionada`), fecha y acta de recepción.
3. Un solo camino de creación: tanto el Excel como el Filtro crean vivienda + grupo raíz + partidas (tipología aplicada desde la matriz). Migrar las obras ya creadas desde el Filtro.
4. Estado de pago con alcance real: por obra, por vivienda o por conjunto de viviendas terminadas, guardado en columnas.
5. Vistas de programa: tablero de viviendas (avance, estado, fotos por etapa, cobrado) y avance masivo ("partida X al 100% en estas 12 viviendas").
6. La obra única no cambia: sin viviendas, el árbol es de capítulos y partidas como hoy.

Los datos del beneficiario son personales (RUT, dirección): quedan bajo la misma RLS por organización y fuera del portal del cliente.

---

## 6. Tratos y contratos

### 6.1 Qué hay hoy

| Ámbito | Hoy | Falta |
|---|---|---|
| Trabajador | `modalidad`: `mensual` o `por_metas` (un monto fijo en `sueldo`). `contrato_tipo`: indefinido, plazo fijo, obra o faena | Pago por hora y por día; trato medible; mixto |
| Parte diario | Horas por persona, obra y partida. Solo reparte el costo de la liquidación | No genera pago: quien cobra por hora o por día no tiene tarifa |
| Subcontrato | Monto de contrato + estados de pago por % de avance, retención y anticipo | Precios unitarios, por hora o día, administración |
| Contrato con mandante | `tipo` texto libre: suma alzada, serie de precios, administración delegada | No cambia ningún cálculo: el estado de pago siempre se comporta como suma alzada |

"Por metas" hoy es un número escrito a mano: no dice qué se pactó, cuánto se avanzó ni quién lo aprobó, y no pasa por la evidencia.

### 6.2 Modelos de trato a cubrir

| Modelo | Cómo se paga | Dónde se usa |
|---|---|---|
| Sueldo mensual | Monto fijo por mes | Planta, jefes de obra, bodega |
| Por día (jornal) | Valor día × días trabajados | Jornales, ayudantes |
| Por hora | Valor hora × horas del parte diario | Refuerzos, trabajos puntuales, maestros externos |
| Trato por unidad | Precio por m², ml o unidad × cantidad ejecutada y recibida | EIFS, pintura, cerámica, tabiquería |
| Trato a suma alzada por tarea | Monto fijo por una tarea definida, pagado por hitos o al término | Una techumbre, una instalación |
| Trato por vivienda | Monto fijo por vivienda terminada y recibida | Programas SERVIU: es el que calza con el cobro por vivienda |
| Trato de cuadrilla | El trato es del grupo; se reparte por días trabajados, por categoría (maestro, ayudante) o por porcentajes pactados | Cuadrillas de terminaciones |
| Mixto: base + trato | Sueldo base más un bono por producción sobre una meta | Lo más defendible en fiscalización para personal con contrato |
| Honorarios | Monto por servicio con boleta y retención | Especialistas independientes, sin subordinación |
| Subcontrato a suma alzada | % de avance del contrato, con retención y anticipo | Especialidades (ya existe) |
| Subcontrato a precios unitarios | Cantidad ejecutada × precio de cada ítem | Movimiento de tierras, cuando la cantidad no se conoce de antemano |
| Administración (costo + honorario) | Costo comprobado + % o monto fijo | Obras sin proyecto cerrado, reparaciones |
| Llave en mano / con máximo garantizado | Precio cerrado, o costo con tope y reparto del ahorro | Mandantes privados |

### 6.3 Puntos legales a validar con el contador antes de programar
- El trato es una forma legal de remuneración (por pieza, medida u obra), pero con jornada completa el sueldo base no puede ser inferior al ingreso mínimo: por eso "base + trato".
- Quien gana por día o por trato tiene derecho a **semana corrida** (pago del séptimo día según el promedio de lo ganado). Hoy el sistema no la calcula.
- El trato es **imponible**: debe entrar a la liquidación como haber, no como un gasto aparte.
- Contrato **por obra o faena**: indemnización por tiempo servido al término (2,5 días por mes en contratos de un mes o más).
- **Honorarios:** retención de 15,25% en 2026 (sube a 16% en 2027 y 17% en 2028). Si hay horario y dependencia, es relación laboral aunque haya boleta.
- **Subcontratación:** responsabilidad subsidiaria del mandante; conviene exigir el certificado F30-1 antes de pagar cada estado de pago. Es evidencia natural del módulo de subcontratos.

### 6.4 Diseño propuesto
1. `empleados.modalidad`: `mensual` | `diario` | `por_hora` | `trato` | `mixto`, con `valor_dia` y `valor_hora`.
2. Tabla `tratos`: obra, partida o vivienda, tipo (`unidad`, `suma_alzada`, `vivienda`, `por_hora`, `por_dia`), ejecutor (trabajador, cuadrilla o tercero), precio unitario y unidad o monto fijo, cantidad pactada, retención, regla de reparto.
3. Tabla `trato_avances`: fecha, cantidad o %, monto, quién aprobó. Con evidencia (`Evidencias` con `entidadTipo="trato"`). Al aprobarse: gasto real de la partida y haber "trato" en la liquidación del mes (o cuenta por pagar si es boleta o factura).
4. Parte diario con pago: para `por_hora` y `diario`, horas o días × tarifa alimentan la liquidación.
5. Semana corrida y tope de base en `calcularLiquidacion`, con pruebas.
6. `subcontratos.modalidad`: suma alzada | precios unitarios | por hora o día | administración; ítems con cantidad y precio para precios unitarios.
7. `contratos.tipo` como lista cerrada que sí cambie el cálculo del estado de pago (suma alzada por avance; serie de precios por cantidad; administración por costo + honorario).

---

## 7. Orden sugerido

| Fase | Contenido |
|---|---|
| 1 | Ejecutar `sql/53`, probar lo de hoy en una obra real, conectar evidencia en parte diario, recepciones, bodega y equipos |
| 2 | Vivienda como entidad + tipo de obra + unificar Filtro y Excel + estado de pago con alcance real |
| 3 | Tratos: modalidades por hora y día, tabla de tratos y avances, liquidación con trato y semana corrida |
| 4 | Carpeta de vivienda en PDF, tablero de programa, avance masivo, evidencia sin conexión |
| 5 | Middleware, SWR en los 26 componentes, `select` acotados, recálculo en SQL |

---

## 8. Archivos tocados hoy

**Nuevos:** `lib/avance.ts`, `lib/avance-server.ts`, `components/Evidencias.tsx`, `sql/53_evidencias.sql`, `tests/avance.test.ts`, este documento.

**Modificados:** `lib/supabase-server.ts`, `lib/roles.ts`, `lib/validar.ts`, `lib/subir-documento.ts`*, `app/api/documentos/route.ts`, `app/api/estados-pago/route.ts`, `app/api/partidas-proyecto/route.ts`, `app/api/partidas-proyecto/importar-programa/route.ts`, `app/api/partidas-proyecto/aplicar-matriz/route.ts`, `app/(protected)/obra/[id]/page.tsx`, `app/(protected)/terreno/page.tsx`, `components/PartidasPanel.tsx`, `components/SubcontratosPanel.tsx`, `components/PresupuestoPanel.tsx`*.

\* Tenían cambios tuyos sin confirmar (comprobante del gasto): lo de hoy va encima, sin quitar nada.

**Pasos manuales:** ejecutar `sql/53_evidencias.sql` (y `sql/52` si aún no) en Supabase; revisar con `git diff`; probar un estado de pago en una obra con viviendas, porque el monto sugerido cambia respecto de lo que mostraba antes.

---

## 9. Segunda entrega: vivienda como entidad propia

Aprobada la propuesta de la sección 5, quedó construido:

- **`sql/54_viviendas.sql`**: `proyectos.tipo` (`unica` | `programa`) con datos del programa; tabla `viviendas` (beneficiario, RUT, dirección, rol, teléfono, subsidio y ahorro en UF, postulante de origen, estado, fechas de inicio, término y recepción) enlazada a su grupo raíz de partidas; RLS, dueño y auditoría como el resto.
- **Conversión de las obras del Filtro DS27** (dentro de la 54): cada partida suelta `viv` pasa a ser grupo → partida. La partida conserva su id (gastos, horas y avance siguen apuntando a ella) y el detalle de los estados de pago ya emitidos se mueve al grupo, para que no se vuelva a cobrar lo cobrado. Crea la ficha con los datos del postulante.
- **Un solo camino de creación**: Filtro → obra y el Excel de programa crean lo mismo (grupo + partidas + ficha) y marcan la obra como programa. Con esto se cierra la inconsistencia 3.3.
- **`/api/viviendas`**: listar con valor y avance calculados, crear, editar, cambiar estado de varias a la vez, quitar ficha, y convertir en viviendas los grupos raíz de una obra ya existente.
- **Pestaña Viviendas** en la obra (`components/ViviendasPanel.tsx`): resumen por estado, búsqueda por nombre, RUT o dirección, ficha, cambio de estado individual o masivo, y fotos antes / durante / después por vivienda. Solo aparece en programas o en obras con grupos; la obra única no cambia.
- **Estado de pago por varias viviendas**: `sugerir` acepta varios ids separados por coma en `beneficiario_id` (falta el selector múltiple en pantalla).

**Decisiones tomadas:**
- Las obras importadas por Excel **no** se convierten solas: un grupo raíz puede ser una vivienda o un capítulo. Se convierten con el botón "Convertir en viviendas" de la pestaña, obra por obra.
- Quitar una ficha no borra partidas: el grupo queda como grupo normal.
- El alcance del estado de pago no necesitó columnas nuevas: el detalle ya guarda una línea por vivienda.

**No verificado:** la 54 no se ejecutó contra una base real. Antes de correrla en producción conviene un respaldo, porque reestructura partidas y mueve detalle de estados de pago de las obras del Filtro. Dentro del bloque se desactivan los triggers de usuario de `partidas_proyecto`, `viviendas`, `estado_pago_detalle` y `proyectos` (desde el editor SQL no hay usuario y el trigger de dueño dejaría `user_id` en nulo); si el bloque falla, todo se revierte.

**Sigue pendiente de la sección 5:** selector múltiple de viviendas en el estado de pago, avance masivo por partida en varias viviendas, y la carpeta de vivienda en PDF.

**Archivos de esta entrega:** nuevos `sql/54_viviendas.sql`, `app/api/viviendas/route.ts`, `components/ViviendasPanel.tsx`; modificados `lib/validar.ts`, `types/index.ts`, `lib/filtro/proyecto.ts`, `app/api/filtro/proyecto/route.ts`, `app/api/partidas-proyecto/importar-programa/route.ts`, `app/api/estados-pago/route.ts`, `app/(protected)/obra/[id]/page.tsx`, `components/filtro/PasarAProyecto.tsx`, `sql/README.md`, `tests/filtro-proyecto.test.ts`.

**Orden de ejecución en Supabase:** 52 (si falta) → 53 → 54.

---

## 10. Tercera entrega: tratos y formas de pago

**Verificación:** `tsc` sin errores · `vitest` 365/365 (25 pruebas nuevas en `tests/tratos.test.ts`). `sql/55` no se ejecutó contra una base real.

### Qué quedó construido

**Forma de pago del trabajador** (RRHH → editar trabajador):

| Modalidad | Qué se paga en el mes |
|---|---|
| Mensual | Sueldo fijo, como hasta hoy. Si participa en un trato aprobado, se suma |
| Por día | Valor día × días con parte diario + semana corrida |
| Por hora | Valor hora × horas del parte diario + semana corrida |
| A trato | Lo aprobado en sus tratos + semana corrida; si no llega al mínimo garantizado, se completa |
| Mixto | Sueldo base fijo + lo aprobado en sus tratos, con semana corrida sobre el trato |
| Por metas | Se conserva: monto mensual escrito a mano |

**Tratos** (obra → En terreno → Tratos):
- Tipos: por unidad (m², ml, un), suma alzada por tarea, por vivienda, por hora y por día. Enlazados a una partida o vivienda.
- Ejecutor: un trabajador, una cuadrilla o un tercero con boleta de honorarios o factura.
- Reparto en la cuadrilla: partes iguales, porcentajes pactados (deben sumar 100%) o días trabajados en la obra según el parte diario.
- Avances: se registran, se aprueban y se pagan. No dejan pasar de lo pactado. Retención opcional.
- Evidencia: acuerdo firmado en el trato y fotos en cada avance.

**Qué pasa al aprobar un avance:**
- De trabajadores: se fija cuánto le toca a cada uno y entra a la liquidación del mes de la fecha del avance, como haber imponible. Si la liquidación de ese mes ya está pagada, no deja aprobar.
- De un tercero: su bruto queda como gasto de mano de obra de la partida.

**Liquidación:** `calcularLiquidacion` recibe lo variable del mes (base, trato, semana corrida). Trato y semana corrida entran a gratificación, cotizaciones e impuesto. Remuneraciones muestra bajo cada nombre de dónde sale la base (días, horas, trato, semana corrida) y marca "Datos cambiaron" cuando se aprueba un trato después de guardar.

**Costo de la obra sin duplicar:** el trato de un trabajador no genera gasto propio; su costo llega por la liquidación. La parte del costo que viene de tratos (con sus aportes del empleador) se imputa a la partida de cada trato, y el resto se reparte por horas del parte diario como antes.

### Decisiones tomadas (revisar)
1. **Semana corrida:** por cada semana, promedio de lo ganado en los días hábiles × domingos y festivos de esa semana. Semana de lunes a viernes. Una semana partida entre dos meses usa en cada mes solo sus días, lo que puede diferir levemente del cálculo semanal estricto. **Validar con el contador antes de pagar con este número.**
2. **Mensual con trato:** el trato se suma como producción, sin semana corrida.
3. **A trato:** el campo sueldo pasa a ser el mínimo garantizado del mes. Debe cargarse al menos el ingreso mínimo; el sistema no lo exige.
4. **El jefe de obra ve cuánto le toca a cada trabajador en un trato.** Es coherente con que él los pacta, pero es una excepción a la regla de que no ve sueldos.
5. **Mes del trato:** manda la fecha del avance, no la de aprobación.

### No incluido
- **Subcontrato a precios unitarios o por hora:** se cubre hoy con un trato de tercero (por unidad, hora o día). El módulo de Subcontratos sigue siendo suma alzada por % de avance.
- **`contratos.tipo` con efecto en el estado de pago** (serie de precios, administración): sin cambios.
- **Proyección de mano de obra, consolidado y nómina estimada de RRHH** usan el sueldo fijo: a quien gana por día o por hora lo cuentan en cero. Su monto real está en Remuneraciones.
- **Retención de honorarios:** la retención del trato es la garantía pactada, no el impuesto de la boleta.
- **Horas extra de quien gana por hora o por día:** se calculan con el factor legal sobre la base del mes; conviene revisarlo con un caso real.
- **Días de la semana laboral:** fijo en lunes a viernes para la semana corrida, aunque la obra use otro calendario en la Gantt.

### Archivos de esta entrega
Nuevos: `sql/55_tratos.sql`, `lib/tratos.ts`, `lib/tratos-server.ts`, `app/api/tratos/route.ts`, `app/api/tratos/avances/route.ts`, `components/TratosPanel.tsx`, `tests/tratos.test.ts`.
Modificados: `types/finanzas.ts`, `types/index.ts`, `lib/validar.ts`, `lib/imputacion-sueldos.ts`, `app/api/remuneraciones/route.ts`, `app/(protected)/remuneraciones/page.tsx`, `app/(protected)/rrhh/page.tsx`, `app/(protected)/obra/[id]/page.tsx`, `sql/README.md`.

**Orden de ejecución en Supabase:** 52 (si falta) → 53 → 54 → 55.

---

## 11. Cuarta entrega: pendientes cerrados (2026-11-17)

**Verificación:** `tsc` sin errores · `vitest` 384/384 (25 archivos; 19 pruebas nuevas en `tests/estado-pago.test.ts`, `tests/fase2.test.ts` y `tests/tratos.test.ts`). **No se ejecutó `next build`** (el entorno de prueba no tiene el compilador de Next para Linux) ni se probó contra la base real.

### Error grave encontrado y corregido
**Guardar el avance o las notas de una partida le borraba la cantidad y el precio.** El `PUT /api/partidas-proyecto` de la versión confirmada (`1355e82`) siempre escribía `cantidad = 1` y `precio_unitario = 0` cuando no venían en el pedido, y la barra de avance del panel Partidas y las notas mandan solo `avance` o `notas`. Ahora el PUT es parcial y con lista blanca. **Revisar en la base:** partidas con `cantidad = 1` y `precio_unitario = 0` que no sean grupos pueden ser víctimas de esto; sus valores correctos están en la bitácora de auditoría (sql/26).

También: el `POST` de partidas descartaba `es_grupo` y los costos de material y mano de obra; ahora los guarda.

### Estado de pago al mandante
- **Modalidad del contrato** en la ficha de la obra: suma alzada, serie de precios unitarios o administración (costo + honorario %). Un contrato enlazado a la obra le pasa su tipo. No se puede cambiar con estados de pago vigentes.
- **Lo ya cobrado se lleva en pesos**, no en %: cobrar menos de lo sugerido deja el saldo para el siguiente.
- **Serie de precios:** una línea por partida; se indica la cantidad medida acumulada, que puede pasar de la presupuestada.
- **Administración:** costo real de la obra no rendido antes + honorario.
- **Recalculado en el servidor:** el navegador solo indica montos o cantidades; el servidor los valida contra el avance real.
- **Alcance:** obra completa, una vivienda o varias, con atajo "terminadas y recepcionadas". Queda guardado en `estados_pago.alcance`.
- **Criterio cambiado:** un borrador **sí** descuenta lo cobrado (antes no), para que dos borradores no cobren el mismo avance.
- **Pasos válidos:** borrador → presentado → aprobado → pagado (con retrocesos de a un paso; rechazado → borrador). Solo se factura lo aprobado. No se elimina un estado pagado o facturado.

### Subcontratos
Modalidades: suma alzada (como antes), precios unitarios (ítems; se paga la cantidad medida acumulada), por hora o día (tarifa × tiempo del período) y administración (costo rendido + honorario). Con estados de pago emitidos no se cambia la modalidad, la tarifa ni el precio de un ítem; se pueden agregar ítems.

### Remuneraciones
- Parámetros nuevos: **ingreso mínimo** (por defecto $539.000, enero 2026; **verificar el vigente**) y **días de trabajo por semana** (5 o 6), que usa la semana corrida.
- A trato: el piso del mes es el mayor entre el mínimo pactado y el ingreso mínimo.
- Proyección de mano de obra y nómina de RRHH estiman el mes de quien gana por día, por hora o a trato. La nómina de RRHH ya no usa $14.000 fijos por hora extra.
- El consolidado ya usaba las liquidaciones reales: no necesitó cambios.

### Viviendas
- **Avance masivo:** marcar viviendas → "Registrar avance" → una partida (o todas) al %. Una vivienda que llega a 100% queda terminada.
- **Carpeta PDF por vivienda:** ficha del beneficiario, partidas con avance y fotos por etapa (antes / durante / después), con fecha. Las fotos van incrustadas (JPEG y PNG); los demás archivos se listan.

### Evidencias
- Conectadas además en: parte diario (fotos del día), recepciones de órdenes de compra, movimientos de bodega, usos de equipos, contratos y facturas.
- Contratos, facturas y recepciones pueden llevar respaldo aunque no tengan obra. El contador puede adjuntar el documento de una factura.
- Documentos de la obra: subida de varios archivos a la vez, con las fotos achicadas.
- **Ubicación:** las fotos tomadas con la cámara guardan latitud y longitud si el teléfono lo permite. Para eso se cambió `Permissions-Policy` a `geolocation=(self)`.

### Seguridad y rendimiento
- Borrar una obra borra también sus archivos del almacenamiento.
- El middleware ya no valida la sesión en `/api/*` (cada ruta la valida y responde 401): un viaje menos por llamada.

### Sigue pendiente
- 26 componentes que cargan con `fetch` en `useEffect` en vez de SWR, y `select('*')` en listados grandes.
- Recálculo de avance como función SQL.
- Evidencia sin conexión en Terreno (hoy las fotos necesitan señal).
- `EstadoPagoPDF` muestra serie de precios como % sobre lo presupuestado, sin las cantidades.
- Administración: para el jefe de obra, el costo real excluye sueldos reservados (menos de 3 personas), así que puede rendir de menos; conviene que el estado de pago por administración lo emita el administrador.

**Archivos de esta entrega:** nuevos `lib/estado-pago.ts`, `lib/evidencia-ids.ts`, `lib/carpeta-vivienda.tsx`, `components/obra/CarpetaViviendaPDF.tsx`, `sql/56_contratos_y_parametros.sql`, `tests/estado-pago.test.ts`. Modificados, entre otros: `app/api/estados-pago`, `app/api/partidas-proyecto`, `app/api/subcontratos` (+ `/ep`), `app/api/documentos`, `app/api/viviendas`, `app/api/proyectos`, `app/api/contratos`, `app/api/parametros-rem`, `app/api/proyeccion-mo`, `middleware.ts`, `next.config.ts`, y los paneles de presupuesto, subcontratos, viviendas, documentos, parte diario, bodega, equipos, recepciones, contratos, facturación, RRHH y remuneraciones.

**Orden de ejecución en Supabase:** 52 (si falta) → 53 → 54 → 55 → 56.

---

## 12. Quinta entrega (2026-11-17, tarde)

**Verificación:** `tsc` sin errores · `vitest` 386/386 (26 archivos) · **`next build` exitoso** (93 páginas, chequeo de tipos activo). El build se hizo sobre una copia del repositorio en el entorno de prueba, con la fuente de Google reemplazada solo en esa copia porque ese entorno no tiene acceso a Google Fonts; la única advertencia es la conocida de supabase-js en Edge Runtime. No se probó contra la base real ni en el navegador.

### Fotos sin conexión en Terreno
- Si al subir una foto o respaldo no hay señal, queda guardada en el teléfono (IndexedDB, ya achicada) y se sube sola al volver la conexión, junto con el resto de la cola de Terreno.
- El aviso de Terreno muestra cuántas fotos faltan por subir, con botón "Subir ahora".
- Cada foto recuerda la cuenta que la tomó: con otra cuenta abierta no se sube.
- Si el servidor la rechaza (por ejemplo, el registro se borró), queda a la vista con el motivo y se puede descartar.
- Archivo nuevo `lib/fotos-pendientes.ts`; prueba en `tests/fotos-pendientes.test.ts`.

### Estado de pago
- El PDF muestra, en serie de precios, la cantidad medida × precio de cada partida; en administración, "costo rendido" y la línea del honorario.
- El estado de pago por administración solo lo emite el administrador (el jefe de obra no ve todos los sueldos y rendiría de menos): los demás reciben un aviso claro.

### Carga con caché (SWR)
Las pestañas de la obra que pedían todo de nuevo cada vez ahora usan caché compartida: Gastos y cobros, Partidas y avance, Documentos, Mano de obra e Informe. Las listas de partidas, estados de pago y gastos se piden una vez y las comparten la página de la obra y sus pestañas; volver a una pestaña es inmediato y se actualiza en segundo plano.

Los demás componentes señalados antes ya usaban SWR para leer; sus `fetch` restantes son para guardar, y así deben quedar.

### No se hizo, a propósito
- **Acotar `select('*')`:** cada listado usa muchas columnas en pantalla y quitar alguna dejaría campos en blanco sin aviso; no vale el riesgo sin probar cada pantalla.
- **Recálculo de avance en SQL:** el cálculo actual ya hace 2 a 4 consultas por cambio; pasarlo a una función de Postgres no se puede verificar desde aquí y no cambia la experiencia de forma visible.

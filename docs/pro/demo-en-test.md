# Empresa de ejemplo de Pro en test

**Estado (2026-11-28): preparada, pendiente de cargar en test.** El script y la opción del workflow están listos y se probaron en la base local. Para cargarla en test falta crear el secreto `PRO_DEMO_TEST_PASSWORD` en el entorno **test** de GitHub (vea «Cómo cargarla»).

## Qué es

Es una cuenta ficticia de demostración, separada de su cuenta: **Constructora Ejemplo Valle Central**. Tiene Pro activo y datos de ejemplo en cada sección del estilo Houzz Pro.

- **Todo es inventado.** Cada nombre lleva «(Ejemplo)».
- **No se envía nada.** Los correos son `@example.com` y no hay teléfonos. Tampoco se crean avisos, recordatorios, correos ni mensajes.
- **No hay fotos.** Solo se crearon carpetas, sin imágenes.
- **No aparece en la búsqueda pública.** La ficha profesional que Pro necesita está oculta del buscador, no disponible, con la agenda privada y la verificación pendiente.

## Cómo entrar

1. Abra https://test.contratacr.com/login.
2. Use el correo `demo-pro@contratacr.test` y la contraseña que está en el archivo local `/Users/contratacr/dl/secrets/pro-demo-test.env`. Ese archivo solo se puede leer desde esta Mac.
3. Vaya a https://test.contratacr.com/dashboard/pro.

Los proyectos tienen ruta propia: `https://test.contratacr.com/dashboard/pro/trabajo/ejemplo-pN/<vista>`, donde N va de 1 a 7.

| Proyecto | Cliente | Estado |
|---|---|---|
| p1 Remodelación de cocina y baño | Familia Rojas Vargas | Agendado (el más completo) |
| p2 Terraza techada de 32 m² | Mariana Solís Chaves | Agendado |
| p3 Adecuación de local comercial | Café La Montaña S.A. | Cotizando |
| p4 Mantenimiento de áreas comunes | Condominio Vista Real | Terminado |
| p5 Construcción de casa de 140 m² | Andrés Mora Jiménez | Agendado (el más completo) |
| p6 Pisos porcelanato y pintura | Laura Quesada Brenes | Nuevo |
| p7 Adecuación de consultorio dental | Clínica Dental Sonrisa | Cotizando |

## Secciones y qué datos tienen

| Sección (Houzz) | Dónde verla en test | Datos de ejemplo |
|---|---|---|
| Solicitudes (Leads) y etapas | `/dashboard/pro?tab=pro_leads` | 10 solicitudes repartidas en Nueva, Seguimiento, Contactada, Reunión agendada, Cotización enviada y Ganada. Cada una tiene responsable, fecha estimada de cierre, origen (incluido el canal propio «Feria de construcción»), etiquetas, notas y una llamada. Además: 3 seguimientos, 1 pospuesta y 1 perdida por precio. |
| Clientes y campos propios | `?tab=pro_clients` («Organizar clientes» para campos y etiquetas) | 8 clientes, uno archivado. 4 campos propios: cómo nos conoció, presupuesto, fecha preferida y horario de visitas. Tienen valores, etiquetas y correos adicionales. |
| Proveedores y subcontratistas | `?tab=pro_company&empresa=proveedores` | Proveedores y subcontratistas ficticios, sin teléfono ni cédula. |
| Proyectos | `?tab=pro_projects` | 7 proyectos con color, tipo, código EJ-2026-00x, presupuesto, etiquetas y estados propios. p1 y p5 están fijados arriba. |
| Detalles y notas del proyecto | `/trabajo/ejemplo-p1/details` y `/notes` | Dirección, IVA, presupuesto. 9 notas y llamadas, 3 de ellas fijadas. |
| Cronograma | `/trabajo/ejemplo-p1/schedule` (también p2 y p5) | 9 fases, 16 tareas planificadas con 15 dependencias, 7 hitos. Hay líneas base en p1 y p5; en p1 una tarea está 2 días atrasada frente a la línea base. |
| Tareas y pendientes finales | `/trabajo/ejemplo-p1/tasks` y `?tab=pro_tasks` | 19 tareas con responsable, fecha límite y etiquetas, 5 completadas. 3 pendientes finales en p1. |
| Bitácora diaria y avances | `/trabajo/ejemplo-p1/updates` (también p5) | 6 bitácoras con clima, resumen, cuadrilla y horas, todas privadas. 4 avances. |
| Archivos | `?tab=pro_files` y `/trabajo/ejemplo-p1/files` | Solo carpetas: 5 de la empresa y 8 de proyectos. Sin archivos ni fotos. |
| Selecciones y asignaciones | `/trabajo/ejemplo-p1/selections` y `/allowances` | 2 áreas (Cocina y Baño principal), 5 artículos y 12 opciones con costo, margen, presupuesto por área y seguimiento de pedido. 4 asignaciones; la del sobre de cocina está decidida. |
| Tableros de ideas | `/trabajo/ejemplo-p1/moodboards` y `/trabajo/ejemplo-p6/moodboards` | 2 tableros con 3 páginas, hechos de texto, muestras de color, notas y un artículo del catálogo. |
| Plano 3D | `/trabajo/ejemplo-p1/takeoffs` | Plano de cocina y baño con 7 paredes, puertas, ventanas, medidas y muebles. |
| Cotizaciones | `?tab=pro_tools` (cotizaciones) | 7 cotizaciones: 4 aceptadas, 2 borradores y 1 rechazada. |
| Contratos | `/trabajo/ejemplo-p1/contracts` (también p5); plantillas en `?tab=pro_company&empresa=plantillas` | Borradores de contrato hechos con plantilla y cláusulas. No se compartieron ni se enviaron a firma. |
| Órdenes de cambio | `/trabajo/ejemplo-p1/changes` (también p2 y p5) | 3 órdenes: 1 aceptada, 1 propuesta y 1 deductiva. |
| Facturas y pagos | `/trabajo/ejemplo-p1/invoices` y `?tab=pro_billing` / `?tab=pro_payments` | 5 borradores de factura no fiscal, con pagos y anticipos aplicados. p5 tiene un plan de 4 cuotas. |
| Créditos y anticipos | `/trabajo/ejemplo-p5/credits` (también p1) | Un anticipo de ₡5 000 000 recibido por SINPE y una nota de crédito de ₡120 000 aplicada. |
| Gastos y costos | `?tab=pro_expenses` y `/trabajo/ejemplo-p5/costs` | Gastos con proveedor, IVA y marca de facturable, un gasto general, pagos y una cuenta por pagar. |
| Horas | `/trabajo/ejemplo-p1/time` (también p5) y `?tab=pro_hours` | 3 actividades con tarifa y 10 registros de horas. |
| Catálogo | `?tab=pro_inventory` y `?tab=pro_company&empresa=articulos` | 8 materiales con existencias y movimientos y 3 servicios. Incluyen especificaciones, precios, proveedor preferido y 6 categorías. |
| Órdenes de compra | `/trabajo/ejemplo-p1/budget` y `/trabajo/ejemplo-p5/budget` | 3 órdenes: 1 recibida y pagada, 1 parcial con seguimiento de envío y 1 borrador. No se enviaron a ningún proveedor. |
| Licitaciones | `/trabajo/ejemplo-p5/bids` (también p1) | Licitación adjudicada en p5 con 2 ofertas anotadas a mano. Borrador en p1. |
| Plantillas | `?tab=pro_company&empresa=plantillas` | 2 plantillas de cronograma, 2 de tareas, cláusulas y plantillas de contrato y 2 paquetes de servicio. 3 plantillas de correo guardadas, que nunca se envían. |
| Equipo | `/dashboard/pro/equipo` | 4 roles personalizados. |
| Informes | `?tab=statistics` | 9 informes guardados: financiero, ingresos, flujo de caja, pagos, IVA, cuentas por pagar, clientes, trabajos y horas por proyecto. |

## Qué no tiene, y por qué

- **Miembros del equipo.** El sistema exige que cada miembro sea una cuenta real, y no se crean cuentas para personas reales. Por eso tampoco hay gerentes asignados en los proyectos ni cuadrilla con nombre.
- **Selecciones aprobadas o rechazadas.** Solo las puede decidir un cliente vinculado, y la demo no tiene cliente real.
- **Mediciones sobre planos (takeoffs).** Necesitan subir un plano en imagen. Por la regla de solo fotos reales, no se subió ninguno.
- **Facturas emitidas.** Pasar de borrador a emitida implica enviarla o mandarla a Hacienda, y eso no se hace.
- **Firma electrónica, enlaces de pago y mensajes al cliente.** Todos envían algo, así que no se crearon.

## Cómo cargarla o repetirla

1. Cree el secreto `PRO_DEMO_TEST_PASSWORD` en GitHub, en Settings › Environments › test, con la contraseña del archivo local. Por ejemplo: `grep '^PRO_DEMO_TEST_PASSWORD=' /Users/contratacr/dl/secrets/pro-demo-test.env | cut -d= -f2- | tr -d '\n' | gh secret set PRO_DEMO_TEST_PASSWORD --env test`.
2. Corra el workflow «Supabase migrations» desde la rama `test`, con `target=test` y `pro_demo=true`.
   - Primero con `dry_run=true`: solo cuenta.
   - Después con `dry_run=false`: escribe.
3. Repetirlo es seguro: no duplica nada.

El script es `scripts/pro/demo/seed-pro-demo.mjs`. Rechaza producción, cualquier rama que no sea `test` y cualquier proyecto que no sea el de test.

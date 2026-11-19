# Houzz Pro: estructura observada en la sesión de Isaac — 2026-11-10

Fuente: Safari de Isaac (cuenta de prueba con «Sample Project from Houzz»), leído con capturas de pantalla y el árbol de accesibilidad de macOS. Solo lectura. No se guardó, envió, compartió ni editó nada en Houzz. Se abrieron pestañas temporales y se cerraron después.

## Navegación global (barra izquierda)

Search · **Projects** · **Leads** · **Company** · Free Trial. Abajo: bandeja de mensajes, notificaciones, cronómetro (Time), ayuda y ajustes.

- **Projects** (`/manage/projects`): lista o tablero con búsqueda, filtros Status / Tags / Managers, columnas Project Name, Client Name, Viewed, Created y Location, y un botón «Create Project».
- **Leads** (`/manage/leads`): bandejas con contadores. Active Leads: New, Followed Up, Connected, Meeting Scheduled, Estimate Sent, Won. Inactive Leads: Snoozed, Archived (spam). Imported Leads: Lead Import History. Botones Contact Form, Insights y «Add Leads»; filtros por tipo de proyecto, fuente y responsable; columnas Lead Name, Stage (editable en línea) y Client. Entradas: Create Lead, Import from File, Contact Form y Zapier.
- **Company** (`/settings/contacts`):
  - Collaborators: Contacts, Vendors.
  - Library: Company Files, Templates, Categories, My Items, Catalogs.
  - Marketing: Houzz Profile, Contact Form, Website, Email Marketing, Marketing Insights.
  - Contacts tiene Account Name, Contact Name, Email, filtro Type: Active, Actions y «Add Contact».

## Proyecto (`/manage/projects/{id}/overview`): el centro del producto

Menú propio del proyecto, con accesos directos a ajustes, mensajes y notas:

- **Planning:** Contracts🔒, Estimates, Takeoffs, 3D Floor Plans, Mood Boards, Selection Boards, Selections Tracker, Bids🔒.
- **Management:** Files & Photos, Schedule, Tasks & Punchlist, Client Dashboard, Daily Logs🔒, Time, Expenses.
- **Finance:** Invoices, Purchase Orders, Change Orders, Credits & Retainers, Budget🔒.

🔒 = bloqueado en el plan de prueba.

El resumen tiene tres columnas:

1. **Widgets de trabajo:** Estimates (Create with AI), Upcoming con filtro Today / This Week, Files & Photos, Tasks & Punchlist (pestañas), Financial Documents, planos, cronograma con rangos de fechas, Mood Board y Project Activities (beta: registro de acciones con enlaces).
2. **Contexto:** estado del proyecto (Open), Project Location, Client Details («Add a Client»), Collaborators (Managers, Team, Subcontractors), Dashboards (Client Dashboard, «Not Shared»), Meetings y Tags.
3. **Promoción:** Product Clipper.

## Client Dashboard (`/manage/cd/client-dash-edit/{id}/home`)

- Encabezado: «Help Center», «Preview» y «Add Client ▾».
- Menú: Home, Messages, Financials, Online Payment Records, Selection Boards, Mood Boards, 3D Floor Plans, Tasks & Punchlist, Schedule, Files & Photos.
- Tarjeta de empresa: logotipo, nombre, correo y teléfono, con un ícono de información para ocultar datos.
- Bloques: Messages (redactor con To/Cc, asunto predeterminado y formato), Financial Documents, Selection Boards (1), Mood Boards, 3D Floor Plans (1), Tasks & Punchlist, Schedule y Files & Photos, cada uno con su estado vacío «No … shared yet».
- Botón «Add a Widget».

## Consecuencia para ContrataCR

Houzz Pro es software de gestión del negocio, separado del directorio público. El Client Dashboard es lo que **el profesional prepara dentro de Pro** para su propio cliente.

En ContrataCR, Pro vive aparte en `/dashboard/pro` (`ProSpace` + `ProManagementShell`). Pero su eje es **«Citas y trabajos»**, no **Proyectos**: el expediente de trabajo (`JobWorkspace`) se abre desde la agenda, con pestañas Resumen / Tareas / Avances / Costos / Cambios / Constancia / Vista del cliente. Ver el plan de equivalencia en `client-dashboard-local.md` y el registro `houzz-parity-register-local.md`.

## Recorrido en Chrome (2026-11-11), solo lectura

Fuente: Chrome de Isaac con la extensión conectada. Se navegaron listados sin crear, guardar ni enviar nada. Lo que sigue son notas funcionales redactadas por el equipo, no texto de Houzz.

- **Selecciones:**
  - Conmutador entre Tablero y Seguimiento.
  - Cada tablero tiene un presupuesto (gastado frente a previsto, editable), búsqueda, orden personalizado y filtro por responsable.
  - Las tarjetas muestran nombre, contadores por estado (pendiente, rechazado, aprobado), total y presupuesto.
  - Dentro de un tablero se agregan bloques de inspiración, producto, plano 3D, marcador de posición o imagen.
  - El panel lateral tiene fuentes: mis artículos, catálogos de marcas, colores de pintura, plantillas, planos, tableros de ideas, imágenes y archivos.
  - Acciones del tablero: convertir (a documento), compartir y vista previa.
- **Seguimiento de selecciones:** tabla configurable con vistas guardadas por pestaña (Planificación, Finanzas, Compras, Todas). Columnas:
  - artículo (imagen, título, enlace, aprobación), descripción, estado y avance del documento;
  - área, categoría, proveedor o subcontratista;
  - costo unitario, margen, ganancia por unidad, precio de venta, precio de lista, ahorro del cliente, cantidad, total, unidad, impuesto y envío;
  - especificaciones (materiales, medidas, color, fabricante, SKU);
  - seguimiento del pedido: estado, fechas de pedido, envío estimado y real, recepción, entrega e instalación, dirección, plazo, número de pedido, guía, transportista y quién pidió;
  - responsable y notas.
  - Se puede organizar por campo y filtrar.
- **Órdenes de compra:**
  - Totales arriba: total, pagado y saldo.
  - Filtros: rango de fechas, tipo activo, estado, vencidas, proveedor o subcontratista, seguimiento.
  - Columnas: título, destinatario, código, estado, compartida, creada, total, saldo, vence, documentos vinculados, seguimiento, enviada, actualizada y fecha de aprobación.
- **Facturas:** los mismos totales y filtros que órdenes de compra, con columnas equivalentes. La facturación propia de ContrataCR sigue siendo borrador no fiscal.
- **Cronograma:**
  - Gantt por fases con tareas, barras, dependencias y duración en días.
  - Línea base, «Hoy», ajustar a la vista y escala por días.
  - Filtros por responsable, por tipo de elemento y por tareas.
  - Modo en vivo, compartir y agregar elemento. Vistas de Gantt, calendario y lista.
- **Tareas y lista de pendientes finales (punchlist):**
  - Contador de completadas, con pestañas Tareas y Pendientes finales.
  - Orden por fecha límite; filtros por estado, etiquetas, responsables y creador.
  - Columnas: título, responsables, fecha límite, estado, etiquetas y fase o tarea del cronograma vinculada.
- **Horas:**
  - Actividades con tarifas.
  - Crear factura desde horas.
  - Columnas: quién reportó, fecha, actividad, descripción, horas, margen, tarifa, total, facturable, gravable, factura y archivos.
- **Gastos:**
  - Totales arriba: facturable, facturado y costo no facturable.
  - Filtro por proveedor y crear factura.
  - Columnas: quién reportó, fecha, servicio, descripción, costo, origen, facturable, gravable, medio de pago, número de referencia, proveedor, factura y archivos.
- **Bloqueadas en el plan de prueba:** Contratos, Licitaciones, Bitácora diaria y Presupuesto. Se usa la ayuda pública como referencia.

## Segundo recorrido en Chrome (2026-11-11), solo lectura

Notas funcionales redactadas por el equipo. No se creó, guardó ni envió nada.

- **Tableros de ideas (Mood Boards):**
  - Lienzo con páginas múltiples (miniaturas abajo y «+» para agregar página), nombre de página y tamaño de lienzo.
  - Herramientas: seleccionar, mover el lienzo, texto, dibujo libre, flecha y borrador; fondo de color; deshacer; zoom y ajustar a la pantalla.
  - Inserción de producto, muestra de color o material, plano o imagen.
  - Panel de fuentes: mis artículos, catálogos de marcas, colores de pintura, categorías de productos, tableros guardados, imágenes y planos 3D.
  - Acciones: comentarios del cliente, presentar (pantalla completa), descargar, imprimir y compartir. Migas de pan Proyecto › Habitación › Tablero.
- **Mediciones sobre planos (Takeoffs):**
  - Lista de planos del proyecto (título, fecha de carga, tipo, tamaño, vínculo) con «Subir planos».
  - Visor por páginas con miniaturas y búsqueda.
  - Herramientas: área, longitud y conteo, con color y grosor; escala calibrada por página (p. ej. 1/4" = 1').
  - Panel «Mediciones» agrupado por categoría (ventanas, electricidad, pisos, pintura, etc.). Cada medición tiene nombre, resultado, un multiplicador opcional (altura de pared: longitud × altura → área) y total, con ojo para ocultarla.
  - «Revisar y cotizar» convierte las mediciones en partidas de cotización; también se puede guardar en archivos.
- **Créditos y anticipos:**
  - Pestañas: anticipos, notas de crédito, sobrepagos y reembolsos.
  - Totales: anticipo disponible, aplicado y total. Filtro por estado.
  - Columnas: título, código, estado, creado, total, saldo, destinatario y disponible.
- **Órdenes de cambio:**
  - Totales: total, pagos sin aplicar, facturado y saldo.
  - Filtros: fecha, tipo, estado y vencidas.
  - Columnas: las mismas de cotizaciones y facturas (destinatario, código, compartida, vence, documentos vinculados, enviada, actualizada y fecha de aprobación).
- **Cotizaciones del proyecto:** cuatro formas de empezar: con IA, importar desde archivo, desde cero o desde plantilla. Las columnas son las de órdenes de cambio, con un total cotizado.
- **Notas del proyecto:** bitácora privada con filtros «Todas», «Notas» y «Llamadas», y redactor con fecha y hora.
- **Detalles del proyecto:**
  - Proyecto y cliente: nombre, estado, color, tipo, código, presupuesto y etiquetas; dirección principal y direcciones predeterminadas de facturación y envío.
  - Configuración del proyecto: impuesto predeterminado y actividades con tarifa de costo, margen, tarifa facturable, gravable y facturable.

### Brechas resultantes (estado F/P en el registro)

| Fila | Función | Plan local |
|---|---|---|
| 66 | Mediciones sobre planos | Visor de imagen o PDF con escala por página; área, longitud y conteo; grupos; multiplicador; enviar a cotización |
| 61 | Tableros de ideas | Lienzo por páginas con imágenes, artículos, muestras y texto; presentar; compartir en la vista del cliente |
| 50 | Créditos y anticipos | Anticipos, notas de crédito, sobrepagos y reembolsos no fiscales, aplicables a borradores de factura |
| 40 | Constructor de contratos | Plantillas con cláusulas y campos combinables; aceptación autenticada (sin firma legal, fila 41 E) |
| 53 | Licitaciones privadas | Solicitud de ofertas por partidas a proveedores del directorio; comparación y adjudicación a orden de compra |
| — | Notas y llamadas del proyecto | Bitácora privada por proyecto |
| — | Detalles del proyecto | Color, tipo, código, etiquetas, direcciones y defaults de impuesto y actividades |
| 30 | Versiones y comentarios por documento | Versiones de archivo con comentarios |

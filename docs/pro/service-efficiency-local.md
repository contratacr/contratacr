# Eficiencia del servicio, sin enfoque de venta del plan

3 noviembre 2026. Solo checkout Pro, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo previo. El objetivo es mejorar ContrataCR para su uso diario; esta entrega no prepara una venta de suscripciones ni agrega módulos fiscales. Sin push, branches/worktrees, producción, emisiones ni mensajes reales.

## Alcance

- Mi día destaca hasta tres solicitudes reales por responder mediante una consulta acotada independiente. No descarga el workspace ni presenta ese número como total global. La agenda del día permanece utilizable aunque esa consulta tarde o falle; CTA abre Trabajos con filtro pendiente.
- Las solicitudes del profesional distinguen revisar/responder, esperar aceptación, preparar visita y finalizadas/cerradas. Son indicaciones sobre el estado real, no envíos automáticos ni transiciones nuevas.
- La ficha del trabajo presenta cliente, estado, horario, siguiente paso y acceso a cliente/cotización antes de herramientas administrativas.
- Costos y preparación de factura se pliegan bajo Más herramientas en esa ficha. En cotizaciones y cuenta del trabajo, preparar factura queda bajo Facturación (opcional). Los datos fiscales del cliente también quedan como opción secundaria. No se cambian cálculos, guardas, estados, registros ni enlaces a borradores existentes.

## Pruebas seleccionadas

Cambios de presentación en Mi día, solicitudes, fichas y triggers administrativos reutilizados. Sin API/SQL/permisos nuevos. Selección: solicitud real y respuesta diferida; conservación/no escrituras; consumidores navegación simplificada, cuenta de cliente, cotizaciones/borradores, fiscal, costos, emisor, cambios y constancia del trabajo. TypeScript, lint focal, bilingüe/UTF-8/whitespace. Se reutiliza marca: no cambian encabezados compartidos, fuentes ni artwork. No se repite la suite completa Pro ni tiendas.

Evidencia y revisión en simulador pendientes al iniciar; registrar el cierre real abajo.

## Revisión visual real

Safari del iPhone 17 Pro/iOS 26.5 en Simulator, aplicación local 3185 y Supabase loopback. Se reutiliza exclusivamente la demo registrada `/tmp/pro-simple-simulator-actors.json`; se agrega una solicitud pendiente ficticia registrada como `pendingRequestId`, con el mismo cliente/profesional de demostración, sin modificar cuentas existentes ni enviar mensajes.

Comprobado visualmente y mediante interacción: Mi día muestra solicitud pendiente junto a visita agendada; Revisar solicitudes abre Trabajos con Por confirmar; el regreso devuelve Mi día; abrir el trabajo muestra cliente, horario y Siguiente paso con Más herramientas plegado. Capturas: [pendientes](research/2026-11-03/service-pending-ios-simulator.png), [filtro abierto](research/2026-11-03/service-requests-filter-ios-simulator.png), [ficha simplificada](research/2026-11-03/service-work-detail-ios-simulator.png). La apertura de las herramientas fiscales se comprueba además en los E2E descritos abajo; no se afirma guardado financiero manual en esta entrega.

## Evidencia acumulada

- Pro job costs: aprobado, incluye historial/retornos de materiales/gastos y acceso desde la ficha ahora plegado. `/tmp/pro-efficiency-first.log` (otros tres casos de esa ejecución fallaron antes de la validación y se investigaron).
- Datos fiscales de cliente, reutilización de borradores y emisor: **3/3 aprobados** Chromium móvil en `/tmp/pro-efficiency-financial.log`; mismos controles de aislamiento, CAS, copias inmutables e historial.
- Rutas puras y constancia privada con fotos/versiones/confirmación: **2 aprobados** Chromium móvil en `/tmp/pro-efficiency-consumers.log`.
- Regreso completo, navegación simplificada y acuerdos comerciales: **3/3 aprobados** Chromium móvil tras reiniciar el servidor local saturado y preparar únicamente los módulos con OPTIONS sin mutaciones. `/tmp/pro-efficiency-consumers-final.log`. Las trazas previas confirmaron chunks/bootstrap pendientes y watchdog de sesión, no rechazos de permisos ni cambios de registros; no se alteró autenticación ni se amplió su límite.
- TypeScript global, ESLint focal, UTF-8, presupuesto bilingüe y whitespace aprobados. No se silencian reglas ni se debilitan aserciones. Se reutiliza el contrato de marca de la entrega anterior: sus entradas relevantes no cambiaron.

Los tests de triggers se adaptaron para abrir primero los grupos opcionales mediante su summary visible. La localización del botón dentro del grupo cerrado usa includeHidden únicamente para identificar el grupo, nunca para forzar clicks; luego se comprueban apertura y botón visible reales. La lectura fría de cliente/cotización se sincroniza con respuestas 200 e identidad antes de las aserciones existentes. Sin retries automáticos ni suite completa por cada cambio.


Cierre adicional: **3/3 proyectos** para prioridades y recuperación ante error, incluyendo respuesta diferida real, fallo temporal del endpoint mientras se permanece en Mi día y recuperación explícita con Reintentar. Agenda visible en todas las fases; solicitudes/trabajos/notificaciones idénticos y ninguna mutación durante navegación. `/tmp/pro-efficiency-focus-recovery.log`. La simulación de fallo se limita a Mi día y se mantiene hasta la acción explícita de reintentar para no consumirla en una petición paralela del listado de Agenda.

Borradores y disparadores plegados también aprobados en **WebKit móvil, 1/1** en `/tmp/pro-efficiency-invoice-webkit.log`. Resultado único compuesto: **13 casos aprobados** con evidencia compatible en [service-efficiency-coverage.json](research/2026-11-03/service-efficiency-coverage.json). Los intentos previos fallidos se conservan como diagnóstico; no se presentan como aprobados.

Conservación final aprobada: **78 tablas, 626 filas originales idénticas**, 20 filas exclusivas de la demostración local registrada y cero extras operativos ajenos. Se mantienen seis eventos anteriores de auditoría anonimizados. `/tmp/pro-efficiency-preservation-final.log`. La demo queda disponible para revisión; los actores y solicitudes están identificados en su registro privado y el cleanup previo elimina exclusivamente sus cuentas desechables. No se tocó producción ni se emitieron documentos o comunicaciones reales.

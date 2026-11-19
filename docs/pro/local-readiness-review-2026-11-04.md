# Cierre del alcance local de ContrataCR

> Actualización posterior: los tres errores y las seis advertencias del panel quedaron corregidos y su regresión seleccionada aprobó. [Estado actual y evidencia](panel-state-and-project-simulator-local.md). Los recorridos nativos EN y ES ya se completaron; [último incremento de claridad y pendientes vigentes](project-clarity-local.md). El cuerpo conserva el estado histórico de sus rondas.

4 noviembre 2026. Exclusivamente checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin nuevas ramas, commits, push, producción, emisión fiscal ni mensajes reales. Todo el trabajo previo se conserva.

## Decisión de producto

El candidato mejora ContrataCR para prestar servicios; no es una licencia Pro lista para vender. Congelar nuevas funciones durante el cierre. El núcleo es Proyectos/contacto → cotización → solicitud/agenda → trabajo terminado, reutilizando cliente, servicio, materiales y saldos. No se añade ninguna sección. El cliente gratuito conserva su recorrido; WhatsApp continúa como contacto principal, sin mensajes automáticos.

Menú cotidiano: Mi panel, Trabajos, Cotizaciones, Clientes y Herramientas. En Herramientas: Catálogo, Gastos y Pagos. Facturación permanece plegada y opcional, con sus borradores e historial conservados. La expansión GTI, emisión real, contabilidad completa y automatizaciones de captación quedan fuera de este cierre.

## Qué se revisa

- Navegación, regreso exacto, recarga, enlaces históricos y ausencia de descargas completas del workspace en las pantallas normalizadas.
- Formularios mínimos, conservación de campos al editar, duraciones de citas (incluido 120 minutos y cruce de medianoche) y validación de precios.
- Pendientes independientes de la agenda y recuperación explícita ante error.
- Permisos/aislamiento, paginación, CAS, consultas privadas y recuperación del registro seleccionado.
- Cliente en inglés, correcciones de abonos con historial, reprogramación, constancia privada y navegación de Empleos como consumidores.
- Conservación de registros originales, demo registrada y proyectos; TypeScript y comprobaciones estáticas.

La ronda amplia del 3 noviembre es evidencia histórica de 71 casos en Chromium móvil, no una certificación indiscriminada del código posterior. La ronda de Proyectos del 4 noviembre aporta cuatro recorridos ES/EN en Chromium/WebKit y seis regresiones compatibles. Sus detalles se conservan en [Proyectos](project-service-journey-local.md). Aquí se repiten los consumidores más relevantes al cierre acumulado; no se suman duplicados como pruebas nuevas.

## Ejecución de esta ronda

Selección antes de ejecutar: navegación simplificada, prioridades y formularios en Chromium/WebKit móvil; contratos de acceso/MFA, almacenamiento y consultas acotadas, selección recuperable, recorridos EN, reprogramación y Empleos en Chromium móvil. Sin cambios a autenticación global, SQL, RLS o dependencias durante el cierre. No usar producción para completar cobertura.

Primer intento: servidor Next dev acumulado durante casi ocho horas, más de 5 GB de RSS y consultas de sesión sin respuesta. Se interrumpió el bloque tras dos fallos y un caso interrumpido. No son aprobaciones. Se reinició exclusivamente el servidor loopback 3185, PUSH_DELIVERY_ENABLED=false, sin reiniciar/sembrar la base. Se prepararon las rutas mediante OPTIONS 204 antes de reejecutar, sin cambiar tiempos, retries, aserciones o watchdog de sesión.

Diagnóstico posterior: navegación Chromium se interrumpió al cambiar a EN durante Fast Refresh; no se retiró ninguna aserción ni se añadió retry. En el bloque ampliado aprobaron 14/15. Su único fallo real de aserción fue una fixture de integración que guardaba el trabajo el 3 noviembre y lo buscaba en Próximas el 4: la agenda lo excluía correctamente. Se reemplazan únicamente sus fechas ficticias por el día CR +2 y vencimiento CR +30; se conserva la comprobación de Próximas y todas las pruebas de permisos, recuperación de vínculo y datos. Se repite ese contrato y la navegación Chromium con módulos preparados. Las demás aprobaciones conservan sus entradas de ejecución.

Resultados terminales, conservación y revisión visual se registran al cerrar abajo.

## Límites para una futura publicación

Los endpoints Pro principales y su activación UI siguen protegidos por NODE_ENV=development. Los SQL de Pro siguen siendo borradores locales en docs/pro/sql; no son migraciones de publicación aprobadas. Una futura salida requiere preparar deliberadamente el despliegue/esquema y verificar su entorno aislado, con autorización de integración. Este cierre no elimina esas guardas ni habilita emisión fiscal.

El lint histórico del panel profesional registra tres errores react-hooks/set-state-in-effect y seis advertencias; se mantienen visibles como deuda del panel y no se silencian. Su reparación puede afectar arranque/caché y navegación compartidos: necesita cobertura más amplia propia. TypeScript o lint focal verde no deben presentarse como lint global verde.

La revisión nativa de esta ronda logró recargar el proyecto ficticio tras recuperar el servidor; los gestos para continuar no produjeron una navegación verificable. No se declara guardado o aceptación manual nativos. Se conservaron el borrador previo y los registros de demo. Los recorridos automatizados de navegador móvil se reportan por separado.

## Resultado del cierre local

**25 casos distintos aprobados: 19 recorridos funcionales y seis contratos puros** (cinco de privacidad/limitación de consulta y uno de validación del regreso). Sin skips, retries automáticos ni aserciones retiradas. [Inventario exacto](research/2026-11-04/readiness/coverage.json); las aprobaciones compuestas vienen de varios bloques y no se presentan como una única ejecución inicial verde.

- WebKit móvil: formularios, prioridades y navegación simplificada.
- Chromium móvil: formularios y prioridades; reprogramación; almacenamiento normalizado y aislamiento; recorrido de cliente EN y auditoría de nueve destinos EN; contratos privados de identificación; Empleos; correcciones de pagos con historial EN; consultas acotadas y CAS; selección recuperable; constancia privada EN; integración real de acceso/MFA/roles/recuperación de guardado y navegación simplificada.
- Chromium escritorio: Proyectos a trabajo en ES/EN, validador de regreso y navegación simplificada. Complementa los cuatro recorridos móviles ES/EN de la entrega anterior, cuyo producto no cambió en este cierre.

Logs: /tmp/pro-closure-ready-regression.log, /tmp/pro-closure-contracts.log, /tmp/pro-closure-final-mobile.log y /tmp/pro-closure-desktop.log. Los dos primeros incluyen diagnósticos fallidos que se explican arriba; el inventario selecciona únicamente resultados terminales aprobados por caso. El cambio de fixture fue validado por la integración completa (1,8 minutos); ambos casos finales móviles aprobaron y los cuatro de escritorio también.

TypeScript final global y ESLint focal de componentes/rutas y del test cambiado aprobaron: /tmp/pro-closure-final-types.log, /tmp/pro-closure-lint.log y /tmp/pro-closure-test-lint.log vacíos. Presupuesto bilingüe: 427 ocurrencias/65 archivos, sin ampliación. UTF-8 y diff-check aprobados. Se volvió a ejecutar lint del panel: conserva exactamente tres errores y seis advertencias, /tmp/pro-closure-panel-lint.log; no es lint global verde.

Se guardaron [entradas con hashes y herramientas](research/2026-11-04/readiness/inputs.json) para futuras comparaciones (fuente/configuración/tests/SQL local; sin secretos, contenido de datos ni cachés generadas). La única entrada de tests modificada en esta ronda es pro-local-integration.spec.ts por las fechas futuras. No se modificó runtime, permisos, motor financiero ni esquema.

Capturas revisadas: [Herramientas ES](research/2026-11-04/readiness/tools-es-webkit.png), [cotización ES](research/2026-11-04/readiness/quote-form-es-webkit.png), [cita EN](research/2026-11-04/readiness/appointment-form-en-chromium.png), [historial de pagos EN](research/2026-11-04/readiness/payment-history-en-chromium.png), [trabajo de proyecto ES en escritorio](research/2026-11-04/readiness/project-job-completed-es-desktop.png) y [complementos EN en escritorio](research/2026-11-04/readiness/project-quote-extras-en-desktop.png). Los campos de catálogo pueden mostrarse cargando al abrir la captura del formulario; el caso funcional comprueba después su carga y uso. Las capturas fullPage de formularios no se interpretan como medición del teclado o de la distribución nativa.

Dictamen: alcance funcional seleccionado validado para continuar las pruebas locales de ContrataCR; no publicar ni vender como Pro todavía. Mantener el alcance congelado. Los bloqueos de salida son el entorno/esquema de publicación deliberadamente no habilitado, la deuda del panel descrita y la continuación manual nativa de Proyectos no comprobada. La facturación sigue fuera del núcleo y no se reclama paridad fiscal GTI.

## Conservación final

Verificación read-only al terminar todos los E2E: **78 tablas y 626 filas originales idénticas**, 34 filas exclusivas de la demo registrada conservadas y ningún sobrante operativo de los actores desechables. Log /tmp/pro-closure-preservation.log. Permanecen diez eventos sintéticos de auditoría con actor/subject anonimizados; no se borraron eventos para obtener verde.

La referencia anterior de 78 tablas no incluía projects. Comparación independiente contra el snapshot de la entrega local anterior: **sus tres proyectos completos permanecen idénticos**, incluido el proyecto ficticio registrado; no quedan proyectos desechables. Log /tmp/pro-closure-project-preservation.log. Esta comparación acredita conservación desde esa entrega, no una referencia histórica anterior inexistente.

Verificadores separados de demo aprobaron: mismo trabajo/solicitud terminados; cotización/ficha/borrador/entradas/historial conservados; solicitud independiente de 120 minutos pendiente y sin trabajo, cotización de CRC15000 aceptada una sola vez y notificaciones idénticas. Logs /tmp/pro-closure-demo-work.log y /tmp/pro-closure-demo-client.log. Los guardados manuales anteriores de pagos y reprogramación conservan su evidencia compatible; el nuevo recorrido nativo de Proyectos sigue limitado como se describe arriba.

Rama y HEAD conservados, sin commits/push ni cambios a otros checkouts. El servidor local vuelve a escuchar en 127.0.0.1:3185 con envíos push deshabilitados.


## Actualización: recorrido manual de Proyectos comprobado

El 2026-11-04 se completó en Safari del simulador iPhone 17 Pro/iOS 26.5 el recorrido EN proyecto → cotización CRC10000 → aceptación por el cliente → cita de 120 minutos → trabajo Completed. Se verificaron una sola cotización y un trabajo vinculados, duración persistida, cero cargos/notificaciones nuevas y conservación exacta de 626 filas originales/78 tablas y tres proyectos anteriores. Se conservaron los fixtures registrados para revisión; no hubo cambios de aplicación ni push/producción. Esta evidencia reemplaza únicamente la limitación manual nativa anterior; no habilita publicación ni reclama validación fiscal. Detalle y capturas en [informe local](panel-state-and-project-simulator-local.md#prueba-manual-nativa-completada--2026-11-04).


## Actualización: claridad y recorrido español cerrados

Cotización aceptada/rechazada de proyecto muestra su estado en la tarjeta. Guardar una cita nueva desde cotización abre el trabajo guardado directamente. Recorrido manual español completo en el simulador y 19 resultados seleccionados aprobados con las entradas finales, conservación de 626 filas originales/78 tablas y tres proyectos anteriores. Los pendientes vigentes y los límites de publicación se consolidan en [el informe de claridad](project-clarity-local.md). Solo Pro local, sin push ni producción.


## Nombre de inicio confirmado por Isaac

Se conserva «Mi panel» como nombre de inicio; equivalente EN «My panel». Cambio limitado a ProSimple.day en ambos catálogos y expectativas de texto de navegación. Sin cambios de rutas, marca, diseño, datos o permisos; no requiere repetir los recorridos de guardado ya certificados.

Verificación del nombre: estado/cabecera ES y EN y navegación simplificada aprobaron 3/3 en Chromium móvil (`/tmp/pro-panel-label.log`). La auditoría de nueve destinos EN aprobó por separado (`/tmp/pro-panel-label-audit.log`, 1/1). El primer intento de esa auditoría mostró recuperación de sesión antes de renderizar el panel; se prepararon únicamente sus rutas con OPTIONS locales 204 y se repitió el caso sin cambiar aserciones, tiempos o permisos. JSON, presupuesto bilingüe y diff-check aprobados. Todo local y sin push.

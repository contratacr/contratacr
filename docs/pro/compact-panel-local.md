# Panel y clientes sin texto redundante — Pro local

5 de noviembre de 2026. Rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo anterior, sin push ni producción.

El formulario de clientes deja de mostrar Completar datos, el párrafo inicial, instrucciones bajo la identificación y la confirmación explicativa después del autocompletado. La consulta continúa al salir del documento. Solo se muestran estados breves cuando se está consultando, hay un error, faltan datos o la ficha ya existe. Abrir cliente existente conserva su función; no se retiran validaciones, protección del texto manual ni del borrador.

El resumen de Mi panel se oculta cuando ambas consultas terminaron correctamente sin trabajos de hoy ni solicitudes pendientes. No repite el título Mi panel, instrucciones genéricas ni mensajes de ausencia. Con solicitudes muestra esas solicitudes; con trabajos muestra los trabajos y su acceso a agenda. Los errores conservan su aviso y reintento: una respuesta fallida no se interpreta como ausencia de pendientes. Se conserva el resto del panel, su ficha de perfil y destinos existentes.

No se amplía el acceso a datos personales. El correo y teléfono se reutilizan desde una ficha propia o cotizaciones anteriores del mismo profesional. El registro en ContrataCR, por sí solo, no publica esos datos ni autoriza una consulta global por cédula. La API, los permisos, el esquema y el comportamiento de datos de identificación no cambian en esta revisión.

## Selección de pruebas

Se validan clientes y resumen en ES/EN sobre WebKit y Chromium móviles. Se amplía a estado/caché del panel, proveedor sin datos en caché, navegación de guías y conservación de cabeceras, además de solicitudes reales y trabajos existentes. El recorrido de borrador de cotización conserva el resumen visible porque su solicitud sí está pendiente, junto con las aserciones sobre la elección explícita y la preservación de datos. No se sustituye una aserción de contenido útil por mera existencia: el nuevo contrato comprueba vacío oculto, contenido presente visible y errores visibles con recuperación.

Se reutiliza la evidencia compatible de seguridad de identificación: API y dependencias de acceso sin cambios. No se toca marca, cabecera global, autenticación, RLS o migraciones. Tipos, lint focal y diff completan la revisión. La captura del simulador muestra el formulario sin textos ni botón adicionales; no se afirma haber creado o guardado otro cliente durante esa comprobación visual.

## Resultado

16/16 casos aprobados: 14 en `pro-compact-final.log` y 2 de conservación del borrador en `pro-compact-draft-final.log`, sobre WebKit/Chromium móviles. Tipos y lint focal con salida 0; diff sin errores. Se conservan 78 tablas y 626 filas originales idénticas y 51 filas de ejemplos registrados. Sin registros de negocio adicionales; solo cuotas antiabuso temporales registradas y conservadas hasta su expiración normal. Entradas y evidencia en `research/2026-11-05/compact-panel/inputs.json`.

La primera prueba focal encontró una selección ambigua entre dos botones Reintentar; se dio alcance al reintento de solicitudes y se esperó su recuperación antes del de agenda. Una comprobación inicial del recorrido de borrador esperaba ocultar un resumen que tenía una solicitud real pendiente; se corrigió esa expectativa y se exige que la solicitud continúe visible. No se alteraron datos ni permisos para obtener aprobación.

## Decisión posterior: retirar el resumen de Mi panel

El usuario confirmó el 5 de noviembre que el contenedor completo debía desaparecer, también cuando hay solicitudes o trabajos. Esta decisión sustituye el comportamiento condicional descrito arriba. Se retira el montaje de `ProDay` de la portada; se conservan la ficha de perfil, los destinos del panel y los datos. Las solicitudes y los trabajos se consultan en Trabajos. La portada tampoco dispara las consultas del resumen.

Las pruebas se adaptan a esa ubicación: se comprueba la ausencia del resumen en ES/EN, el acceso al trabajo existente desde Trabajos y la recuperación de errores de solicitudes allí. Se conservan las comprobaciones de datos, ausencia de escrituras y elección de borradores. La revisión visual utiliza capturas de WebKit móvil; no se presenta como una interacción manual nueva con el simulador nativo.

Validación de esta retirada: 9/9 casos focales aprobados en WebKit móvil (5 de la primera ejecución, 3 corregidos en `pro-remove-home-retry.log` y navegación en `pro-remove-home-navigation-final.log`). Se precisaron selectores de tarjetas para distinguirlos de sus menús y se actualizó la expectativa de campanas a la política existente, incluyendo el alias `pro_quotes` → `quotes`. Lint focal y diff sin errores. Auditoría local: 78 tablas, 626 filas originales idénticas y 64 filas de ejemplos previos conservadas. Captura en `research/2026-11-05/remove-home-summary/home-es.png`. Sin push, cambios de producción ni eliminación de datos.

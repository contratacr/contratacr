# Estados del panel y Proyectos en simulador

4 noviembre 2026. Solo Pro, rama local/pro-suite-no-push, HEAD base 06b70019de69bb4e1ee46ead3eda22eedf05f7d0. Se conservan los cambios previos. Sin ramas, commits, push, producción, mensajes reales ni emisión fiscal.

## Cambio seleccionado

Corregir los tres errores react-hooks/set-state-in-effect del panel profesional, sin silenciar reglas ni mover sus setters a un temporizador para eludirlas:

- Guías: la URL abre el modal declarativamente, con el destino normal del panel debajo; cerrar normaliza la URL en el propio evento, conservando los demás parámetros. La apertura manual conserva la sección que ya estaba debajo. Sus enlaces usan el router localizado.
- Arranque: useSyncExternalStore consume la caché por ID de cuenta y conserva un snapshot nulo para SSR/hidratación. Una caché sin ficha no resuelve el cargador de un profesional. La revalidación, errores y permisos de red existentes se mantienen.
- Cabecera: suscripción al contrato externo de confirmación que ya publica la barra; el panel comprueba que el título confirmado coincide con su sección. Al publicar/retirar el título se reinicia la confirmación; no mantiene un booleano duplicado en un efecto.

También se corrigen cinco advertencias del mismo panel: enlaces de Guías con recarga completa, hook nativo sin consumidor y dependencias de scroll estable. No se modifican autenticación global, caché compartida, SQL, RLS, branding, datos ni rutas API.

## Cobertura elegida antes del cierre

Es un consumidor compartido de arranque y cabecera: ampliar a prueba focal de caché completa/incompleta con revalidación real retenida, ausencia de datos de otra cuenta, Guías por URL para Pro/cliente gratuito, cierre/recarga, una sola cabecera y regreso entre secciones en ES/EN y tres proyectos. Regresión de navegación simplificada, Proyectos hasta trabajo en ES/EN y marca sin fuentes en Chromium escritorio/móvil y WebKit móvil. Después permisos/MFA/roles/guardado, auditoría EN, formularios y contratos de carreras de caché. Reutilizar evidencia financiera/SQL de la ronda anterior porque no cambian sus motores ni entradas de esquema. No afirmar exhaustiva global.

Primera prueba focal: caché completa/incompleta y Guías pasaron; la aserción de cabecera contó la propia barra global porque usa la misma clase sticky que la cabecera de reserva. Captura muestra un solo título. Se precisa el selector de reserva excluyendo ccr-app-header; se mantiene la comprobación de que no sea visible y el título global sea único. Sin cambiar producto, tiempos, retries ni aserciones de datos/permisos.

Resultados terminales, conservación y alcance real de la revisión nativa se registrarán al cierre.

## Hallazgos al ampliar

Los escenarios nuevos preservan comparación completa de perfiles y datos. Cuatro casos de la ronda inicial llegaron hasta esa comparación y detectaron la atribución legítima de primera visita en cuentas nuevas: se preparan como cuentas que ya tienen acquisition_source=direct y sus campos de captura, sin ignorar columnas. Los dos de cliente en escritorio descubrieron que normalizar Guías como home disparaba la redirección de escritorio y retiraba el modal: se normaliza como overlay sin tab seleccionado, manteniendo el destino normal debajo. Al cerrar, Pro y móvil vuelven a su inicio; cliente de escritorio conserva el destino habitual Mis proyectos. Se mantiene esa política, no se fuerza un menú móvil en escritorio.

Una ejecución posterior EN de WebKit detectó una petición de notificaciones del documento anterior cancelada al recargar (pageError a 124 ms de la navegación, confirmado en trace). La prueba ahora espera el final real de los GET Supabase pendientes antes de cambiar de documento; no se filtran errores para obtener verde ni se aumentan timeouts/retries. Se conserva renderErrors vacío, perfiles completos iguales, workspace, notificaciones y ausencia de cotizaciones nuevas. El test también abre/cierra Guías manualmente sin perder la sección y sigue Contactar soporte en ES/EN.

La marca de escritorio se interrumpió con ERR_ABORTED al navegar durante la compilación local, antes de una aserción de marca. Se reejecuta ese proyecto ya preparado; WebKit y Chromium móvil aprobaron su contrato sin fuentes. El ajuste exclusivo de tab=guides no cambia los otros recorridos. Posteriormente se amplió la corrección al consumo de la respuesta de acceso, por lo que Proyectos y navegación simplificada se vuelven a ejecutar en los tres proyectos con la fuente final, además de los controles de permisos/MFA y formularios. No se reutiliza aquella aprobación anterior como prueba del nuevo consumo de acceso.

## Simulador nativo: límite observado

Safari en iPhone 17 Pro/iOS26.5 muestra el proyecto ficticio registrado. Se pudo abrir la barra de dirección por accesibilidad. Click por coordenadas, scroll del contenedor y drag devuelven Computer Use server error -10005: noWindowsAvailable. Se volvió a obtener la app por bundle ID, se elevó su ventana y se reinició la conexión cua_repl (solo automatización, sin cerrar Safari ni borrar datos); el drag volvió a fallar igual. La captura y el árbol de Safari siguen disponibles, pero el contenido web no expone botones por accesibilidad y no se pudo continuar tocando el proyecto. No se atribuye el fallo al bloqueo del Mac ni a una falla funcional de Proyectos sin evidencia. No se afirma guardado/aceptación manual en iOS y no se pulsó WhatsApp ni se alteró el borrador previo. El recorrido completo automatizado en WebKit se documenta por separado.

## Diagnóstico de respuestas y cierre de la fuente

La espera explícita de finalización local detectó, en Chromium, tres GET /api/pro/access con estado 200 aún sin finalizar. El diagnóstico adjunto enumera solo path/método/tipo/estado, sin query ni credenciales: /tmp/pro-panel-pending-ready-results. El efecto usaba únicamente response.ok y no consumía el cuerpo. Ahora lee el JSON completo y requiere enabled===true; respuestas inválidas o denegadas no activan Pro. Es una corrección del consumidor del panel, sin alterar permisos del servidor ni la ruta de acceso. El contrato focal final aprobó 6/6 con todas las peticiones terminadas y renderErrors vacío.

Las salidas públicas, de registro y de Soporte de Guías se delegan al mismo requestUnsavedAction que ya protege los destinos del panel. La prueba cancela explícitamente una salida, comprueba que no cambia la dirección y luego permite otra; también conserva la apertura/cierre manual sobre la sección previa. No se apaga ninguna guarda para navegar.

Durante los diagnósticos el dev server devolvió Manifest file is empty para /api/pro/access y OPTIONS 400 antes de la prueba. Se reinició exclusivamente Next en 127.0.0.1:3185, con PUSH_DELIVERY_ENABLED=false; las doce rutas preparadas respondieron OPTIONS 204. No se reinició ni sembró Supabase, ni se alteró NODE_ENV para abrir Pro en producción.

Fuente congelada tras la lectura completa del acceso. Los casos focales finales de ES/EN en WebKit móvil, Chromium móvil y escritorio aprobaron en /tmp/pro-panel-final.log (6/6). No se cuentan como aprobados los intentos de selección de cabecera, atribución inicial, normalización anterior de Guías, navegación durante HMR, cancelaciones de peticiones ni el intento abortado deliberadamente para corregir el defecto. Los fallos se conservan como diagnóstico; no se retiraron las comparaciones completas ni se aumentaron tiempos/retries.

## Evidencia final

Los seis contratos focales finales aprobaron con el consumidor de acceso corregido: /tmp/pro-panel-final.log. Proyectos y navegación simplificada se reejecutaron completos con esa misma fuente en los tres proyectos: /tmp/pro-panel-consumers.log, 12/12 (nueve recorridos y tres validaciones puras del origen).

El contrato de marca de escritorio volvió a interrumpirse al pasar de Login a Proyectos. Trace confirma Fast Refresh performing full reload tras compilar la ruta pública, antes de medir la marca. Se prepararon los seis documentos públicos mediante GET local y consumo completo de HTML, sin cookies ni escrituras de aplicación. Reejecución de escritorio aprobada 1/1: /tmp/pro-panel-brand-final.log. Se reutilizan únicamente los casos de marca WebKit/Chromium móvil de /tmp/pro-panel-broad.log, con entradas públicas/logo/font-loading idénticas; las otras aprobaciones anteriores al consumidor nuevo no se suman. Los dos contratos de caché compartida aprobaron en /tmp/pro-panel-contracts.log, sin cambios a su implementación.

Las capturas del estado final y sus entradas se conservan en research/2026-11-04/panel-state. El inventario terminal y la conservación se registran abajo. No se afirma que la prueba nativa esté resuelta por aprobar WebKit.

## Resultado terminal y conservación

**28 casos distintos por proyecto aprobados: 23 recorridos funcionales y cinco contratos puros**, sin skips, retries automáticos ni aserciones de negocio retiradas. No sumar intentos anteriores: [matriz exacta](research/2026-11-04/panel-state/coverage.json) y [entradas/herramientas](research/2026-11-04/panel-state/inputs.json).

- Panel: 6/6 en /tmp/pro-panel-final.log, ES/EN × WebKit móvil/Chromium móvil/escritorio.
- Proyectos hasta trabajo y navegación: 12/12 en /tmp/pro-panel-consumers.log, tres motores/proyectos, incluye tres validaciones puras del regreso.
- Marca: WebKit y Chromium móvil compatibles de /tmp/pro-panel-broad.log y escritorio 1/1 en /tmp/pro-panel-brand-final.log. Contrato estático de wordmark también aprobado; assets intactos.
- Caché compartida: 2/2 en /tmp/pro-panel-contracts.log. Su fallo de navegación de marca se reemplaza únicamente por el resultado de escritorio descrito arriba.
- Consumidores: 4/4 Chromium móvil en /tmp/pro-panel-core.log (MFA/admin/roles/aislamiento/guardados, recorrido cliente EN, nueve destinos EN y formularios ES); formularios WebKit 1/1 en /tmp/pro-panel-forms-webkit.log. Incluyen duraciones de 30/60/120 minutos, cruce de medianoche, recarga y conservación de datos al editar.

TypeScript global y ESLint del panel completo + test nuevo aprobados: /tmp/pro-panel-delivery-types.log y /tmp/pro-panel-delivery-lint.log vacíos. Se cerraron los tres errores y las seis advertencias originales del panel; no se modificó configuración de lint ni se usó una desactivación. Presupuesto bilingüe 427 ocurrencias/65 archivos, sin ampliación; UTF-8 y diff-check aprobados. No se afirma lint global de todo el repositorio.

Comparación read-only tras terminar los tests: **78 tablas/626 filas originales idénticas, 34 filas de demo registrada conservadas y ningún sobrante operativo ajeno**, /tmp/pro-panel-preservation.log. Se conservan los eventos sintéticos de auditoría anonimizados; no se borró historial para obtener verde. La referencia no incluía projects: la comprobación independiente contra el snapshot de la entrega anterior conserva sus **tres proyectos completos idénticos**, /tmp/pro-panel-project-preservation.log. No se presenta ese snapshot como una referencia anterior inexistente.

Los verificadores de demo aprobaron mismo trabajo/solicitud completados, contacto/cotización/borrador/entradas/historial preservados, solicitud independiente de 120 minutos pendiente sin crear trabajo, cotización de CRC15000 aceptada una vez y notificaciones idénticas. /tmp/pro-panel-demo-work.log y /tmp/pro-panel-demo-client.log. No quedan cuentas auth con el prefijo nuevo panel-state de estas pruebas, /tmp/pro-panel-actor-cleanup.log. No se alteraron cuentas existentes ni se descartó el borrador nativo.

Revisión visual de [cabecera EN WebKit](research/2026-11-04/panel-state/header-en-webkit-mobile.png), [cabecera ES escritorio](research/2026-11-04/panel-state/header-es-chromium-desktop.png), [cotización EN WebKit](research/2026-11-04/panel-state/project-quote-extras-en-webkit-mobile.png) y [trabajo ES WebKit](research/2026-11-04/panel-state/project-job-completed-es-webkit-mobile.png). Un solo encabezado, controles dentro de ancho y herramientas fiscales plegadas. Los textos del usuario/fixture no se traducen automáticamente.

**Dictamen:** correcciones del panel terminadas y regresión seleccionada aprobada. La prueba manual completa de Proyectos en el simulador permanece bloqueada por el servicio de control de toques, pese a reconexión y reset; el recorrido automatizado WebKit no se hace pasar por esa revisión manual. Todo permanece local en Pro, mismo HEAD/rama, sin push, emisión, comunicaciones reales ni producción. El entorno de publicación de Pro sigue deliberadamente sin habilitarse.


## Reintento manual de Proyectos — 2026-11-04

El simulador iPhone 17 Pro / iOS 26.5 muestra Login EN de Pro en 127.0.0.1:3185. La barra de Safari responde por accesibilidad; el toque al campo de correo sigue devolviendo `Computer Use server error -10005: noWindowsAvailable`, incluso después de elevar/reseleccionar la ventana. El inventario de navegadores no ofrece una superficie DOM del simulador. No se sustituyó la prueba nativa por un navegador de escritorio ni se usaron mecanismos alternativos de inyección de eventos.

Se preparó una pareja nueva y aislada de actores ficticios locales y un proyecto «Revisión de red - prueba manual». Su registro privado está en `/tmp/pro-project-manual-20261104.json`, permisos 0600, sin copiar credenciales a este documento. Quedan registrados para reanudar el recorrido; no se inició sesión con ellos, ni se creó cotización o trabajo. El borrador anterior no se descartó ni se limpió almacenamiento.

`node /tmp/pro-project-manual-check.cjs prepared` aprobó: cero cotizaciones, cero trabajos, proyecto ficticio intacto, saldos y notificaciones sin cambios. `node /tmp/pro-project-manual-preservation.cjs` aprobó 78 tablas/626 filas originales idénticas y 36 filas registradas entre la demo anterior y los actores nuevos; sin otros sobrantes operativos. Este comprobador separado permite exclusivamente los UUID registrados de la pareja nueva, verificando que no existían en la referencia; el comprobador anterior y sus aserciones se conservan intactos. Los tres proyectos anteriores completos también permanecen idénticos mediante comparación independiente que excluye únicamente el UUID del nuevo proyecto y verifica su contenido exacto.

La ejecución manual cotización → aceptación → trabajo terminado sigue pendiente del control de entrada. No hubo cambios de código de aplicación en este reintento, suite repetida, push, contacto real ni acceso a producción.


## Prueba manual nativa completada — 2026-11-04

Después de que el usuario puso el simulador al frente y desbloqueó el iPhone simulado, el control volvió a responder. Recorrido realizado con clics/teclado en Safari de **iPhone 17 Pro, iOS 26.5**, siempre en 127.0.0.1:3185 y con las dos cuentas ficticias registradas. No se crearon documentos mediante API para sustituir los guardados manuales.

1. Profesional: abrir el proyecto registrado y «Prepare quote». Cliente, título y descripción de la línea precargados correctamente; introducir precio 10000. Total CRC10000 con IVA incluido, vigencia 15 días; «Send quote». Detalle confirma vínculo al proyecto.
2. Cliente: iniciar sesión mediante Login local, abrir Mis proyectos y «Quote received». Confirmar «Accept quote». Reabrir: estado **Accepted**, sin botones para volver a aceptar o rechazar. No se cobra ni agenda automáticamente, y el proyecto sigue abierto.
3. Profesional: volver a la misma cotización y «Schedule appointment». Mismo cliente, trabajo y cotización aceptada precargados. Pulsar **120 min** cambia final de 10:00 a 11:00 con inicio 09:00, 4 de noviembre; «Save».
4. Abrir el trabajo guardado por su enlace local. Muestra Scheduled y 09:00–11:00; pulsar «Complete job» y «Yes, complete». La pantalla final muestra **Completed**, conserva horario y enlaces a cliente/cotización, y ofrece «Balance and payments».

Los verificadores read-only aprobaron fases sent, accepted, scheduled y completed: exactamente una cotización aceptada de CRC10000 y un trabajo completado del mismo cliente, duración persistida de 120 minutos, cero entradas de saldo y notificaciones idénticas. El primer chequeo de sent se ejecutó antes de finalizar la petición y falló; su repetición tras el detalle visible aprobó, sin cambiar aserciones. Durante Login hubo entradas remotas concatenadas y una recuperación por «We couldn’t connect» durante compilaciones locales; se corrigió la entrada con selección completa y se recargó la ruta local, sin modificar credenciales, permisos o almacenamiento. No se considera que esos intentos fueran accesos aprobados.

Comparación final: **78 tablas/626 filas originales idénticas**, tres proyectos anteriores completos idénticos y contenido original del proyecto nuevo intacto. Quedan 40 filas operativas registradas entre demo anterior y nueva prueba manual; no se borran, para poder revisar el resultado. `/tmp/pro-project-manual-preservation.cjs` y `/tmp/pro-project-manual-check.cjs completed` aprobaron. Registro privado permanece fuera del repo con permisos 0600.

Capturas nativas: [cotización enviada](research/2026-11-04/project-manual/quote-sent-en.png), [aceptada por el cliente](research/2026-11-04/project-manual/quote-accepted-en.png) y [formulario con 120 minutos](research/2026-11-04/project-manual/appointment-120-en.png). El estado Completed se observó directamente en la captura del control al terminar la prueba; no se exportó esa última captura. Los textos ficticios del usuario se conservan en español dentro de la interfaz inglesa.

**Resultado:** se cierra el pendiente de ejecución manual nativa de Proyectos de este informe. No hubo cambios al código de aplicación ni necesidad de repetir suites compatibles; los 28 resultados automáticos previos mantienen su alcance. No se afirma una nueva ejecución manual completa en español ni validación de publicación. Solo Pro, mismo HEAD/rama, sin push, facturas, comunicaciones reales o producción.


## Actualización: claridad y recorrido español cerrados

Cotización aceptada/rechazada de proyecto muestra su estado en la tarjeta. Guardar una cita nueva desde cotización abre el trabajo guardado directamente. Recorrido manual español completo en el simulador y 19 resultados seleccionados aprobados con las entradas finales, conservación de 626 filas originales/78 tablas y tres proyectos anteriores. Los pendientes vigentes y los límites de publicación se consolidan en [el informe de claridad](project-clarity-local.md). Solo Pro local, sin push ni producción.

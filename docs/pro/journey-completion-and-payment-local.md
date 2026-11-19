# Cierre de trabajo y abono en el recorrido existente

4 noviembre 2026. Solo Pro local, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo local previo conservado; sin push, producción, emisión fiscal ni mensajes reales.

## Mejora

El trabajo terminado ofrece **Saldo y abonos / Balance and payments** en Siguiente paso. Abre la cuenta ya existente del mismo cliente/trabajo y conserva `volverTrabajo`. Ya no exige descubrir ese acceso dentro de Más herramientas → Costos y resultado. No genera deuda, registra pagos ni modifica importes por abrirlo. La facturación sigue secundaria, sin secciones nuevas. No cambian API, SQL, permisos ni cálculos.

## Selección de pruebas

Entrada de producto nueva: botón condicional y textos ProSimple ES/EN. Consumidores: cierre de trabajo, cuenta del cliente, navegación/recarga y operaciones de saldo. Se amplía el recorrido EN ya existente a finalización del mismo trabajo, cancelación previa sin escritura, importe acordado y abono con pérdida de respuesta después de guardar, reintento exacto y un solo pago, saldo persistido y regreso al mismo trabajo tras recargar. Chromium/WebKit móvil. En ES se amplía el recorrido del trabajo y se ejecuta su contrato de cuenta/materiales/abonos; también conflictos de borradores y cotización histórica del mismo archivo. Se reutiliza evidencia de metadatos/recibos, impuestos y restantes secciones, sin cambios en sus entradas. No se presenta esta selección como suite exhaustiva.

Límite del caso EN: solicitud y aceptación se hacen por UI, la cotización base es fixture y la propuesta de horario se prepara mediante API; después se enlaza con quote-link y agenda mediante APIs protegidas. No se cambia el estado de aceptación mediante SQL. El caso ES complementario sí crea una cotización en el editor; su estado aceptado es fixture explícita. No afirmar un único recorrido completo de creación+aceptación por UI que aún no existe en estas pruebas. Solo las cuentas desechables creadas por cada test se limpian.

Diagnósticos: primer intento EN no superó el arranque frío del perfil público; se precompilan endpoints locales mediante OPTIONS (204) sin mutaciones, sin subir timeout/retries. Segundo intento rechazó el enlace de trabajo porque la cotización fixture no tenía quote-link; el test ahora registra el vínculo por su endpoint existente antes de adjuntarlo. No se debilita esa validación del producto. Intento enlazado previo a la mejora aprobado en Chromium móvil; repetir sobre botón final para cobertura válida.

## Simulador

iPhone 17 Pro/iOS26.5, Safari local3185. Se abrió el trabajo demo terminado y su cliente conservado, se comprobó visualmente estado/historial y herramientas plegadas. Desde un trabajo demo pendiente se abrió Complete this job? y se canceló, observando Scheduled de nuevo; no se confirmó ni se registró un pago nativo. Tras la mejora se observó Balance and payments en la ficha terminada. El toque al nuevo botón devolvió noWindowsAvailable incluso tras Raise; no se presenta como navegación manual aprobada. Se conserva la demo original y su borrador sin emitir/descartar.

## Resultado focal

**6 casos por archivo/proyecto aprobados**, sin sumar reruns: recorrido EN Chromium móvil y WebKit móvil, y cuatro contratos ES Chromium móvil (cuenta/materiales/abonos, solicitud→cotización→trabajo, conflicto con borrador anterior, cotización histórica). Logs `/tmp/pro-joined-final.log`, `/tmp/pro-joined-return-webkit.log` y `/tmp/pro-service-es-final.log`. La repetición WebKit comprueba explícitamente el último añadido al test: cerrar la cuenta después de recargar y regresar al trabajo de origen. Sin cambios posteriores de producto/tests.

EN comprueba un único abono de ₡5.000 ante dos intentos con idéntico payload/actionId, importe acordado ₡12.000 y saldo ₡7.000 tras recargar; el trabajo y la solicitud quedan completos, la cotización aceptada conserva ₡12.000 y el historial anterior se conserva con un evento de cierre adicional. Las notificaciones siguen iguales. ES comprueba el botón Saldo y abonos y regreso al mismo trabajo, preserva el abono previo y mantiene acceso a cotización histórica sin descargar el workspace.

[Captura EN WebKit de saldo, abono y costos separados](research/2026-11-04/journey-payment/completed-job-payment-en-webkit.png). Se revisó visualmente sin desbordamiento horizontal. Los textos de usuario conservan su idioma original.

TypeScript global, ESLint focal de componente y dos contratos, presupuesto bilingüe sin ampliación, UTF-8 y diff-check: aprobados. No se repitió toda la suite por un acceso de navegación; se reutilizan las comprobaciones compatibles de permisos, corrección de pagos, recibos y demás formularios documentadas en las rondas anteriores.

Conservación final: `/tmp/pro-joined-preservation.log`, 78 tablas y 626 filas originales idénticas; 34 filas demo registradas conservadas y ningún otro sobrante operativo. Los dos verificadores de demo confirman historial/contacto/cotizaciones/borrador/entradas, solicitud cliente 120 minutos pendiente y aceptación única sin cambios en notificaciones. Sin push, producción ni emisiones.

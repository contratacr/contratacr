# Empleos y reprogramación acordada — Pro local

2 noviembre 2026. Checkout Pro, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Conservación del trabajo previo; sin push, main/mobile, producción ni envíos reales.

## Error de Empleos

Next valida los exports de un archivo `page.tsx`. El export auxiliar `JobsPageContent` generaba un error global de tipos y además era importado por la ficha individual. Se extrajo su cuerpo y firma sin cambios a `src/components/jobs/jobs-page-content.tsx`; listado y ficha importan el componente. No se borran tipos generados ni se excluye la ruta del chequeo. Además, los filtros no reescriben una URL semánticamente equivalente durante la hidratación, evitando interrumpir la apertura de una vacante y conservando el regreso a la búsqueda.

## Siguiente recomendación implementada

Reprogramar una cita confirmada sin cancelar o duplicar el trabajo. El profesional propone horario y duración compatibles, el cliente acepta o mantiene el horario anterior. El espacio original sigue reservado mientras se espera respuesta; la propuesta nueva no reserva otro espacio. La aceptación comprueba disponibilidad de nuevo y cambia el mismo trabajo de forma atómica. Los pagos, materiales, datos del cliente y borradores anteriores no se reescriben.

Tablas normalizadas y recibos idempotentes, solo participantes, funciones restringidas al servidor, sesión/MFA, origen, límites y paginación. El historial conserva las propuestas y sus respuestas. Cambios obsoletos aparecen marcados y no se pueden aceptar. Se respetan márgenes, anticipación y disponibilidad. Citas iniciadas, completadas o canceladas no admiten otro horario; rechazar/retirar una propuesta no cancela la cita. El selector oculta la opción exactamente igual al horario vigente.

La duración vigente se calcula a partir del inicio/fin del trabajo. Los campos originales de la solicitud quedan como snapshot, conservando el historial. Los eventos históricos `complete` se muestran correctamente junto al evento nuevo `completed`.

Referencias documentales oficiales: [Housecall Pro: portal del cliente](https://help.housecallpro.com/en/articles/8448657-using-the-customer-portal), [Jobber: visitas y recordatorios](https://help.getjobber.com/en/articles/assessment-and-visit-reminders/), [Calendly: reprogramación](https://calendly.com/help/how-to-reschedule-a-meeting). Sus recorridos permiten solicitar/mover visitas y gestionar avisos; el protocolo de conservar la cita hasta aceptación es una adaptación de ContrataCR, no una función idéntica comprobada dentro de sus cuentas. No se envían avisos ni se activan pagos automáticos.

## Pruebas seleccionadas

Entradas: extracción de página pública y consumidor detalle; nuevo API/SQL/modelo/UI de reprogramación; integración con Agenda y Citas. Impacto: render/metadata/retorno de Empleos; RLS, permisos, horarios y concurrencia de Pro. Se requiere TypeScript global, lint focal, casos de listado/ficha publicada/cerrada/404/retorno y reprogramación en tres motores; consumidores de agenda, preparación, reserva, navegación, MFA y datos financieros. La evidencia de marca se reutiliza porque no se modifican assets, fuentes ni componentes de header.

SQL aplicado solo a loopback. Comparación inmediata de todas las tablas Pro, `quotes` y `job_posts` antes/después: idénticas. Resultados finales abajo.


## Revisión visual

Empleos se abrió y se revisó visualmente en Safari del simulador real iPhone 17 Pro / iOS 26.5, apuntando a `http://127.0.0.1:3185/empleos`. [Captura del simulador](research/2026-11-02/jobs-ios-simulator.png). El control de toques devuelve `noWindowsAvailable` aun con la ventana visible y elevada; no se afirma haber guardado manualmente una reprogramación allí. Se limpiaron las dos cuentas sintéticas preparadas para esa prueba. El recorrido completo se comprueba por E2E en WebKit móvil y Chromium móvil/escritorio.

La captura WebKit de [propuesta por responder](research/2026-11-02/reschedule-customer-pending-webkit.png) muestra el horario anterior, el nuevo horario de 120 minutos y dos acciones claras. La captura final inicialmente se tomaba antes de terminar la carga tras reload; se corrigió la espera del test para exigir el detalle, estado aceptado y duración antes de guardarla. No se debilitó la comprobación funcional.


## Resultado final

- Empleos + reprogramación: 6/6 casos en WebKit móvil, Chromium escritorio y Chromium móvil (`/tmp/pro-reschedule-regression.log`). Tras ocultar el horario idéntico y ajustar la espera visual, reprogramación repitió 3/3 (`/tmp/pro-reschedule-final.log`).
- Consumidores: Agenda, solicitud/confirmación, dos casos de navegación/retorno, MFA/acceso/aislamiento, preparación de visita y cambios comerciales aprobaron 7/7. Reservas encontró un 500 de Next desarrollo «Manifest file is empty» durante recompilación; se conservó la evidencia, se estabilizaron fuentes y el mismo caso sin cambiar aserciones pasó 1/1 en 8 s (`/tmp/pro-reservations-final.log`). Total: 14 combinaciones de caso/navegador cubiertas, sin retries automáticos.
- TypeScript global, ESLint focal con cero warnings, UTF-8, presupuesto bilingüe y `git diff --check`: aprobados. Verificación SQL aislada PGlite: aprobada. Revisión adicional del backend y la integración: sin fallos de permisos o pérdida de datos encontrados.
- Conservación final: 78 tablas revisadas, 626 filas originales idénticas. Se eliminaron las cuentas y registros operativos sintéticos. Se conservan por diseño 3 eventos nuevos de auditoría del test administrativo (`membership.active` y dos `publication_promotion`), con actor y sujeto ya nulos tras limpiar las cuentas; no son cambios de datos previos ni envíos reales. `/tmp/pro-reschedule-data-final.log`.
- [Historial reprogramado y duración 120 minutos](research/2026-11-02/reschedule-history-webkit.png), [vacante publicada](research/2026-11-02/jobs-published-webkit.png), [vacante cerrada](research/2026-11-02/jobs-closed-webkit.png).

Todo permanece local en Pro, misma rama y HEAD, sin push ni cambios en producción. Esta entrega completa la reprogramación acordada; no anuncia equivalencia total con GTI ni emisión fiscal validada. Recordatorios con consentimiento, lista de espera y recursos/equipos siguen siendo recomendaciones pendientes de diseño e implementación.

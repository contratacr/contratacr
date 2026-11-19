# Pagos, citas y revisión general — 3 noviembre 2026

Checkout exclusivo Pro, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo local previo. Sin push, checkouts main/mobile, producción, cobros reales, emisión fiscal ni notificaciones.

## Guardados manuales en el simulador real

Safari en iPhone 17 Pro/iOS 26.5, aplicación `http://127.0.0.1:3185` y Supabase `http://127.0.0.1:54321`. Dos cuentas ficticias nuevas y aisladas, eliminadas al terminar mediante cleanup limitado a sus IDs y correos. Contraseñas no guardadas en Safari.

- Pago de ₡250 sobre borrador de ₡1.000, fecha 3 noviembre 2026, SINPE y referencia `QA-SIMULADOR-SINPE-250`. Aplicado desde el formulario; recarga conserva ₡250 aplicados y ₡750 pendientes. Verificación DB read-only: exactamente un pago y una aplicación, metadata exacta, total original sin cambios. [Captura del guardado](research/2026-11-03/payment-saved-ios-simulator.png).
- Cliente gratuito aceptó propuesta para 6 noviembre 2026, 12 p. m., 120 minutos. Confirmación visible y recarga con estado aceptado, mismo horario y duración. Verificación DB read-only: mismo workId, solo inicio/fin de la cita modificados; pago, aplicación y borrador idénticos al baseline posterior al pago. [Aceptación](research/2026-11-03/reschedule-accepted-ios-simulator.png), [reapertura](research/2026-11-03/reschedule-reopened-ios-simulator.png).

Se adelantó el bloque de propuesta/historial en la ficha de cita, antes de sus datos descriptivos: permite revisar y responder sin recorrer toda la ficha. Sin cambio de reglas de aceptación ni almacenamiento.

## Corrección de precios de cotizaciones

El contrato actual de cotizaciones guarda colones enteros. El editor Pro eliminaba puntos y comas al escribir, transformando una entrada como `1250,50` en `125050`. Ahora conserva el texto y rechaza formatos ambiguos antes del POST, con ejemplo claro. El catálogo admite decimales; su redondeo al copiar a cotización se anuncia para revisión. No se cambia el catálogo ni el historial. Las facturas mantienen su propio contrato de céntimos. Soportar céntimos también en cotizaciones requiere otro cambio deliberado de API, cálculos y PDF.

## Selección de cobertura y evidencia

El usuario solicitó revisar todas las secciones. Se seleccionan los archivos `pro-*.spec.ts` en Chromium móvil, base local, worker único, sin retries. Incluyen formularios, filtros, paginación, importación CSV, clientes, catálogo, inventario, agenda, cotizaciones, facturación, impuestos, pagos, costos, estados de cuenta, permisos y aislamiento. No equivale a certificación fiscal ni distribución nativa. Se reutiliza evidencia compatible por caso: no repetir suite entera por cada corrección.

Se separó la interacción manual de la compilación de rutas del E2E: Next dev recargaba documentos al compilar rutas frías. Primer bloque se interrumpió al encontrar el defecto de precios; el segundo obtuvo 27 aprobadas, dos fallos y una interrupción explícita (invoice-detail, pendiente, no fallo funcional demostrado). Los fallos se investigan sin debilitar aserciones: preview antiguo con etiquetas distintas y estado de cuenta interrumpido por recarga de Next. Los casos restantes y afectados finalizaron con 46 aprobados y dos fallos de arranque/etiquetas del harness. Se corrigieron las etiquetas del preview para que describan su componente real, sin cambiar el producto. Los tres casos de ese preview aprobaron. El recorrido completo de paquetes aprobó al sincronizar la respuesta real de cotizaciones antes de comprobar su interfaz; no se eliminaron aserciones ni se añadieron reintentos. Resultado único acumulado: **71 casos Pro aprobados en Chromium móvil**. El inventario por caso está en [pro-review-coverage.json](research/2026-11-03/pro-review-coverage.json).


Las verificaciones adicionales de escritorio aprobaron formularios, reprogramación y el analizador de precios; este último también aprobó en WebKit móvil. El recorrido completo de formularios también aprobó en WebKit móvil (1,9 min). La reprogramación completa también aprobó en WebKit móvil (1,1 min). Las trazas previas confirmaron compilación fría de rutas, incluido el retraso de la consulta de seguridad que activó el watchdog de sesión de ocho segundos. Se preparan esos módulos mediante OPTIONS sin ejecutar handlers de negocio, comprobando 204/Allow e identidad; los recorridos esperan respuestas reales con estado e identidad antes de sus aserciones visuales. Se conservaron watchdog, aserciones y tiempos originales, sin retries automáticos. Resultado adicional: **tres casos de escritorio y tres de WebKit aprobados** (formularios, reprogramación y analizador de precios en cada proyecto). Los dos guardados manuales en Safari del simulador sí están comprobados, incluida reapertura y persistencia.

## Conservación y límites

Comparación de las 78 tablas del baseline local: **626 filas originales idénticas**, sin extras operativos tras limpiar exclusivamente las cuentas desechables registradas. Se conservan seis eventos de auditoría sintéticos anonimizados. El trabajo local previo de la rama permanece. No se aplicaron migraciones ni escrituras fuera del entorno local.

Esta revisión cubre los escenarios enumerados, no todas las combinaciones posibles. La emisión electrónica real, validación fiscal con Hacienda, entrega de notificaciones a dispositivos reales y certificación de tiendas no forman parte de esta evidencia. No se afirma equivalencia fiscal completa con GTI ni preparación para emitir documentos reales.


Verificación estática: TypeScript global, ESLint focal, presupuesto bilingüe, textos UTF-8 y `git diff --check` aprobados. La captura [líneas de cotización en WebKit](research/2026-11-03/quote-lines-webkit.png) se revisó visualmente; mantiene acciones y campos dentro de pantalla.


Logs de cierre: `/tmp/pro-local-remaining-review.log`, `/tmp/pro-final-harness.log` (tres previews aprobados; su fallo de paquetes fue investigado), `/tmp/pro-packages-diagnostic.log` (paquetes completo aprobado), `/tmp/pro-final-price-calendar.log` (tres casos de escritorio y analizador WebKit), `/tmp/pro-final-webkit-synced.log` (formularios WebKit), `/tmp/pro-final-webkit-reschedule-ready.log` (reprogramación WebKit). Los intentos previos fallidos se conservan como diagnóstico; no se cuentan como aprobados.

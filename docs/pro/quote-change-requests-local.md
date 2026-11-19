# Pedir cambios a una cotización — solo Pro local

5 de noviembre de 2026. Rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preserva el trabajo local anterior; sin push, producción, mensajes externos ni documentos fiscales.

## Comportamiento

El cliente identificado puede abrir una cotización enviada y vigente y pedir un ajuste con un único texto (hasta 1000 caracteres). La cotización permanece enviada: no se acepta, rechaza ni cambia su precio. El profesional ve la solicitud dentro de esa misma cotización y puede guardar una respuesta. El cliente puede retirar la solicitud dejando rastro o volver a pedir un ajuste después de la respuesta.

El historial guarda autor por rol, fecha de Costa Rica, texto y una copia de los datos de la cotización y complementos de ese momento. Reutiliza el detalle existente de cotizaciones y el de complementos; no agrega secciones. No se envía WhatsApp, correo, push ni una promesa de notificación automática: la interfaz dice que la solicitud se ve al abrir la cotización.

Esta entrega registra la conversación sobre cambios. Una respuesta no modifica los importes ni equivale a aprobar una propuesta revisada. El cliente aún puede aceptar la cotización actual explícitamente; la interfaz le recuerda revisar los importes. Cotizaciones cerradas o vencidas conservan el historial sin permitir nuevas solicitudes/respuestas.

## Conservación y acceso

SQL local aditivo `docs/pro/sql/quote-change-requests-local.sql`, instalado únicamente en la base de loopback; registrado después de quote-choices en el preparador local. No hay migración de producción ni actualización de filas antiguas. Se añaden estado, eventos y acciones idempotentes, con RLS y permisos exclusivos del servicio; las funciones comprueban actor, pertenencia, Pro activo del emisor y destinatario real. El historial impide reasignar a otro cliente/emisor una cotización que ya tenga conversación.

Las escrituras usan revisión y huella de la cotización (incluidos complementos), bloqueo transaccional e idempotencia por actor/acción. Un reintento idéntico devuelve el mismo resultado; un reintento modificado o una versión obsoleta no añade eventos. El paginado del historial detecta una revisión distinta y pide actualizar. Borradores de texto y resultados inciertos se protegen al navegar y cerrar.

## Selección de pruebas

Se modifica el detalle compartido de cotizaciones y complementos y se añade SQL con permisos y un trigger de destinatario. Se amplía cobertura a contrato SQL aislado, API y E2E de solicitud/respuesta/retiro/aceptación, Proyectos, complementos y recorrido de servicio. Los casos nuevos se ejecutan en español e inglés en Chromium móvil y WebKit móvil. Se conservan las aserciones sobre datos, terceros, acceso anónimo, reintentos y cotizaciones originales.

Sin cambios de marca, cabeceras globales o recursos: se reutiliza el contrato de marca compatible de la revisión anterior. Tipos, lint focal y diff forman parte del cierre. Evidencia manual en Safari del simulador; no certifica un binario nativo.

## Resultados y evidencia

- 4/4 casos nuevos: español e inglés en WebKit móvil y Chromium móvil. Resultado final compatible: `pro-quote-changes-canonical-fixture.log` (ES/WebKit) y `pro-quote-changes-matrix-final.log` (los otros tres). Se prueban solicitud, respuesta, retiro, aceptación posterior, cotización original intacta, copia histórica, reintento tras una respuesta perdida sin duplicación, CAS, terceros, acceso anónimo, origen, campos extra, RLS y complementos cambiados después de la lectura.
- 8/8 regresiones de Proyectos y complementos en ambos móviles (6 recorridos funcionales y 2 comprobaciones puras de retornos). `pro-quote-changes-regression.log`. Los últimos cambios fueron presentación por rol y visibilidad del vacío; no se cambió la lógica anterior de Proyectos, aprobación, complementos o factura de prueba.
- Contrato SQL aislado aprobado: permisos, acceso deshabilitado, Pro inactivo, vigencia/estado, revisión, huella, reintentos, paginado, snapshot y reinstalación con historial existente sin alterarlo. Tipos y lint focal: salida 0; diff sin errores.
- Fallos iniciales conservados en `/tmp/pro-quote-changes-*`: se corrigieron una referencia SQL ambigua y la etiqueta accesible del textarea. Las repeticiones de arranque detectaron compilación fría y verificación de sesión antes de llegar a la función; se preparan las rutas reales y se completa la capacidad profesional de la fixture como en un registro real. Se conservan las aserciones de autorización y datos. No se interpreta un fallo de arranque como una prueba aprobada.
- Conservación final: 78 tablas y 626 filas originales idénticas. Se verifica también, profundamente, el estado previo de los ejemplos manuales, proyectos, cotizaciones, saldos y notificaciones. La nueva cotización de ejemplo está registrada aparte; precio, estado y complementos siguen intactos. Hay exactamente una solicitud ficticia preparada y una respuesta guardada manualmente desde el simulador, sin otros registros nuevos de cambios fuera de ese ejemplo. La auditoría se ejecutó después de limpiar las cuentas E2E; las excepciones se limitan a las fixtures registradas.

Evidencia en `research/2026-11-05/quote-change-requests/`, con hashes de entradas y logs finales. El registro privado de la nueva fixture es `/tmp/pro-quote-change-demo.json`, sin credenciales publicadas en la documentación. Se conserva el comparador anterior sin modificar y se valida explícitamente esta nueva fixture en `/tmp/pro-quote-change-preservation.cjs`.

### Simulador: respuesta guardada manualmente

Se abrió la cotización ficticia en Safari del iPhone 17 Pro simulado. La solicitud del cliente se había preparado mediante la base local para mostrarla; no se presenta como guardado manual del cliente. Tras recuperar el control se abrió Responder solicitud, se escribió `PRUEBA_LOCAL_RESPUESTA_001` y se pulsó Guardar. La interfaz confirmó «Guardado en la cotización» y mostró tanto la respuesta del profesional como la solicitud original en el historial. Evidencia: `research/2026-11-05/quote-change-requests/simulator-saved-response.png`.

La consulta posterior a la base local verifica dos eventos y dos acciones exactamente, revisión 2, solicitud resuelta y autor/texto de la respuesta correctos. El precio sigue en ₡10.000, la cotización enviada y los complementos intactos; 78 tablas y 626 filas originales idénticas, también los ejemplos manuales anteriores. Registro en `pro-quote-changes-preservation-manual.log`. Los guardados cliente/profesional están además verificados por los E2E en WebKit y Chromium móviles.

Durante esta comprobación se detectó la línea al enfocar campos junto a Safari; se analiza y corrige por separado en `modal-keyboard-boundary-local.md`. No se certifica un binario nativo ni una regresión exhaustiva ni se afirma que una respuesta altere la cotización automáticamente.

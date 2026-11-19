# Solicitud, cotización y cierre dentro del mismo recorrido

3 noviembre 2026. Solo Pro local `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo anterior. Sin secciones nuevas, branches/worktrees, push, producción, mensajes ni documentos reales.

La solicitud del profesional permite preparar una cotización con el mismo cliente y servicio. El botón prepara/reutiliza exclusivamente el contacto derivado de la identidad autenticada de esa solicitud; no compara nombres ni copia información fiscal, correo o teléfono privados de la cuenta. Un contacto existente conserva sus datos enriquecidos; archivados se rechazan. No se confirma una cita ni se crea un trabajo por preparar una cotización.

El editor revalida el origen desde el servidor, precarga cliente/título/primera descripción y deja el precio vacío para revisión explícita. Conserva formularios locales anteriores; si corresponden a otro cliente ofrece continuar ese formulario o descartar solo el formulario local, sin borrar documentos guardados. Se conserva regreso a la solicitud con URL validada incluso después de recargar.

La ficha del trabajo muestra Finalizar trabajo con confirmación y cancelación. Reutiliza la operación de agenda existente; no crea estados, tablas, cobros ni notificaciones adicionales. Conserva el mismo trabajo y su historial, cliente, horario, materiales y abonos. Las herramientas administrativas continúan plegadas.

## Selección de validación

Nuevo endpoint con control de dueño/Pro/origen, reutilización/CAS y trigger de cierre existente, editor compartido con guardado local y navegación de origen. Cobertura ampliada: handlers aislados, permisos reales en loopback, recorrido completo con cancelación/confirmación, contactos enriquecidos/archivados, repetición del contexto, recarga, preservación de solicitud/cotización/abonos/historial/notificaciones, consumidores de editor/formularios/solicitudes/cierre. TypeScript/lint/bilingüe/UTF-8. Marca reutilizada: sus entradas relevantes no cambian. Sin SQL ni migraciones nuevas; no se repite toda la suite por ajuste.

## Resultados

11 casos distintos aprobados (sin contar repeticiones): recorrido y conflicto de formulario en Chromium escritorio/móvil y WebKit móvil; consumidores de reprogramación, recuperación del editor y formularios; cierre con cotización heredada; fecha de vigencia. Matriz deduplicada: `research/2026-11-03/service-journey-coverage.json`. Los permisos integrados verifican origen incorrecto, cuenta cliente sin Pro y profesional ajeno. Contacto enriquecido/archivado, CAS y GET sin escritura también tienen prueba aislada del handler.

La aceptación de cotización en el nuevo E2E se prepara exclusivamente como fixture de DB local: esta ronda no certifica una nueva interfaz de aceptación por el cliente. Se reutiliza la implementación existente. El cierre prueba el trigger real y comprueba la solicitud, el trabajo, la cotización, contacto, abonos, eventos y notificaciones; no descarga el documento completo del workspace.

Simulador iPhone 17 Pro/iOS 26.5, Safari contra localhost: cliente y servicio precargados, entrada manual de CRC 12.500, guardado de cotización, regreso a la misma solicitud, apertura del mismo trabajo, cancelar cierre, confirmar cierre y recargar mostrando Finalizada. Se usó una URL de origen validada para abrir el editor; el botón de preparación/POST se cubrió en E2E. Capturas `journey-quote-prefilled-ios-simulator.png`, `journey-quote-saved-ios-simulator.png`, `journey-return-request-ios-simulator.png`, `journey-request-actions-ios-simulator.png` y `journey-work-reopened-ios-simulator.png` en `research/2026-11-03/`.

La comprobación de DB local confirmó que cancelar no modifica el trabajo y finalizar conserva el mismo trabajo/solicitud, cotización, contacto, borrador fiscal anterior, entradas e historial original. Comparación de preservación: 78 tablas, 626 filas originales idénticas; 23 filas de la pareja de prueba registrada se conservan para revisión del simulador. Se mantienen seis auditorías anteriores anonimizadas. Ningún otro sobrante operativo.

La revisión manual detectó vigencia distinta entre editor y documento al cruzar medianoche UTC. Editor y API ahora calculan las cotizaciones nuevas con calendario de Costa Rica, sin reinterpretar documentos guardados. La captura de cotización guardada precede a esa corrección y conserva la fecha histórica original. Prueba de límites de medianoche, año y bisiesto, y afirmación integrada de fecha guardada aprobadas.

Al finalizar un trabajo se conserva el historial de horarios; las propuestas anteriores no ofrecen nuevas acciones de reprogramación. Herramientas administrativas siguen plegadas. No se añadieron secciones ni migraciones.

TypeScript, ESLint de componentes/rutas/helper/pruebas focales, presupuesto bilingüe, UTF-8 y diff sin espacios inválidos: aprobados. No se declara lint global del panel compartido: conserva diagnósticos previos fuera del incremento. No se repitieron pruebas de marca porque logo/header/fuentes permanecen iguales y existe evidencia compatible previa. Sin build nativo ni acciones de CI/tiendas.


Verificación final tras el ajuste de historial de horarios: 4/4 en Chromium móvil (reprogramación, recorrido completo, conflicto de formulario y cotización heredada), `/tmp/pro-journey-terminal.log`. No suma casos repetidos al total de 11. Vista nativa recargada confirma Finalizada y muestra Propuesta anterior bajo Historial de horarios, sin acciones de reprogramación.

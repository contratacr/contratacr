# Disponibilidad opcional y simplificación local

5 noviembre 2026, Pro `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push/ramas, producción, mensajes, emisión fiscal ni borrado de funciones/datos.

## Recuperación y alcance

El calendario recuperado está en `c4631b68`; la documentación histórica apunta a `5590123a^` para el editor previo a retirar Citas. Se reutilizan el calendario, horarios por fecha y solicitudes con confirmación existentes; no se resucita un segundo sistema de reservas.

Ahora Trabajos → Calendario muestra «Recibir solicitudes de citas» antes del calendario. Por defecto está desactivado, incluso con horarios anteriores: no se presume consentimiento. El profesional puede activar o pausar. Los horarios guardados, trabajos y solicitudes existentes permanecen; pausar bloquea exclusivamente solicitudes nuevas. La confirmación/reprogramación/cancelación de lo ya solicitado conserva su recorrido. Guardar horas manuales no activa solicitudes por sí solo.

Se preserva la cuenta gratuita del cliente al enviar. Consultar horarios publicados sigue siendo anónimo; no requiere Pro ni instalar la app. Se recomienda este equilibrio frente a reservas anónimas sin identidad. El inicio de sesión y su formulario existentes no se reescriben en esta ronda; la conservación de un borrador a través de un login completo no se presenta como implementada.

Herramientas conserva Catálogo, Gastos, Pagos y Facturación plegada. Se retiran únicamente sus accesos duplicados a Proyectos/Empleos/Promociones/fotos/etc., disponibles en el panel habitual. No se retira ninguna función o registro. El aviso de confirmación de cita pasa a texto simple en el formulario, conservando su significado.

## Implementación y protección de datos

SQL local aditivo `appointment-opt-in-local.sql`: dos tablas nuevas vacías con RLS, sin lectura/escritura directa de usuarios, función de preferencias para profesionales habilitados, revisión e idempotencia. Comprobación de pausa insertada después del replay y bajo el bloqueo del propietario en la operación existente; no se renombra ni duplica el motor. Instalación repetida admite el guard existente y falla si desaparece su punto de inserción. El preparador local instala este último parche después de sus dependencias. Las guardas NODE_ENV continúan.

La API pública de horarios y la API histórica de reservas comprueban el permiso. La creación SQL comprueba también el permiso: ocultar el botón no basta. Los detalles privados siguen autenticados. Cambio de preferencias con origen, esquema estricto, límite de cuerpo, rate limit, cuenta activa y verificación administrativa. El control conserva UUID y muestra reintento ante respuesta incierta, sin una segunda mutación distinta.

Se aplicó únicamente ese SQL a PostgreSQL loopback. No se ejecutó el preparador completo, reset o seed. Ninguna fila anterior actualizada; ningún profesional anterior activado automáticamente. Las fixtures de los recorridos de reserva ahora optan explícitamente a sus profesionales desechables; la prueba del valor inicial no los activa de antemano.

## Selección de pruebas

Es un cambio de permiso de creación: ampliar a contratos PostgreSQL aislados (valor inicial, activación, revisión, idempotencia, pausa/replay/citas existentes, RLS y preservación), API/UI de solicitudes, compatibilidad histórica, solicitud→cotización→trabajo, preparación de visitas, reprogramación, recorrido inglés y navegación con funciones originales. WebKit/Chromium móvil. No cambia autenticación global, marca, cálculos fiscales o esquema de producción. Se reutiliza evidencia compatible del resto.

La primera prueba UI encontró un rechazo del origen por usar la URL interna normalizada de Next. Se corrigió para comprobar protocolo y Host igual que las rutas existentes; el origen externo continúa rechazado. No se retiró la comprobación CSRF ni se debilitó una aserción. Lint inicial del componente detectó uso de ref en render; se reemplazó la representación del estado incierto por estado React y se difirió la carga del efecto, manteniendo la clave de replay en ref.

Resultados finales y evidencia se completan al cerrar las ejecuciones.

## Revisión visual y correcciones de pruebas

Simulador iPhone 17 Pro/iOS 26.5, Safari loopback: se abrió Trabajos desde el panel y se revisó el calendario existente y el control desactivado. Se colocó el control antes del calendario para hacerlo visible sin tener que llegar debajo del mes. No se guardó una preferencia de la cuenta demo durante esta revisión; el guardado, pausa y replay se ejercitan con cuentas desechables de Playwright. La navegación por dirección/gestos del control remoto no respondió de manera fiable, pero el toque al acceso Trabajos y la recarga permitieron verificar el resultado visual. No se presenta una activación manual como realizada.

Las pruebas de solicitudes ahora simulan pérdida de la respuesta DESPUÉS de guardar la activación: el control muestra estado incierto, impide un segundo cambio y reintenta con el mismo actionId. También verifican disponibilidad pública desactivada/activada/pausada, denegación de acceso anónimo a preferencias, cuenta ajena, origen externo, pausa de nuevas solicitudes y confirmación de una ya existente. Los consumidores anteriores optan explícitamente a sus profesionales ficticios; el valor por defecto queda probado independientemente.

La primera regresión ampliada aprobó 15/16; WebKit interrumpió la navegación forzada a Inventario por un regreso pendiente desde el formulario de Clientes en la prueba inglesa. Cada formulario cotidiano se comprueba ahora en una pestaña propia de la misma cuenta; se mantienen apertura, Guardar, cierre, URL, ausencia de desbordamiento y conservación del cliente. La navegación entre secciones se sigue cubriendo en su prueba específica. No se añadieron retries ni pausas fijas.

## Cierre y evidencia

**24 resultados distintos por caso/navegador aprobados**, compuestos entre rondas: ocho de recorrido de servicios/compatibilidad histórica, doce de consumidores independientes y cuatro de los dos casos finales modificados (solicitudes y recorrido inglés). Ambos navegadores móviles, sin skips/retries automáticos. Matriz exacta y huellas en `research/2026-11-05/appointment-opt-in/`.

Una repetición adicional tuvo 3/4 aprobaciones: Chromium quedó esperando que terminaran lecturas RSC de precarga, criterio de infraestructura incorporado anteriormente al test. Se retiró ese requisito de inactividad global; se conservan sesión/identidad verificadas, recarga real y comprobación del saldo persistido, historial y todos los formularios. Con las pestañas independientes, el recorrido inglés final pasó 2/2. No se cambió el producto, el watchdog de sesión, los tiempos ni las aserciones de datos para resolverlo.

TypeScript, lint de componentes/API/scripts/fixtures, presupuesto bilingüe, UTF-8 y diff-check: aprobados. Contratos SQL aislados aprobados, incluida denegación de la operación original tras redefinirla; sus permisos no se abrieron.

Conservación final: 78 tablas/626 filas originales idénticas, 51 filas demo registradas intactas, sin sobrantes operativos. Se comprobaron además las DOS tablas nuevas: ambas quedan vacías después de limpiar los actores desechables; ninguna cuenta existente activada. Respaldos, historial de cambios de cotización, registros manuales y notificaciones anteriores conservados.

La simplificación conserva todas las funciones, destinos principales y datos. La disponibilidad sigue solo local y las condiciones de publicación anteriores siguen pendientes; no se integró a main/mobile ni se hizo push.

Compilación optimizada local `next build --webpack`: aprobada con el entorno loopback verificado. El build mantiene avisos de deprecación existentes; no se afirma ausencia de advertencias globales. Se restableció Next de desarrollo en 127.0.0.1:3185, push deshabilitado, sin reiniciar la base ni publicar nada.

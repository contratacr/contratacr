# Recuperación del calendario de citas — local

Fecha: 2026-11-05. Rama `local/pro-suite-no-push`; HEAD de partida `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo local anterior. Sin push, despliegue, comunicaciones ni cambios en producción.

## Referencia histórica y alcance

Se revisaron `354b6e6a` (`5590123a^`, código previo a la eliminación de Citas) y la recuperación parcial `c4631b68`. El primer snapshot ya tenía puertas de acceso deshabilitadas: es referencia del código, no evidencia de una versión pública activa.

Se recupera el recorrido calendario → hora → detalles → confirmación, los tres días compactos de horarios en la ficha, reglas semanales con duración definida por el profesional y días sin atención. Horas adicionales por fecha siguen disponibles en «Editar disponibilidad». No se reactiva el viejo sistema entero: sedes/videoconsulta y reservas sin cuenta no se restauran en esta ronda.

Guardar «Horario semanal» adopta la reserva directa de horas publicadas; el interruptor de disponibilidad sigue apagado por defecto y guardar horarios no lo enciende. Los profesionales que todavía no configuran el horario conservan el comportamiento de solicitudes existente. «Solicitar otro horario» sigue pendiente de respuesta. Si hay preguntas previas obligatorias, la cita permanece pendiente hasta completar el proceso existente; no se omite esa protección.

## Conservación e integración

- Reglas en tablas propias `pro_appointment_schedules` y `pro_appointment_schedule_actions`; no se vuelve al JSON del workspace ni se reescriben disponibilidades anteriores.
- Cierres ocultan nuevas horas, sin cancelar citas ni borrar datos. Pausar conserva reglas, excepciones e historial.
- Reserva directa crea solicitud, contacto faltante, trabajo e historial en la misma transacción y con el bloqueo de agenda existente. No se sobrescriben los datos de un contacto guardado.
- Se conservan anticipación, separación entre visitas, conflictos y reprogramación acordada. Reprogramar también consulta las reglas semanales.
- CAS de configuración e idempotencia de acciones. Repetir una operación con el mismo identificador no crea otra reserva.
- Tablas/RPC nuevas limitadas a `service_role`; API verifica cuenta, capacidad, origen, tamaño y esquema. Solo disponibles en desarrollo.
- El endpoint anterior de reserva no puede saltarse las reglas nuevas una vez configurado el horario. Sus reservas anteriores y la gestión de esos trabajos se conservan.
- La vuelta del login conserva el borrador y exige envío explícito. Se usa navegación de documento para evitar el bucle RSC/idioma observado en WebKit.

## Selección de pruebas

Cambios: interfaz pública de citas, editor de agenda, API de disponibilidad y nuevo almacenamiento con permisos. Se amplía a contratos SQL aislados (recurrencia, cierre, duración, conflictos, reintento, CAS, preparación, reprogramación, acceso y conservación), E2E ES/EN en WebKit móvil y Chromium móvil (login, editor, solicitudes, propuestas/aceptación/cancelación, reprogramación y preparación), tipos, lint y build. La evidencia anterior de facturación y secciones no dependientes no se vuelve a ejecutar. No se modifica autenticación global ni estilos/cabeceras compartidos.

## Resultado de la ronda

- 24 pares caso/navegador distintos aprobados entre las rondas focales: `research/2026-11-05/appointment-calendar/passing-cases.json`. No fue una ejecución inicial perfecta: se corrigieron el bloqueo de Continuar al pasar a otro horario, la etiqueta accesible del selector de duración y el cambio de nombre del botón en la prueba de compatibilidad. La navegación de documento corrigió el bucle de login de Safari observado en la ronda inicial.
- Última verificación del calendario público, login ES/EN y compatibilidad anterior: 10/10, WebKit móvil y Chromium móvil. El editor semanal ES/EN y la reprogramación pasaron en la ronda anterior, con entradas compatibles. Se reutiliza esa evidencia, sin repetir secciones ajenas.
- Contratos aislados de horario semanal, preparación y reprogramación aprobados. Incluyen bloqueo de reservas repetidas, horarios cada 120 minutos (sin inicios intermedios de 15 minutos), cierres, duración, CAS, reintentos, permisos, historial y conservación.
- TypeScript, lint focal, presupuesto bilingüe y build optimizado aprobados. El build no activa las APIs de Pro fuera de desarrollo.
- Conservación local: 78 tablas, 626 filas originales idénticas; permanecen las 58 filas de demostración ya registradas. No se conservaron actores nuevos de estas pruebas ni se activó disponibilidad de usuarios existentes. Las dos tablas nuevas de horario quedan sin fixtures persistentes tras la limpieza.
- Capturas de WebKit y Chromium móviles revisadas visualmente. No son capturas del Simulator nativo. Dos intentos con el control del Simulator devolvieron Mac bloqueado; la prueba manual nativa queda pendiente del desbloqueo solicitado al usuario.
- No hubo push, cambios en main/mobile, producción ni envío de comunicaciones. Recordatorios y push de citas siguen pendientes de conexión; no se certifican en esta ronda.

Evidencia: `research/2026-11-05/appointment-calendar/`. El servidor local se dejó nuevamente en `http://127.0.0.1:3185` después del build.


## Prueba manual nativa completada tras desbloquear el Mac

El 5 de noviembre se retomó el Simulator iPhone 17 Pro / iOS 26.5, Safari privado y servidor local 3185. Se reutilizó la pareja ficticia ya registrada; no se inició sesión en producción. La regla semanal de 120 minutos se preparó por RPC local exclusivamente para ese profesional ficticio, sin reemplazar disponibilidad anterior. Esta ronda manual no afirma haber guardado el editor semanal con toques; ese editor conserva su evidencia E2E ES/EN.

Con toques en el Simulator se abrió «Ver disponibilidad», se seleccionó el lunes 9 de noviembre a las 8:00, se continuó a los detalles, se escribió `PRUEBA_LOCAL_CALENDARIO_120`, se pulsó «Reservar cita» y se abrió «Ver mis citas». La pantalla mostró Confirmada, 120 minutos, fecha/hora y nota. La consulta independiente verificó exactamente un nuevo registro, un trabajo de 8:00 a 10:00 y un evento de historial con estado confirmado. La solicitud anterior permaneció idéntica. El Simulator se dejó abierto en el detalle de la reserva.

Registro local de la demostración: `/tmp/pro-weekly-native.json` (solo para el entorno local). Reserva `d2595608-3965-4b38-a6f1-e6e8e2f192e5`. Evidencia de comprobación y conservación: `research/2026-11-05/appointment-calendar/native-check.log` y `native-preservation.log`. Las filas de esta demostración se conservan, por lo que el recuento anterior de tablas nuevas vacías solo corresponde al cierre de las pruebas automáticas. Sin cambios adicionales en código, push, producción ni comunicaciones reales.

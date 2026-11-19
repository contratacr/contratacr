# Solicitar una cita sin perder los datos al ingresar

5 noviembre 2026. Solo `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push, ramas, producción, cambios de esquema ni envíos reales.

## Cambios

El invitado ve disponibilidad y completa su solicitud. Al pulsar Ingresar tras el aviso, se conserva un borrador validado en `sessionStorage` de esa pestaña durante hasta 30 minutos, vinculado al profesional y perfil. Incluye servicio, duración, fecha/hora o preferencia alternativa, lugar, dirección y nota. No se ponen esos datos en la URL. Al volver, se espera a resolver la sesión, se abre el formulario, se consume el borrador y se quita el marcador de regreso. Nunca se envía automáticamente: el cliente debe revisar y pulsar Enviar solicitud. La API sigue comprobando permisos, horarios y conflictos.

Si no puede guardarse el borrador, la navegación se detiene con un error y se conserva el formulario en pantalla. El aviso de inicio de sesión recibe foco y se desplaza a la vista: en iPhone quedaba debajo del formulario sin verse al enviar.

Login ahora reconoce exclusivamente la continuación explícita de cita a la ruta de profesionales. Se conserva el comportamiento anterior de los demás destinos. El regreso utiliza la ruta larga real también en inglés; la dirección corta inglesa que muestra el perfil daba 404 al abrirla de nuevo.

La prueba en frío descubrió además que Login tenía un formulario HTML GET activo antes de hidratar. Se declara POST y se deshabilitan sus campos y envío hasta que el runtime esté listo. No se alteran credenciales, políticas de autenticación, MFA ni permisos. El problema se reprodujo únicamente con cuentas desechables locales; los logs/trazas fallidos con esas credenciales no se incluyen en el repositorio.

## Pruebas y conservación

Selección: cambio en formulario público y continuidad del login compartido. Probar autenticación real local en ambos idiomas, formulario sin JavaScript antes de hidratación, solicitudes/confirmación/cancelación, reprogramación y recorrido solicitud→cotización→trabajo. WebKit móvil y Chromium móvil; sin modificar marca ni navegación global. Reutilizar contratos SQL/RLS anteriores porque sus entradas no cambiaron. Política propia/documentación Pro y política de main leídas; main no modificado.

18 resultados distintos por caso/navegador aprobados. Ocho son acceso/conservación/hidratación; diez corresponden a los recorridos dependientes. La ejecución combinada inicial fue 17/18: una recarga de cotización en Chromium terminó en la pantalla de recuperación de sesión; la traza muestra verificaciones de sesión abortadas. No se reprodujo al aislar ese caso. Se reforzó la sincronización del test esperando URL con ID y botón del detalle guardado antes de recargar; antes el texto del servicio también coincidía con el editor aún abierto. Se conservan todas las aserciones y la recarga, sin alargar tiempos ni debilitar el gate de sesión. El caso final pasó en ambos motores. La evidencia se compone de 16 aprobaciones independientes y esas dos finales; no se presenta la ronda inicial como íntegramente verde.

La nueva prueba guarda realmente una solicitud después de login por contraseña y verifica que no existe antes del envío explícito. Español comprueba un horario disponible y 120 minutos; inglés, horario alternativo, fecha y preferencia. Ambos conservan servicio, dirección y nota. También se verifica que el borrador se elimina y los datos privados no aparecen en la URL del acceso.

TypeScript, lint de archivos afectados, presupuesto bilingüe (427/65), UTF-8, diff-check y build optimizado local: aprobados. Guardas de desarrollo se conservan. Servidor de desarrollo restaurado en 127.0.0.1:3185 con push deshabilitado.

Conservación: 78 tablas, 626 filas originales idénticas y registros demo previos intactos. Quedan 58 filas demo registradas, frente a 51 previas: se agregaron exclusivamente dos actores ficticios y su recorrido del simulador. Registro privado `/tmp/pro-appointment-login-native.json`, nunca incluido aquí porque contiene credenciales ficticias. Profesionales previos no activados, no se tocaron sus citas/horarios. Las cuentas automatizadas se limpiaron; cero cuentas interrumpidas sobrantes.

## Simulador real

Safari privado del iPhone 17 Pro/iOS 26.5, loopback: perfil ficticio, apertura de solicitud, selección de horario alternativo, aviso de login visible, acceso por contraseña sin guardarla en Llavero y reapertura de solicitud con opción conservada. Se escribió `PRUEBA_LOCAL` después de ingresar, se pulsó Enviar y se abrió el detalle persistido: Por confirmar e historial Solicitud enviada. Se contrastó en la base local la misma solicitud, cliente, profesional y preferencia. El botón 120 minutos también se probó visualmente antes del recorrido final; la solicitud manual final usa 60 minutos. La conservación de todos los campos escritos antes del login se demuestra en los E2E completos, no se atribuye al recorrido manual simplificado.

El teclado remoto inicialmente no escribía; conectando el teclado físico del simulador y enviando caracteres individualmente fue posible completar el acceso. No se eludió autenticación. Las capturas guardadas en la carpeta de evidencia son de Playwright; la revisión nativa se mostró directamente en el chat.

## Recordatorios y push: revisión, todavía pendientes de conectar

El código ya tiene `notification_push_outbox`, worker con reintentos/deduplicación y registro de tokens. Sin embargo, las nuevas solicitudes Pro no insertan notificaciones de citas ni programan recordatorios. Por tanto esta prueba no certifica push móvil.

Continuación recomendada, reutilizando ese transporte:

1. Avisar al destinatario correcto al solicitar, proponer, confirmar, reprogramar o cancelar, enlazando a la misma cita autenticada; evitar avisar al actor de su propio cambio.
2. Programar recordatorios solo para citas confirmadas y futuras. Una reprogramación debe invalidar los del horario anterior; una cancelación debe detenerlos. Definir preferencia de usuario y evitar duplicados por evento/revisión/destinatario.
3. Mostrar texto breve sin notas privadas ni dirección en la pantalla bloqueada. Mantener la campana aunque no exista permiso/token móvil.
4. Probar primero con reloj y transporte simulados, sin enviar; después validar entrega y apertura en una instalación móvil de pruebas cuando corresponda. No prometer entrega real basándose en Safari del simulador.

Límites: se ha probado login por contraseña en la misma pestaña. No se afirma validación de Apple/Google externos, cierre de pestaña, cambio de dispositivo o borrador que supere los 30 minutos. La integración fiscal, publicación y habilitación pública de Pro siguen fuera de esta ronda.

Evidencia: `research/2026-11-05/appointment-login/`.

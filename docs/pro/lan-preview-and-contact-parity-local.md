# Vista local desde el celular y comparación de citas

Rama: `local/pro-suite-no-push`. HEAD conservado: `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`.
Trabajo local existente conservado. Sin commits, push, merges, migraciones, despliegues ni comunicaciones reales.

## Comparación de código

Referencia de main disponible localmente: `bb18d2875ed5709cf972debd8a2102cfdaab237f`. Es una comparación de código, no una afirmación de haber certificado el despliegue público actual.

- `a737cf75`: disponibilidad pública / privada, tres columnas y acciones condicionales.
- `97d87dbf660d0d12b7a6e2b131d0890936238f36` (`28cd2273^`): calendario anterior al apagado, ventanas por pasos; la ficha en esta variante también mostraba contacto.
- `354b6e6a`: código anterior a la eliminación de Citas, pero con accesos ya apagados. No se toma como última versión pública funcional.
- `5590123a`: eliminación del sistema anterior.

El historial tiene variantes diferentes; no se restaura un commit entero ni se mezcla main. Se aplica la decisión actual del usuario: con reservas habilitadas, los horarios y «Ver disponibilidad» sustituyen WhatsApp/llamada en la ficha y tarjetas. Si están deshabilitadas, se conserva el contacto actual y el permiso de llamada. Mientras se consulta la configuración no se muestran fugazmente las dos alternativas.

Los horarios vuelven a tres columnas, botones claros y flechas entre grupos. La acción principal de la ficha usa el pie compartido existente. Las ventanas muestran el profesional y una flecha para volver al calendario conservando los detalles. Se elige el primer día disponible incluso si la respuesta llega después de abrir. Al cambiar de mes se limpia la hora anterior; no se muestra una fecha deshabilitada como seleccionada.

La campana conserva su comportamiento previo en las superficies existentes. Las herramientas nuevas `pro_*` y Citas publican el estado de cabecera interna sin campana; no se cambia el contenido de notificaciones ni se borra su acceso principal.

Se mantienen el almacenamiento, la confirmación y la recuperación del borrador después del login ya implementados. Este ajuste visual no reintroduce reservas sin cuenta, sedes/calendarios separados por servicio ni videollamadas del sistema retirado.

## Abrir desde el celular

Desde el checkout Pro, con Supabase local ya iniciado y sin otro Next escuchando en 3185:

```sh
node scripts/pro/dev-lan.cjs 192.168.40.5
```

Abrir `https://192.168.40.5:3443` en Safari o Chrome del celular, conectado a la misma red. La Mac debe estar encendida. La IP puede cambiar; el lanzador acepta otra IPv4 privada que pertenezca a esta Mac. No abre puertos del router ni usa túneles públicos.

El certificado autofirmado queda con su clave privada en `.env.pro-lan-cert/`, ignorado por Git. No se instala confianza automáticamente: el usuario debe revisar/aceptar el aviso local en su teléfono. Certificado válido por 30 días; al renovarlo puede volver a pedir aceptación. No usar contraseñas de producción: son cuentas y datos locales de prueba. Esta ronda prueba acceso por contraseña; no certifica OAuth, correos de acceso, notificaciones push ni la app nativa instalada.

El proceso sirve HTTPS/HTTP2 en la IP privada y mantiene Next en `127.0.0.1:3185`. Supabase del servidor continúa en `127.0.0.1:54321`; las llamadas del navegador pasan por el mismo origen bajo `/__local_supabase`. No expone la clave de servicio, PostgreSQL ni Studio a través del gateway. Solo admite las rutas públicas de Auth, REST, Storage y Realtime; bloquea Auth Admin. Las comprobaciones de sesión, RLS y origen siguen activas. El lanzador rechaza un `.env.test` que no apunte exactamente al Supabase local y desactiva la entrega push.

El cambio del cliente Supabase está limitado a `NODE_ENV=development`, origen HTTPS configurado y backend loopback. El nombre de cookie se conserva para que el servidor pueda leer la sesión. El gateway normaliza únicamente su propio Origin hacia el listener interno HTTP; otros orígenes se conservan para rechazarlos. Se ajustan únicamente redirecciones absolutas del listener local hacia el origen HTTPS. WebSockets permiten HMR y Realtime.

## Selección de pruebas y resultados

Impacto: entrada local HTTPS, sesión del navegador, cabecera de herramientas y recorrido público de citas. Se amplió a inicio de sesión real, escritura/lectura de un cliente desechable, rechazo de origen ajeno, alternativas de contacto, cabeceras, borrador después de login ES/EN y marca compartida en tres tamaños/motores. No se repitieron suites fiscales ajenas ni contratos SQL de horarios, cuyos inputs no cambiaron.

- Gateway: Safari/WebKit móvil y Chromium móvil verifican login por el proxy local, contexto seguro, UUID disponibles, sesión leída por API, guardar cliente y persistencia después de recargar; cuenta y datos de cada prueba se eliminan al terminar.
- Citas: pruebas ES/EN de reserva y solicitud de otro horario, recuperación tras login y campos protegidos antes de hidratar.
- Marca: script de contrato aprobado y E2E de cabeceras aprobado en Chromium escritorio, Chromium móvil y WebKit móvil. No se cambió el dibujo del logo.
- Conservación: 78 tablas; 626 filas originales idénticas y 64 filas de demostración anteriores conservadas. El chequeo lanzado mientras había una prueba activa detectó su disponibilidad temporal; después de finalizar/limpiar las pruebas pasó sin cambiar la aserción ni restaurar filas.
- Diagnóstico LAN: la primera implementación HTTP/1.1 fallaba al cargar estilos en los navegadores de prueba. Se corrigió con HTTP/2, conservando HTTP/1.1 para WebSockets. Una navegación de WebKit fue interrumpida por la canonicalización previa; se utilizó el helper de navegación existente, sin relajar aserciones de producto.
- Simulator nativo: se observó el perfil con horarios y una sola acción, se abrió la ventana y los detalles de 120 minutos, y se comprobó que la flecha devolvía al calendario manteniendo la selección. No se creó otra reserva manual en esta ronda. Esto no equivale a una prueba física en el teléfono del usuario.

Evidencia y resultados finales: `research/2026-11-05/lan-contact-parity/`. No se da por comprobada la conexión física del teléfono hasta que el usuario abra el enlace desde su red.

## Cierre verificado

- Gateway final: 2/2, Safari/WebKit y Chromium móviles, incluida escritura y recarga de cliente.
- Citas final: 8/8 ES/EN en ambos motores móviles tras el ajuste de selección inicial y cambio de mes.
- Ronda previa compatible para marca: 15/15 (incluye 3 pruebas de marca y casos de citas en tres proyectos; no sumar los casos repetidos como cobertura nueva).
- Build optimizado final: salida 0. TypeScript final: salida 0. El chequeo independiente de tipos se repitió secuencialmente porque la ejecución simultánea con build había observado archivos generados durante su reemplazo.
- Lint: sin errores; dos advertencias preexistentes de dependencias de hooks en ProfessionalSchedule. Presupuesto bilingüe aprobado (427 ocurrencias en 65 archivos).
- Conservación final aprobada después de completar las pruebas y limpiar exclusivamente sus actores desechables.
- Gateway activo al cierre; `/login` respondió 200 por HTTPS. La comprobación física desde el celular del usuario sigue pendiente.

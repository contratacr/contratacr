# Historial de versiones móviles

Mantener este registro antes de cada envío a App Store y Google Play. Confirmar los datos en la tienda al publicar: versión pública, número de compilación nativa, plataforma, commit, fecha y estado, pruebas realizadas y texto exacto de novedades por idioma. Los despliegues de la web compartida se registran aparte; no representan una nueva versión de tienda.

## Registro inicial confirmado por la captura del usuario

### iOS 1.0.10

La captura del historial de App Store muestra esta versión publicada. La fecha exacta, compilación y commit de ese binario deben recuperarse de App Store Connect antes de completar esos campos; no deducirlos de «hace 11 horas».

Novedades en español mostradas:

> Ahora recibes las notificaciones de tus mensajes y proyectos en el iPhone, y puedes guardar tu contraseña al ingresar. Además, mejoras de seguridad y estabilidad.

### iOS 1.0.8

Primera versión visible en el historial de la captura. Sin texto de novedades. Apple indica que el campo «What's New in this Version» no está disponible para la primera versión de una app; es obligatorio para las posteriores. La fecha exacta, compilación y commit del binario quedan pendientes de confirmar.

Fuente: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/

## Plantilla para próximos envíos

- Plataforma y versión pública:
- Compilación nativa:
- Commit del binario:
- Estado y fecha exacta de publicación:
- Pruebas y evidencia:
- Novedades ES (texto enviado):
- Novedades EN (texto enviado, si corresponde):

No anunciar cambios que todavía no se hayan incluido y probado. No cambiar la numeración publicada para que empiece en 1.0.0. Mantener números ascendentes y separar el número de versión del número de compilación.

## Preparación de descarga de archivos — 14 de octubre de 2026

Estado: código preparado y validado; **no enviado ni publicado en las tiendas**. Versión pública y compilación del próximo envío: pendientes de asignar. No confundir con el despliegue web compartido.

- Incluye Filesystem y Share para guardar/compartir los adjuntos del chat sin abrir la URL de Supabase.
- iOS: compilación Debug de simulador correcta y XCUITest abrió la hoja nativa con vista previa de la imagen y «Save Image». Se añadió el motivo de acceso a fechas de archivos C617.1 y el texto para guardar imágenes en Fotos.
- Android: compilación Debug correcta y prueba ADB/UI Automator abrió «Sharing image» con la vista previa. La prueba descubrió un cierre por el runtime Kotlin 1.8.22; al alinearlo con 2.2.20 se comprobó nuevamente la apertura de la hoja sin cierre.
- La app de QA usó un identificador distinto; no reemplazó las apps instaladas del usuario. El ensayo del archivo usó un logo público, sin mensajes privados.
- Antes de enviar: asignar versión y build, construir binarios de distribución, registrar su commit, validar firma/enlaces/notificaciones y copiar las notas exactas enviadas a las tiendas.

Notas propuestas ES (todavía no enviadas): «Ahora puedes guardar y compartir archivos del chat desde la app. También mejoramos la estabilidad.»

## Candidatos 1.0.11 — 16 de octubre de 2026

Estado: **compilados localmente, no subidos ni enviados a revisión**. Validación en curso; no autorizados todavía para envío.

- Android: versión 1.0.11, versionCode 15; AAB y APK release firmados con la clave de carga existente. Google Play conserva 1.0.10 / 14 en producción, confirmado por Android Publisher API.
- iOS: versión 1.0.11, build 16; archive e IPA exportados localmente. IPA con firma verificada, push production, Sign in with Apple y associated domains; get-task-allow=false. App Store conserva 1.0.10; último build existente 15, confirmado por App Store Connect API.
- Commit de fuente de ambos binarios: `b77609dc4815a44755211c5300eac4c3ef976c45`.
- Artefactos locales: `mobile-builds/1.0.11/`; SHA-256 y tamaños registrados en `candidate-manifest.json` (no versionar binarios ni credenciales).
- Correctos: mobile:sync, mobile:validate, Android lintRelease/testReleaseUnitTest/bundleRelease/assembleRelease, iOS archive/export y compilación e instalación de simulador.
- Android API 36 con Google Play: candidato QA muestra bienvenida actual; Apple abre su formulario oficial. Pendiente completar autenticación y observar retorno con sesión iniciada. QA usa firma debug y no equivale a un binario firmado por Google Play.
- Ronda completa web inicial: https://github.com/contratacr/contratacr/actions/runs/39001658068 — 1.652 correctas, 151 omisiones previstas, 3 fallos y cero flakies. Corregidos el cambio de pestaña por recarga tardía y la redirección doble tras registro; ajustado el selector del video activo. Las 12 comprobaciones focales pasan en Chromium desktop/móvil y WebKit móvil. La prueba nueva de recarga tardía falla con el código anterior y pasa con la corrección. Nueva ronda completa sobre 69e6c988: https://github.com/contratacr/contratacr/actions/runs/39004077272 (pendiente de concluir).
- Ronda completa móvil correcta: https://github.com/contratacr/contratacr/actions/runs/39001660173 — contratos, Android nativo, compilación/arranque de iOS y WebView/chat correctos (130 pruebas, 2 omisiones previstas). La ronda usa ae310a88, mismo código nativo previo al incremento de versión.
- Pendiente antes de declarar listos: cerrar rondas, resolver cualquier fallo y completar retorno real de Apple en Android. Las pruebas automáticas de aislamiento no reemplazan esta prueba con proveedor real.

Novedades propuestas ES (no enviadas): «Ahora puedes guardar y compartir archivos del chat desde la app. También mejoramos el acceso y la estabilidad.»

Novedades propuestas EN (no enviadas): «You can now save and share chat files from the app. We also improved sign-in and stability.»

### Autorización de envío y preparación en tiendas — 16 de octubre de 2026

Isaac autorizó promover ambas versiones a las tiendas. La autorización anterior de no subir versiones queda reemplazada. El envío final a revisión sigue condicionado a cerrar las pruebas pendientes; no se ha declarado aprobación ni publicación.

- App Store Connect: creada versión 1.0.11 (`6b0f42aa-07c6-4d0b-8ad7-e2b98f584a19`) en PREPARE_FOR_SUBMISSION, con publicación AFTER_APPROVAL. Conserva las 6 capturas de iPhone y las 6 de iPad, datos de revisión y cuenta demo existentes. Novedades es-MX guardadas: «Ahora puedes guardar y compartir archivos del chat desde la app. También mejoramos el acceso y la estabilidad.» Altool validó y subió el IPA sin errores (delivery `9d7688e9-1693-403c-9988-ed8433f5f70f`); build 16 procesado VALID y asociado a la versión 1.0.11.
- Google Play: AAB 15 cargado y huella SHA-256 comprobada con el manifiesto local. Release 1.0.11 preparado y validado en estado draft; el release publicado sigue siendo 14 / 1.0.10. La API rechazó `changesNotSentForReview=true` porque enviaría los cambios automáticamente a revisión. Se conserva la edición sin confirmar hasta cerrar las pruebas; no se reintentó sin esa protección. Novedades es-419: mismo texto ES anterior.
- Pendientes: resultado de carga/procesamiento Apple, ronda completa 39004077272 y acceso Apple real en Android. El emulador sigue en el formulario vacío; se pidió completar allí cuenta y seguridad. No confundir sesión de App Store Connect con inicio de sesión del usuario dentro del emulador.

### Comprobación Apple Android tras intervención del titular

Apple completó autenticación, pero la pantalla final observada fue onboarding dentro del Custom Tab de Chrome. Al cerrarlo, la app seguía en login: **no se considera un acceso nativo correcto**. Se abrió un intento nuevo desde el botón nativo y se pidió completar Apple dejando abierta la pantalla final. El log de ese intento confirma provider Apple con desafío PKCE, callback `/auth/callback`, flow=android-apple y native_state (no se guardaron ni imprimieron tokens, códigos ni verificadores). La lista de Supabase ya permite el callback y `https://contratacr.com/**`; no se cambió configuración de autenticación. El callback de producción devuelve la página de retorno nativo y no-store con un código sintético. Pendiente observar callback real y sesión en WebView; Android permanece sin enviar a revisión.


### Cierre de acceso Apple Android y ajustes compartidos — 17 de octubre de 2026

- Acceso real Apple en el candidato Android 1.0.11 / 15 completado: el titular terminó la autenticación, se pulsó «Volver a ContrataCR» y la WebView nativa mostró la selección de rol con la sesión iniciada. No se seleccionó rol ni se alteró el perfil de prueba. Esta observación resuelve el pendiente anterior del Custom Tab.
- Rondas previas finales: Regression Tests 39006959945, Mobile Native Regression 39006966502 y Cloudflare Compatibility 39006966491, todas correctas.
- Fuente compartida 8d0ec177439d7818400ada1f37f2f40c1ffa7a0e: logo principal en el retorno, saludo neutro cuando Apple no proporciona nombre, nombres públicos unificados y archivo de cotización con el nombre público. Cambios web; los binarios siguen correspondiendo a b77609dc4815a44755211c5300eac4c3ef976c45.
- Comprobaciones focales: 24 contratos de autenticación, 6 de presentación ES/EN, 3 de marca y 9 de descarga de PDF correctas; presentación y PDF en Chromium escritorio/móvil y WebKit móvil. TypeScript y contratos nativos correctos. Contrato de nombres/saludos añadido a CI.
- Envío a revisión: todavía pendiente de confirmar en ambas tiendas; estos resultados no representan publicación ni aprobación. Notas localizadas conservadas sin cambios.


### Envío autorizado 1.0.11 — 17 de octubre de 2026

Preparación final guardada antes de confirmar revisión. Isaac solicitó «Listo pública las apps».

- Android: 1.0.11 / versionCode 15, AAB SHA-256 `c1e1365caf111e8c742e6245541710c58301289fc20a9ee9f0d8fc8c9134901e`; archivo firmado ya validado por Google. Edición de producción `12909794691350314744`, release completed preparado y validado sin confirmar todavía. No confundir ese estado interno de edición con publicación visible.
- iOS: 1.0.11 / build 16, IPA SHA-256 `f64ecfc52cb5c3f6dd810e58068646abfe47b142b89b0079ef7da67d59c6d307`; build procesado VALID, 12 capturas COMPLETE. Submission `e42a843f-a291-4a85-8452-74f6212f377c` creado READY_FOR_REVIEW con la versión correcta, pendiente de submit. Publicación automática AFTER_APPROVAL.
- Fuente del binario en ambas plataformas: `b77609dc4815a44755211c5300eac4c3ef976c45`. Fuente web compartida `8d0ec177439d7818400ada1f37f2f40c1ffa7a0e`; mobile `ad9631723372da99a2d531042f46a67841c3e2b1`.
- Seguridad y Cloudflare correctos. Esperando Regression Tests 39008680704 y Mobile Native Regression 39008679014 para confirmar los envíos; la ronda anterior y comprobaciones focales ya pasaron.
- Notas exactas es-MX (Apple) y es-419 (Google): «Ahora puedes guardar y compartir archivos del chat desde la app. También mejoramos el acceso y la estabilidad.» No se añadió localización EN al envío.
- Fecha de publicación efectiva: pendiente de aprobación de cada tienda; no registrar como publicada antes de confirmarla.


Cierre del control previo al envío: Regression Tests 39008894531 correcto (182 passed, 14 omisiones previstas) y Mobile Native Regression 39008679014 correcto (130 passed, 2 omisiones previstas). Los jobs nativos de emulador/compilación no se repitieron en este push porque el código nativo no cambió; la ronda nativa completa anterior permanece registrada. Inventario actualizado en fuente compartida `7db6661546c949904705f3d946e577a89c333a96`. Sin fallos pendientes en estas ejecuciones.


### Confirmación de envíos — 17 de octubre de 2026, 00:25 Costa Rica

- Apple: `PATCH /v1/reviewSubmissions/e42a843f-a291-4a85-8452-74f6212f377c` con submitted=true aceptado. Submission y versión 1.0.11 confirmados WAITING_FOR_REVIEW; build 16 y releaseType AFTER_APPROVAL. Todavía no publicada.
- Google: edición `12909794691350314744` validada nuevamente y confirmada con ERROR_IF_IN_REVIEW, sin changesNotSentForReview. Commit aceptado. Play Console confirmó «Cambios en revisión», Producción 1.0.11, «Iniciar lanzamiento completo» y publicación gestionada desactivada. A las 00:25 mostraba comprobaciones rápidas automáticas previas (hasta 14 minutos indicados por Google); al completarse se envía a revisión automáticamente. No se confunde el commit ni ese plazo con aprobación o disponibilidad pública.
- Fuente web final compartida: `7db6661546c949904705f3d946e577a89c333a96`; mismo código de aplicación comprobado en 8d0ec177, más actualización del inventario. Fuente de binarios y notas exactas conservadas como arriba.
- Pendiente externo: comprobaciones/revisión de las tiendas y aprobación. No queda un botón manual de publicación configurado, ni una acción pendiente del titular observada durante este envío.


### Publicación Android confirmada — 17 de octubre de 2026

Google Play Console mostró «Se ha publicado la actualización de la aplicación» y «Última publicación el 17 de octubre de 2026». Android Publisher API confirmó producción 1.0.11 / versionCode 15 en completed con las notas es-419 exactas registradas arriba. No se inventa una hora de publicación: la consola consultada confirma la fecha. Puede tardar en propagarse a cada dispositivo.

En la misma consulta, App Store Connect conservaba iOS 1.0.11 / build 16 WAITING_FOR_REVIEW y AFTER_APPROVAL. Las notas es-MX guardadas coinciden exactamente con las de Android. Pendiente únicamente aprobación/publicación de Apple en el flujo de envío actual.


### Preparación local 1.0.12 — 21 de octubre de 2026, sin envío

Isaac autorizó preparar la actualización nativa y prohibió subir versiones a las tiendas. Estado: preparación local; no se creó versión, edición, revisión ni publicación en App Store Connect o Google Play. No hay fecha de publicación.

- Android: 1.0.12 / versionCode 16. iOS: 1.0.12 / build 17.
- Incluye los dominios contratacr.com y www.contratacr.com, los enlaces exactos de inicio de Android y la relación inversa necesaria para la detección compatible de Chrome. El código compartido usa un único aviso inferior personalizado, también en Safari, y conserva la alternativa de tienda.
- Se conservan las diferencias nativas previamente aprobadas de mobile. Los controles de medición y privacidad no se relajan para esta preparación.
- Notas propuestas ES (solo locales): «Mejoramos la apertura de enlaces desde la web y la navegación en la app.» No se han guardado en las tiendas.
- Antes de un envío autorizado: comprobar las pruebas físicas de iPhone con y sin la app, revisar los paquetes firmados y confirmar el alcance final y las notas. La configuración de enlaces de la versión anterior instalada no cambia por desplegar la web.

Validación local: Android compiló APK de QA, APK release y AAB; firmas release verificadas y 7/7 pruebas instrumentadas de resolución de enlaces aprobadas. iOS compiló en simulador, archivó para dispositivo y exportó IPA local con firma válida, versión 1.0.12/17 y ambos dominios asociados. La CDN de Apple confirma la asociación correcta en ambos hosts. Paquetes conservados en mobile-builds/app-entry-preparation-2026-10-21 (ignorado por Git); no se subieron. Pendientes: pruebas físicas de apertura con instalación/ausencia y verificación de dominios con firma de distribución de Google Play antes de un envío autorizado.

Corrección web posterior, autorizada el 21 de octubre de 2026: Safari usa solo el aviso de Apple; los demás navegadores y el acceso web añadido a inicio conservan el inferior personalizado. Esta decisión reemplaza la mención anterior de aviso personalizado en Safari. No cambia el código nativo compilado, las versiones ni el estado local de los paquetes 1.0.12; no se envió nada a las tiendas.

Preparación y regresión, 21 de octubre de 2026: corregido el margen del compositor de mensajes con teclado (16 px; se conserva el área segura), etiquetas del panel mediante traducciones y selección de Safari por navegador en las pruebas. La prueba integrada del asistente comprueba el borrador sin envío automático, el envío explícito único y la conversación resultante, en ES/EN y ambos motores. Validación local: 18 pruebas de límites/traducciones admin, 14 comprobaciones del aviso en configuración móvil y 4 recorridos integrados de chat aprobados. Las suites generales se vuelven a ejecutar desde una base aislada en GitHub; sus resultados finales y los hashes de los paquetes se conservan en candidate-manifest.json local.

Los paquetes 1.0.12/16 Android y 1.0.12/17 iOS no cambian sus entradas nativas con estas correcciones de la web compartida. El iPhone conectado conserva 1.0.11/build16; solo se consultó su versión y no se instaló ni eliminó nada. Sigue pendiente comprobar la nueva versión en dispositivos de distribución, con y sin instalación, y autorizar por separado el envío a las tiendas.

Cobertura adicional de preparación: el recorrido de chat incluye un borrador largo con crecimiento del campo hasta 144 px, mantiene el espacio exterior acotado y comprueba 16 px o más respecto al teclado antes y después del envío. Cuatro recorridos ES/EN aprobados localmente; se repite la suite móvil completa. Este ajuste posterior solo modifica pruebas/inventario, sin cambiar el código de aplicación certificado por la ronda general compartida.

Certificación móvil del 21 de octubre de 2026: [Mobile Native Regression 39714952139](https://github.com/contratacr/contratacr/actions/runs/39714952139), revisión 41a0b969e733bd1794d25f6eca3275b4c522f5e5, aprobada: 136 pruebas y 4 omisiones de plataforma (dos de escritorio y dos de iPhone dentro de Android). La sincronización de cierre solo modifica pruebas web/TEST remoto y el inventario; se comprobó que la aplicación, configuración, ayudantes y todos los casos seleccionados por la suite móvil son idénticos a esa revisión certificada. La prueba de identidad exclusiva de TEST remoto se ejecutó además en los tres motores con un identificador sintético por cuenta. No se han subido paquetes a las tiendas.

Cierre de regresión general del 21 de octubre de 2026: [Regression Tests 39715698884](https://github.com/contratacr/contratacr/actions/runs/39715698884), revisión ede13b20354a6cdf85e4db63b56906f1e689f54a, aprobada. Bloques de navegador: registro Safari 13 correctas; registro/autenticación 88; navegación del asistente 98; Safari/asistente/insignias 76 y 4 omisiones previstas; rutas e interfaz en Chromium escritorio/móvil 537 y 31 omisiones previstas. Cero fallos, flakies u omisiones inesperadas; migraciones desde cero, contratos de aislamiento, tipos, lint, traducciones, compilación y relaciones finales correctos. Son ejecuciones por bloque, con cobertura solapada, no un total de casos únicos. Las omisiones corresponden a plataforma y a un caso exclusivo de TEST remoto, ejecutado aparte y aprobado en los tres motores. La revisión compartida final 188da9bec8265dcc291c0b1399fa3dca636619ac conserva la misma aplicación y los cuerpos de pruebas ejecutados por esta CI; solo cambia ese caso de TEST remoto y el inventario. Los despliegues y seguridad finales de main/test y la compatibilidad de mobile aprobaron.

Estado de entrega: paquetes firmados 1.0.12 preparados y hashes comprobados; sin nuevos envíos a tiendas. Antes de solicitar revisión siguen pendientes las pruebas físicas del candidato instalado/ausente, la resolución de enlaces con la firma de distribución de Google Play y una autorización expresa para subirlos. El manifiesto local contiene los resultados y la lista de comprobaciones.


### Candidato final 1.0.12 — 24 de octubre de 2026, sin envío

- Fuente móvil: `602246a079719f698ad112138458cc670b5c3eb9`; web compartida: `a4767c439bf7864433d863e4d9c95a5c374b2ff7`. Android 1.0.12 / 16; iOS 1.0.12 / 17. No se subieron paquetes, crearon revisiones ni publicaron versiones.
- Paquetes finales en `mobile-builds/final-2026-10-24/`: AAB y APK release firmados, IPA App Store exportado y firma verificada. IPA adicional para pruebas de distribución instalado en el iPhone físico, con APNs production y get-task-allow=false. Cinco hashes SHA-256 comprobados y guardados en `candidate-manifest.json` local.
- Android: lintRelease, testReleaseUnitTest, compilaciones release/debug y 13 pruebas instrumentadas aprobadas. En emulador Google Play Android 16, Firebase aceptó y Android mostró avisos con la app abierta, en segundo plano y retirada de recientes. Se usaron un APK QA debug y una cuenta local desechable; no certifica un teléfono físico ni la firma de distribución de Google Play. Retirar de recientes no equivale a force-stop.
- iOS: archive y exportaciones App Store/pruebas de distribución aprobados. Compilación, instalación y arranque en simulador aprobados. En iPhone 16 Pro físico con candidato 1.0.12/17, Firebase aceptó los tres avisos dirigidos exclusivamente al titular; este confirmó recepción visible con la app abierta, en segundo plano y cerrada desde el selector. No se enviaron avisos a otros usuarios ni se reprodujeron campañas antiguas.
- CI general 40117514931 y móvil 40117514628 aprobados antes de generar estos paquetes. Los jobs nativos omitidos en CI no se consideran ejecutados; la validación local anterior se registra por separado. Readiness Firebase desplegada aprobada en producción 40118061411 y TEST 40118063582, sin envíos.
- Pendientes antes de publicar: autorización expresa de subida, comprobación de enlaces con firma de distribución Google Play y cobertura en Android físico. La validación de notificaciones no certifica por sí sola todos los enlaces ni todos los fabricantes.
- Notas propuestas ES, solo locales: «Mejoramos la apertura de enlaces desde la web y la navegación en la app.»
- Notas propuestas EN, solo locales: «Improved links from the website and navigation in the app.»

### Candidato corregido 1.0.12 — 25 de octubre de 2026, sin envío

- Fuente nativa: `c927aa6fac058f23ef3a0586d3764f542d61bc6c`; compartida: `1502d2e412a606b5e7e149fe29b155db059787d0`. Android 1.0.12/16 e iOS 1.0.12/17. Paquetes regenerados en `mobile-builds/final-2026-10-25/`, con SHA-256 en el manifiesto local. No se subieron versiones ni se reenviaron notificaciones.
- Enlaces: perfiles cortos, alias y rutas localizadas normalizados; Android separa los enlaces de la app de autenticación y navegador. La prueba dentro de Android verifica inicio en frío, reapertura del mismo enlace, un segundo enlace y conservación de sesión.
- Avisos: títulos completos y acciones específicas en ES/EN. Prueba real en WebView Android con cuenta local y aviso suprimido para push; cuatro recorridos de disposición móvil y 58 comprobaciones de enlaces/avisos aprobados (20 omisiones de plataforma).
- Android: lint, pruebas unitarias, AAB/APK release y 16 pruebas instrumentadas aprobados. Firma de carga verificada; no sustituye probar la distribución firmada por Google Play. iOS: archive, exportación App Store y ad hoc, firmas y arranque en simulador aprobados. Las pruebas físicas de push del 24 se conservan como evidencia anterior, no como nuevos envíos.
- Pendientes de cierre: CI final general/móvil, propagación AASA de Apple y confirmación física de enlaces finales. No se declara aprobada la distribución en tiendas.
- Notas propuestas ES (locales): "Mejoramos los enlaces compartidos y la claridad de las notificaciones."
- Notas propuestas EN (locales): "Improved shared links and clearer notifications."

### Cierre de validación previo al envío — 25 de octubre de 2026

El titular autorizó subir iOS 1.0.12/17 y Android 1.0.12/16 cuando se resuelvan los fallos pendientes. Todavía no se han subido ni enviado a revisión. App Store Connect confirma iOS 1.0.11/build16 distribuida; Google Play no muestra cambios pendientes y conserva la publicación del 17 de octubre.

- Fuente del binario conservada: `c927aa6fac058f23ef3a0586d3764f542d61bc6c`. Los cambios compartidos posteriores no modifican las entradas nativas de esos paquetes.
- Corrección compartida `a9564fc4e2d29daed40924360f0e0176f6b88419`: las exclusiones AASA de rutas anidadas requieren un segundo segmento no vacío. La base de asociaciones de iOS normaliza rutas con barra final; la exclusión anterior también alcanzaba un perfil corto. La prueba falla antes en los tres prefijos y pasa después, conservando las exclusiones de autenticación y recursos. Producción ya devuelve el archivo nuevo; la CDN de Apple conservaba el anterior al revisarla. Falta demostrar apertura con la asociación actualizada en simulador y teléfono, no basta con el archivo del servidor.
- Corrección compartida `3358f021`: reloj inicial de proyectos estable entre servidor y cliente, espacio para el área táctil del sello en el título público, y pruebas ajustadas a los controles actuales sin retirar la comprobación funcional. La regresión exhaustiva 40198511807 había encontrado estos fallos; no se considera aprobada. 25 comprobaciones focalizadas pasaron; el caso de ancho del buscador pasó por separado. Dos intentos del grupo de búsqueda no arrancaron por ausencia de los actores canónicos en la base local compartida; CI reconstruye sus propios datos aislados.
- Pendientes: CI general, exhaustiva y móvil del cierre; CDN y apertura física del enlace corto; comprobación del candidato firmado por Google Play. Apple además exige al titular aceptar el acuerdo Developer actualizado; se le notificó y no se aceptó por él.
- Novedades ES previstas, sin enviar: "Mejoramos los enlaces compartidos y la claridad de las notificaciones."
- Novedades EN previstas, sin enviar: "Improved shared links and clearer notifications."


### Preparación de envío 1.0.12 — 26 de octubre de 2026

Autorización vigente del titular: continuar con Google Play y App Store después de aprobar CI, sin repetir pruebas innecesarias. Estado al guardar este registro: preparación; no se han subido paquetes ni enviado a revisión y no hay fecha de publicación.

- Android: 1.0.12 / versionCode 16, `mobile-builds/final-2026-10-25/ContrataCR-1.0.12-16.aab`, SHA-256 `e13a0882980b0d128f3006fd1d2d465a57cf29185c777bc5ed59f269e6ad11f1`. Se reutiliza el AAB firmado de carga, nunca el APK QA.
- iOS: 1.0.12 / build 17, `mobile-builds/final-2026-10-25/ios-store-export/App.ipa`, SHA-256 `46eeae1758ebc5c2fdd2ba19c0ddd23988e3701d3d11198e7ff187bbf2f72308`. Firma y entitlements verificados: `LPB3Q4LJ5Z.com.contratacr.app`, APNs production, applinks apex/www y get-task-allow=false.
- Fuente nativa de ambos paquetes: `c927aa6fac058f23ef3a0586d3764f542d61bc6c`. Se comprobaron los hashes y la ausencia de diferencias en android/, ios/, capacitor.config.ts y package*.json respecto de esa fuente; no se regeneraron binarios sin necesidad.
- Fuente web compartida: `bb46c119411fe42b54d95aea7145754b30f1f5ce`; móvil integrado: `92fb03bfa1187f9b33e2b18bc77ba3a07b6a99c7`. La preparación de contactos y la cubierta inicial se sirven desde web; el binario sigue solicitando server.url al crear WebView. No afirmar que la primera petición HTTP nativa ya se dirige al enlace.
- Prueba física del iPhone 1.0.12/17 aprobada por el titular tras el despliegue: «Ambos llegan sin inicio y el contacto aparece listo». Responde al perfil desde Notas con app cerrada y www/en/proyectos con app abierta. Se conserva además la matriz de familias de enlaces previamente confirmada; no se borraron datos.
- Seguridad `40366500614` / `40366500497` y Cloudflare `40366500593` / `40366500165` / `40366528744` aprobados. General `40366500490` y móvil `40366528731` aún en curso al guardar. Los jobs de simulador iOS/emulador Android omitidos no se consideran ejecutados. La exhaustiva adicional `40367837442` se canceló pendiente para evitar duplicación; no representa un fallo de producto ni una aprobación de pruebas.
- Pendiente antes de producción Android: cargar el candidato tras CI y comprobar los APK generados con la firma de distribución Google Play, su versión y resolución. La evidencia antigua 1.0.10/14 no certifica este candidato.
- Estado de tiendas comprobado antes del envío: App Store Connect conserva 1.0.11/build16 READY_FOR_SALE; Google Play Console muestra «No tienes cambios no publicados». Apple Developer Agreement ya aceptado por el titular.
- Notas exactas ES previstas: "Mejoramos los enlaces compartidos y la claridad de las notificaciones."
- Notas exactas EN previstas: "Improved shared links and clearer notifications."
- Al avanzar se registrarán por separado carga, procesamiento, revisión y publicación. Este apartado no convierte preparación ni CI pendiente en un envío.


Cierre de CI focal previo a la carga — 26 de octubre de 2026:

- [Regression Tests · focused-release 40370301813](https://github.com/contratacr/contratacr/actions/runs/40370301813), fuente `3d481a21557759fcc63e08a3415e6d517219aaba`: 24 casos aprobados, cero fallos, flakies u omisiones. Incluye preparación inicial de contactos, recuperación del canal, entrada desde enlaces y compatibilidad con el build Android antiguo en Chromium escritorio/móvil y WebKit móvil. Base local reconstruida, contratos, tipos, lint, compilación y relaciones posteriores aprobados.
- Móvil `40366528731`: 176 aprobadas, 4 omisiones previstas, 2 fallos de la simulación incompleta del puente App en el mismo caso antiguo. La corrección del test double aprobó 3 focales locales y los casos correspondientes del CI focal anterior. No se presenta esa ejecución móvil como íntegramente verde ni se atribuye ejecución a los jobs nativos omitidos. No cambió código de aplicación ni entradas nativas respecto a `bb46c119`; el merge móvil de la corrección de pruebas/documentación es `fbb6209a21e9879430c01b0e4e49fa15e8fdfae5`.
- La general anterior `40366500490` y la exhaustiva adicional `40367837442` se cancelaron para evitar repetición innecesaria. El cierre es una comprobación focal con evidencia compuesta, no una nueva exhaustiva completa.
- Puerta de carga aprobada: hashes/firma/entradas nativas, seguridad/despliegues anteriores sobre el mismo código y confirmación física del titular conservados. A continuación se cargará Android para obtener el APK firmado por Google Play y validar ese candidato antes de producción. Aún no se ha confirmado ningún envío de producción al guardar esta nota.


Carga de biblioteca y validación Google Play — 26 de octubre de 2026:

- AAB 1.0.12/16 cargado y aceptado con SHA-256 `e13a0882980b0d128f3006fd1d2d465a57cf29185c777bc5ed59f269e6ad11f1`. Edición de carga `17085381951609084727` validada y confirmada sin asignar el candidato a ningún canal. Producción permanece 1.0.11/15; esta confirmación solo guarda el paquete en biblioteca, no es un lanzamiento.
- APK universal generado por Google Play, descargado por API autenticada: `ContrataCR-1.0.12-16-google-play.apk`, 8.779.232 bytes, SHA-256 `4214b53b7b73813d183b7d669b0e1c2d2a0eaea91bea5cc3e26a528231a190ed`. Manifest confirma com.contratacr.app 1.0.12/16. Certificado extraído y confirmado por Android: `78:31:54:89:CB:C1:3B:C8:CF:D2:3F:DC:3E:8A:00:09:91:C0:E7:31:62:DE:79:3D:28:40:2B:6F:89:17:C7:AB`.
- Instalación del paquete generado aprobada en emulator-5554, Android 16 con Google Play. Sistema sin flag DEBUGGABLE, ambos hosts verified tras verificación de red nueva, link handling allowed=true. 22 resoluciones de intents HTTPS implícitos aprobaron, sin fijar paquete/componente ni seleccionar dominios manualmente. Se usa MATCH_DEFAULT_ONLY, la consulta normal del manejador por defecto; sin ese flag el comando de inspección devolvía el selector genérico, no un fallo de asociación.
- Alcance preciso: firma/versión/instalación, verificación de dominios y resolución del sistema del candidato firmado por Play. No es una nueva prueba visual de tap, arranque frío/caliente o reenvío de auth/API, ni un Android físico; el código nativo sin cambios conserva la instrumentación anterior. El QA del emulador se sustituyó solo en el emulador de pruebas; ningún dato de teléfono físico fue borrado. La prueba física iPhone ya está aprobada por el titular.
- Notas exactas para preparar producción: ES «Mejoramos los enlaces compartidos y la claridad de las notificaciones.»; EN «Improved shared links and clearer notifications.». A continuación se prepara el envío de producción Android y la carga iOS; todavía no se ha confirmado un lanzamiento ni revisión nuevos.


Preparación de producción Android — 26 de octubre de 2026:

- Edición `03250247229227713505`, producción 1.0.12 / versionCode 16, objetivo de lanzamiento completed/100 %. Se verificó el hash del AAB de biblioteca y Google validó la edición. Todavía no confirmada al guardar esta nota; completed dentro de una edición no significa disponibilidad pública.
- Notas exactas guardadas y devueltas por Google: es-419 «Mejoramos los enlaces compartidos y la claridad de las notificaciones.»; en-US «Improved shared links and clearer notifications.».
- Se confirmará con changesInReviewBehavior=ERROR_IF_IN_REVIEW para no cancelar una revisión ajena o concurrente. La confirmación/en revisión/publicación se registrarán por separado.


Confirmación de carga iOS y edición Android — 26 de octubre de 2026:

- Android: edición de producción `03250247229227713505` confirmada con ERROR_IF_IN_REVIEW, sin cambios retenidos manualmente para revisión. Se aceptó el commit de 1.0.12/16 y sus notas es-419/en-US exactas. Esto no confirma aprobación ni disponibilidad pública; falta observar el estado de revisión/publicación de la consola.
- iOS: altool confirmó UPLOAD SUCCEEDED sin errores para el IPA 1.0.12/17, 5.726.358 bytes, delivery `4ff7f250-a416-4853-a317-828c482c98b3`. Se conserva el hash registrado. La primera consulta de builds todavía no mostraba 17; no se considera procesado ni enviado a revisión hasta que lo confirme Apple.


Estado de revisión confirmado por las APIs — 26 de octubre de 2026:

- Google Play: `applications/com.contratacr.app/tracks/production/releases` devuelve 1.0.12 / 16 con `RELEASE_LIFECYCLE_STATE_IN_REVIEW`, mientras 1.0.11 / 15 permanece `RELEASE_LIFECYCLE_STATE_PUBLISHED`. El envío está en revisión, no publicado. Las notas es-419/en-US coinciden con las registradas.
- Apple: nueva versión 1.0.12 id `316f90b2-7bfc-4037-b3fa-f7896b13c93e`, releaseType AFTER_APPROVAL. Localización existente es-MX id `5f6aecfa-ba83-4696-bfb5-03a284909e26`, whatsNew exacto «Mejoramos los enlaces compartidos y la claridad de las notificaciones.». Se conservaron descripción y datos de revisión aprobados, sin imprimir credenciales, y Apple copió los conjuntos de 6 capturas iPhone 6,7 y 6 iPad 12,9, todos COMPLETE. No fue necesario rehacer ni recargar capturas.
- Se preservó el idioma de la ficha Apple (es-MX); las notas EN se aplicaron a Google Play en en-US. No se declara una localización Apple en inglés que no exista. El build iOS todavía no aparece como procesado/VALID; revisión pendiente de ese paso, sin fecha de publicación confirmada.

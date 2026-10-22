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

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

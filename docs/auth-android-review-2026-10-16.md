# Revisión de accesos — 16 de octubre de 2026

## Cambios

- Un fallo nativo de Google/Apple ya no continúa con OAuth web: las cookies del navegador no establecen la sesión de la WebView.
- Android abre el selector estándar de Google, conserva su estado entre intentos y recupera una sola vez `AccountReauthFailed` dentro del proveedor nativo. Cancelar no inicia otro acceso. iOS mantiene el cierre previo necesario para obtener un token con nonce nuevo.
- Después de un error se vuelve a inicializar el proveedor en el siguiente intento. Se espera la cookie antes del callback nativo.
- Se elimina el texto del último método usado.
- Los clientes nuevos de acceso social completan `/registro/cliente`, incluido WhatsApp y términos, antes de marcarse completos. Los existentes no vuelven a registrarse.
- El guard de registro puede repetir la consulta si una actualización de Auth canceló la anterior, evitando un formulario vacío.

## Pantalla antigua

La bienvenida compartida actual es blanca y no tiene variantes Android/iOS. La APK de QA encontrada en el emulador (`com.contratacr.app.qatest`) es 1.0.9, instalada el 12 de octubre, y carga `http://localhost:3000`; no equivale a Google Play. El usuario confirmó que el fallo de Google ocurrió en la app de Google Play. No se ha obtenido el binario publicado ni confirmado su URL/versión, por lo que la APK de QA no demuestra el origen de la captura o del fallo publicado.

La configuración canónica de producción carga `https://contratacr.com` en ambas plataformas. No se cambian versiones ni se envían binarios a las tiendas.

## Validación y límites

- Contratos de Google/Apple: nonce, vinculación sin cambiar cuenta, cancelación, errores sin navegador, selector Android y recuperación acotada.
- Playwright móvil Chromium/WebKit: error/reintento nativo, registro incompleto y teléfono; pruebas existentes de correo y Apple.
- Prueba manual web producción: Google estableció sesión y llegó a onboarding; Apple abrió su página oficial. No demuestra el retorno nativo en un teléfono físico.
- Prueba manual web con proyecto de test: Google devuelve `redirect_uri_mismatch` para el callback de Supabase test. Requiere corregir ese cliente en el proyecto OAuth correspondiente; no ampliar orígenes a ciegas. El proyecto Firebase accesible `contratacr-95d6f` no tiene Auth Platform configurado y no es el del cliente OAuth observado.
- Los registros recientes de producción muestran fallos de la hoja Google en Android categorizados como `plugin-unavailable`; esa categoría histórica no conserva el error original y no permite concluir que falte la firma de Play u otra configuración. Se separa ahora `no-credentials` de errores de configuración.
- Pendiente validación completa en Google Play con cuenta/dispositivo real, incluyendo «usar otra cuenta», firma de Play y sesión al volver a la app. Apple necesita una cuenta de prueba para completar la autenticación nativa.

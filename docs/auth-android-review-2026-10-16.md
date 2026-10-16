# Revisión de accesos — 16 de octubre de 2026

## Cambios

- Un fallo nativo de Google/Apple ya no continúa con OAuth web: las cookies del navegador no establecen la sesión de la WebView.
- Android abre el selector estándar de Google, conserva su estado entre intentos y recupera una sola vez `AccountReauthFailed` dentro del proveedor nativo. Cancelar no inicia otro acceso. iOS mantiene el cierre previo necesario para obtener un token con nonce nuevo.
- Después de un error se vuelve a inicializar el proveedor en el siguiente intento. Se espera la cookie antes del callback nativo.
- Se elimina el texto del último método usado.
- Los clientes nuevos de acceso social completan `/registro/cliente`, incluido WhatsApp y términos, antes de marcarse completos. Los existentes no vuelven a registrarse.
- El guard de registro puede repetir la consulta si una actualización de Auth canceló la anterior, evitando un formulario vacío.

## Pantalla antigua

La bienvenida compartida actual es blanca y no tiene variantes Android/iOS. La APK de QA encontrada en el emulador (`com.contratacr.app.qatest`) es 1.0.9, instalada el 12 de octubre, y carga `http://localhost:3000`; no equivale a Google Play. El usuario confirmó que el fallo de Google ocurrió en la app de Google Play. La inspección posterior del binario publicado se documenta abajo; la APK de QA no demuestra el origen de la captura o del fallo publicado.

La configuración canónica de producción carga `https://contratacr.com` en ambas plataformas. No se cambian versiones ni se envían binarios a las tiendas.

## Validación y límites

- Contratos de Google/Apple: nonce, vinculación sin cambiar cuenta, cancelación, errores sin navegador, selector Android y recuperación acotada.
- Playwright móvil Chromium/WebKit: error/reintento nativo, registro incompleto y teléfono; pruebas existentes de correo y Apple.
- Prueba manual web producción: Google estableció sesión y llegó a onboarding; Apple abrió su página oficial. No demuestra el retorno nativo en un teléfono físico.
- Prueba manual web con proyecto de test: Google devuelve `redirect_uri_mismatch` para el callback de Supabase test. Requiere corregir ese cliente en el proyecto OAuth correspondiente; no ampliar orígenes a ciegas. El proyecto Firebase accesible `contratacr-95d6f` no tiene Auth Platform configurado y no es el del cliente OAuth observado.
- Los registros recientes de producción muestran fallos de la hoja Google en Android categorizados como `plugin-unavailable`; esa categoría histórica no conserva el error original y no permite concluir que falte la firma de Play u otra configuración. Se separa ahora `no-credentials` de errores de configuración.
- Pendiente validación completa en Google Play con cuenta/dispositivo real, incluyendo «usar otra cuenta», firma de Play y sesión al volver a la app. Apple necesita una cuenta de prueba para completar la autenticación nativa.

## Inspección directa de Google Play

Play Console confirma producción 1.0.10, build 14, publicada el 12 de octubre de 2026 a las 14:33 (hora mostrada por la consola), rollout 100 %. No se cambió ninguna publicación.

Se descargó el APK firmado universal del artefacto 14 para inspección. SHA-256 del archivo: `4538e9102999d8d234871b0b964c4252df7dcdaf740a5a541264c45d02d33d8d`.

- `assets/capacitor.config.json` carga `https://contratacr.com`, igual a la configuración actual. No apunta a test ni a localhost.
- La bienvenida fotografiada no está embebida en el APK. Solo lleva una página local «Abriendo ContrataCR…». La portada se obtiene de la web; la captura antigua no demuestra una diferencia de diseño nativo entre Android/iOS. Un documento WebView mantenido abierto puede conservar el JavaScript anterior, pero falta reproducir y observar ese caso en la instalación afectada para atribuirle la causa.
- La firma del APK publicado tiene SHA-1 `25:94:60:A2:7F:2F:B0:8A:BB:E7:5B:54:50:07:69:98:C3:4A:C7:AB` y SHA-256 `78:31:54:89:CB:C1:3B:C8:CF:D2:3F:DC:3E:8A:00:09:91:C0:E7:31:62:DE:79:3D:28:40:2B:6F:89:17:C7:AB`. La SHA-256 coincide con `/.well-known/assetlinks.json`.
- El proyecto OAuth real es `project-f1341c2c-b839-4c4d-b34` (número `236550659740`, nombre My First Project), accesible directamente por su número. El cliente Android release existente autoriza SHA-1 `7D:0E:7E:B2:57:9D:7B:E4:17:AA:21:6C:73:89:8C:4F:8A:DA:AD:81`, distinta de Google Play. El cliente debug autoriza `8D:1D:E2:5F:7B:06:C9:1E:85:9E:8B:9B:D5:9F:7E:CC:97:4E:3C:E3`; ninguno de los dos autoriza la firma Play. Con autorización explícita de Isaac se creó y verificó «ContrataCR Android (Google Play)», paquete `com.contratacr.app`, con la SHA-1 publicada. Cliente: `236550659740-aodfgh9rrn83g9g24r6nkvao4ejio5gs.apps.googleusercontent.com`. No se sustituyó el cliente web que Supabase valida como audiencia.
- Diagnóstico inicial de Apple Android: el bundle web no recibe `NEXT_PUBLIC_APPLE_SERVICES_ID` ni `NEXT_PUBLIC_APPLE_REDIRECT_URL` del workflow de despliegue. El plugin Android necesita además un callback de servidor para el intercambio de código y el retorno a la app; no existe una implementación de ese callback en el repositorio. No basta con reutilizar el callback web de Supabase ni con abrir Apple en el navegador. No se declara probado ni funcional.

Se detectó además que la regresión de CI estaba detenida antes de los navegadores por falta de dueño para `/api/verification/documents` (ruta de la tarea anterior). Se asignó al contrato de producto y se añadieron comprobaciones de lectura/subida sin sesión. El inventario pasa (70 páginas, 93 handlers) y el contrato de invitados pasó localmente.

## Corrección de retorno Apple Android y emulador Play

Apple Android reutiliza el proveedor Apple web existente de Supabase mediante `openSecureWindow`, ya presente en el APK publicado. La WebView conserva el verificador PKCE; el callback devuelve únicamente el código de un uso a `/dashboard/native-auth-return`, ruta cubierta por los app links publicados. Se valida origen, ruta y estado por intento antes de intercambiar el código en la WebView. La vinculación comprueba que siga siendo la misma cuenta. El navegador no crea una sesión y el manejador genérico de campañas no consume este retorno. No se añaden secretos Apple al cliente. La prueba posterior confirmó que el build 14 necesita una actualización nativa para recibir el retorno.

La respuesta de retorno tiene destino y paquete fijos, sin parámetros de redirección arbitraria, caché, referer ni recursos externos. Las cabeceras globales de Next respetan estas restricciones para este flujo.

La APK oficial instalada directamente en el antiguo emulador mostró una protección que exige Google Play. Se preparó `ContrataCR_Play_QA` con la imagen oficial API 36 ARM64 Google Play Store, sin modificar ni volver a firmar el APK. Isaac inició sesión en la tienda. La validación completa de Google, «usar otra cuenta» y Apple sigue pendiente hasta observar la sesión final dentro de la app.

En el emulador anterior también se encontró una captura GPU obsoleta: mostraba la bienvenida antigua incluso con el launcher activo. Reiniciar sin snapshot y con SwiftShader corrigió la representación del emulador. Esto no demuestra la causa en el dispositivo que reportó Isaac.

Validación local de la corrección: 22 contratos de autenticación y 28 pruebas Playwright en Chromium/WebKit móviles pasaron. La comprobación de tipos pasó. Ninguna versión se publicó en las tiendas.

## Prueba manual con instalación de Google Play

El 16 de octubre se instaló directamente desde Play Store: `versionCode=14`, `versionName=1.0.10`, instalador `com.android.vending`. La app abrió la bienvenida blanca actual; no mostró la portada antigua. Google abrió su selector nativo, autenticó la cuenta de prueba configurada y regresó a la app con su identidad visible en onboarding. No se completó ni cambió su rol.

En un intento posterior, «Add another account» avanzó hasta el formulario oficial de Google para correo/teléfono. Se canceló y regresó al login de ContrataCR sin iniciar otra sesión. Esto confirma el avance del formulario, pero no un acceso completo con una segunda cuenta.

Apple abrió el flujo de navegador seguro; la primera configuración de Chrome y las credenciales de Apple quedaron pendientes de intervención de Isaac. No se declara validado el retorno real de Apple todavía.

El CI detectó un texto bilingüe del error nativo fuera del catálogo. Se movió a `auth.login.nativeSocialError` en ambos idiomas y sus dos consumidores usan `useTranslations`; no se amplió el presupuesto del control.

## Hallazgo decisivo del retorno real de Apple

Isaac completó la autenticación Apple. El callback recibió el retorno y mostró «Volver a ContrataCR», pero su botón abrió Play Store en lugar de la app. Se inspeccionó entonces el manifiesto del APK oficial descargado y la tabla de resolución del paquete instalado desde la tienda: `MainActivity` solo contiene MAIN/LAUNCHER, sin VIEW/BROWSABLE ni enlaces HTTPS. El filtro de `/dashboard` está en el código actual de `mobile`, pero no en el build 14. La coincidencia del certificado con assetlinks.json por sí sola no registra un enlace ausente en el manifiesto.

Se corrige la conclusión anterior: Apple NO quedó funcionando de extremo a extremo en Google Play. No es reparable solo con JavaScript en esa instalación. El flujo PKCE queda preparado para builds posteriores con el manifiesto actual. Los builds Android <=14 (o sin número válido) se detienen antes de abrir Apple, con una explicación traducida y sin enviar al usuario a Play Store. Google permanece disponible y probado en el build 14. Esta condición se añade a contratos y pruebas móviles. No se incrementa versión/build ni se publica en ninguna tienda.

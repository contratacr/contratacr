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

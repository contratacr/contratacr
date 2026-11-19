# Auditoría local de fotografías de constancias tras recargar

Checkout Pro `local/pro-suite-no-push`, HEAD `06b70019`. Sólo Supabase loopback, cuentas desechables e imagen sintética de color sólido de 24×24 píxeles. No producción, push, mensajes reales ni cambios de bucket/políticas. Implementación sin modificar durante la reproducción.

Prueba: `tests/e2e/pro-delivery-photo-reload.spec.ts`. Dos casos WebKit rojos esperados por pérdida de identidad al recargar. Log `/tmp/pro-delivery-photo-reload-before.log`; adjuntos de trace `observed-photo-capacity` y `observed-photo-duplicates`.

## Reserva confirmada y fallo de subida

La inyección se coloca **entre etapas**, no simula la ejecución completa del POST normal: usa el RPC real `pro_work_delivery_mutate` para reservar y el SDK real de Storage para intentar subir en la ruta propia con MIME `image/gif`, rechazado por la lista permitida. La imagen JPEG normalizada es sintética; ningún ajuste compartido del bucket se modifica. Después devuelve 503 a la interfaz.

Se realizaron seis ciclos de recarga y reselección de la misma imagen. Se observaron seis `actionId` distintos, seis recibos, seis reservas `ready=false`, cero objetos y ausencia del botón de reintento tras cada recarga. Al completar las seis reservas desaparece el selector de subida: las reservas pendientes consumen los seis espacios. Todas conservan el mismo SHA-256 y tamaño (275 bytes). El error real de Storage fue `mime type image/gif is not supported`.

No se presenta este caso como evidencia de una caída real del servicio de almacenamiento ni de que el POST normal envíe ese MIME.

## Respuesta perdida después de subir y confirmar

Este caso sí usa el POST real completo (`route.fetch`): reserva, subida JPEG privada y `ready=true` terminan con HTTP 200; la respuesta se sustituye por 503 para perder el ACK. Tras recargar, la interfaz pierde el reintento original y permite reseleccionar el mismo archivo.

La reselección produce un segundo `actionId`, otro recibo, otra fila `ready=true` y otro objeto privado. Se descargaron ambos objetos con el cliente de servicio local y se verificó el mismo SHA-256 `748d0ab5499728e86f37a9e6cbd9dc2dfeb2bd6b27e262bbd918390c7562950b`, con 275 bytes cada uno. Esto demuestra duplicación de objetos para el recorrido incierto reproducido; no justifica deduplicar globalmente fotografías que se seleccionan intencionalmente como acciones independientes.

## Conservación y limpieza

El documento/revisión del workspace permaneció idéntico en ambos casos. Se eliminaron únicamente las rutas del dueño desechable consultadas en `pro_work_delivery_photos`; Storage confirmó la carpeta propia vacía antes de limpiar las cuentas. Ningún objeto ni dato existente se usó o modificó. No hay corrección de UI aplicada en este bloque: el siguiente trabajo debe conservar la identidad y resolver la reserva/subida/ready sin consumir otro cupo ni crear otro objeto al retomar el mismo intento.

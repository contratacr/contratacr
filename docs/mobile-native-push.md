# Notificaciones push nativas

## Estado actual

- Android usa Firebase Cloud Messaging (FCM). La app Android y `google-services.json` están configurados para `com.contratacr.app`.
- Capacitor 8 entrega un token APNs nativo en el evento `registration` de iOS. Firebase Admin `sendEachForMulticast` no acepta tokens APNs; requiere tokens de registro FCM.
- Por seguridad, la app no sube ni cachea el token APNs de iOS y el endpoint rechaza `platform: "ios"`. El envío también excluye filas iOS antiguas para que no provoquen falsos fallos de FCM.

## Bloqueo exacto de iOS

No existe `ios/App/App/GoogleService-Info.plist` ni una integración de Firebase Messaging para iOS que convierta el token APNs en un token FCM. Tampoco se deben inventar esos identificadores o credenciales.

Para habilitar entregas push en iOS hacen falta estos pasos externos:

1. Registrar `com.contratacr.app` como aplicación iOS dentro del proyecto Firebase correcto y descargar su `GoogleService-Info.plist`.
2. Configurar en Firebase la clave de autenticación APNs o el certificado del Apple Developer Team propietario de la app.
3. Integrar Firebase Messaging para iOS y entregar al API un token FCM, no el token APNs que emite `@capacitor/push-notifications`.
4. Solo entonces retirar el rechazo explícito de iOS y cubrir el registro/envío con una prueba en un dispositivo físico firmado.

Los callbacks de Capacitor 8 para registro APNs sí quedan conectados en `AppDelegate.swift`; esto evita perder el evento nativo y deja preparada la app para completar la integración cuando existan la configuración y credenciales legítimas.

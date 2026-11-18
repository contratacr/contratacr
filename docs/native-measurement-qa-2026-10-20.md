# QA de medición nativa · 20 de octubre de 2026

- Android: compilación Debug, pruebas JVM y lint sin errores. El lint detectó dos llamadas a una API restringida del SDK en el diagnóstico; se sustituyeron por estado propio después de la inicialización pública. No se suprimieron reglas.
- Emulador Android 16: seis pruebas instrumentadas pasan. Se añadieron comprobaciones del manifiesto instalado (sin permisos publicitarios ni proveedor automático de Meta) y del filtrado de Install Referrer (solo atribución cifrada; sin texto libre).
- Candidato cargado desde el origen real de producción: plugin disponible y Android reconocido, SDK listo, envío de apertura confirmado `SUCCESS`, instalación aceptada. No equivale a instalación atribuida a anuncio ni prueba de todas las conversiones de negocio.
- Chrome de escritorio: 21 pruebas focalizadas de privacidad/Meta. Chrome móvil y WebKit: 24 pruebas de privacidad. Sin ventanas nuevas.
- Meta: se agregó el caso de uso «Create & manage app ads with Meta Ads Manager», sin campañas, presupuestos ni acceso a Marketing API. Meta muestra verificación del negocio incompleta y Publish deshabilitado; la autenticación de Facebook requiere intervención del titular. No se publicó la app de Meta.
- iOS: esquema SKAdNetwork todavía pendiente en Meta; el código conserva la puerta de activación cerrada. Confirmar postbacks y atribución real requiere una distribución de pruebas válida posteriormente autorizada. Ninguna versión se envió a tiendas.
- La regresión exhaustiva y la nativa se mantienen como pendientes hasta sus resultados finales; sus fases de configuración o compilación no acreditan la suite completa.

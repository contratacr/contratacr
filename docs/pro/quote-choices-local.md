# Complementos opcionales de cotizaciones — Pro local

1 noviembre 2026. Implementación local aditiva en `local/pro-suite-no-push`; no desplegada ni enviada a producción. Referencia funcional revisada: [Jobber — Optional Line Items on Quotes](https://help.getjobber.com/en/articles/optional-line-items-on-quotes/). La documentación oficial distingue selección del cliente, total dinámico, vista previa y traslado de líneas elegidas al trabajo. No se probó una cuenta privada de Jobber en esta entrega.

## Recorrido implementado

El profesional abre una cotización canónica en Ventas y elige **Complementos opcionales**. Conserva las líneas base y agrega hasta diez opciones, dentro del máximo general de veinte líneas. Cada opción tiene descripción, cantidad y precio unitario. Al guardar, el cliente ve una versión nueva en su cuenta; no se envía correo, push o WhatsApp.

Los complementos comienzan sin seleccionar. El cliente marca los que desea, revisa el total y acepta esa versión concreta; también puede rechazarla. El profesional puede explorar una vista previa sin responder por el cliente. La aceptación copia únicamente las opciones elegidas a las líneas canónicas: las consultas existentes de trabajo/factura reutilizan esos importes. La aceptación no cobra ni emite documentos fiscales.

El original base, cada conjunto de opciones y el historial se conservan en tablas separadas del JSON del workspace. No se actualizan silenciosamente borradores anteriores: no se permite configurar opciones si ya hay un borrador asociado, ni crear un borrador de esa cotización mientras las opciones estén pendientes. Tras la aceptación se puede preparar un borrador nuevo con las líneas elegidas.

## Autorización y conservación

El destinatario se obtiene de `quotes.client_id` o de una relación comprobada: contacto de la cotización, trabajo del mismo propietario, `bookingClientId` y participante de la solicitud enlazada al trabajo. Nunca se asocia por nombre, teléfono o correo. Si no existe esa relación, la interfaz pide un cliente vinculado en lugar de permitir elegir una cuenta ajena.

Solo el profesional con Pro activo configura. El cliente autenticado puede responder sin Pro; consultar historial y rechazar siguen disponibles al vencer la licencia. Administradores mantienen MFA. Las tablas y RPC son solo de servicio; el API usa identidad de sesión, verifica origen y limita cuerpo. Los reintentos conservan la acción exacta; los cambios concurrentes requieren revisión. Los guardados reconocidos no se repiten por fallar la lectura posterior.

Las cotizaciones anteriores sin opciones y el recorrido de producción conservan su comportamiento. Un guard de cotización impide aprobar o cambiar por el API anterior una versión con opciones. La salida segura del profesional es retirarla; una nueva negociación posterior a aceptar exige otro acuerdo explícito, no reescribir el aceptado.

## Validación

- PGlite aislado: selección vacía inicial, roles y terceros, vínculos exactos, CAS/repetición, bloqueo de aceptación por rutas anteriores, conversión de líneas/totales, borrador pendiente, licencia vencida, preservación y reinstalación: aprobado.
- ESLint focal: aprobado.
- TypeScript: solo aparece el error previo de `JobsPageContent` en los tipos generados de Empleos; no se modificó esa sección.
- E2E preparado para ejecución coordinada: profesional configura, fallo de confirmación y reintento exacto, cliente gratuito elige/acepta, factura de prueba reutiliza dos líneas, privacidad y conservación. No se declara aprobado hasta ejecutarlo.

## Diferencias y límites respecto de la referencia

No se replica un plan comercial de Jobber ni se afirma equivalencia completa. No se preseleccionan extras recomendados, no se implementa elección exclusiva de un paquete ni una cotización completamente opcional. El PDF canónico posterior muestra lo aceptado; las opciones descartadas se conservan en el historial de Pro, no se agregan al PDF como líneas grises. Las opciones se preparan desde el detalle tras crear la cotización, sin ampliar el formulario inicial de profesionales gratuitos. No se descuenta inventario por proponer o aceptar opciones.

# Anuncio automático de la app móvil

Campaña estable `descargar-app-2026`. El asunto y texto aprobados viven en `src/lib/email/mobile-app-campaign.ts`; cambiar el texto no cambia el identificador ni permite reenviar.

Se procesa con las demás campañas a las 09:00 de Costa Rica. Desde siete días después del registro, exige cuenta activa, correo confirmado, ausencia de bajas/rebotes y ninguna señal conocida de uso móvil. Se consultan todos los accesos móviles autenticados, dispositivos Android/iOS (también inactivos), interacciones históricas nativas y registros realizados desde la app. Actividad anónima sin iniciar sesión no puede asociarse a una cuenta/correo.

Orden: completar perfil, reseñas, anuncio de la app, precio desde, buscar profesionales y crear proyecto. Se mantiene el intervalo global de catorce días, el bloqueo por avisos internos recientes y la reserva diaria de cincuenta correos para registros y otros correos necesarios. Los pendientes se vuelven a evaluar al día siguiente; no se envían si entretanto usaron la app.

La reserva SQL comprueba el uso móvil y el worker lo vuelve a comprobar inmediatamente antes de contactar Brevo. Si la consulta de uso no está disponible, esta invitación se omite; las otras campañas mantienen su política. Un resultado incierto del proveedor conserva su reserva y no se reintenta automáticamente. Los cambios de correo respetan el historial del mismo perfil.

El botón lleva a `https://contratacr.com/#descargar-app` con los parámetros de campaña antes del ancla. Se mantienen soporte dentro del sitio y el enlace de baja.

Los avisos enviados manualmente por WhatsApp no se detectan ni se marcan como correo enviado. No se han importado exclusiones de WhatsApp porque no se proporcionó el listado de quienes ya recibieron ese aviso.

Validación: pruebas de elegibilidad, historial, revalidación antes de Brevo y conservación del ancla, además de SQL local para evidencia histórica, permisos, cuota y exclusión atómica. Las pruebas no envían correos reales.

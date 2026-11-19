# Agenda sencilla y difusión registrada — revisión local

Revisión solicitada el 23 de octubre de 2026. Solo rama `local/pro-suite-no-push` y base de datos local.

## Agenda

Se eliminó la combinación de búsqueda, estados Todas/Hoy/Próximas/Finalizadas/Canceladas y vistas Lista/Semana. La vista tiene calendario, fecha elegida, citas de ese día y Nueva cita. Hoy vuelve a la fecha actual. Las citas finalizadas o canceladas permanecen en su día con su estado, sin perder historial.

Nueva cita propone la fecha elegida. Al guardar una cita para otra fecha, la agenda muestra esa fecha. Clientes, cotizaciones, reserva gratuita y control de solapamientos se conservan. La disponibilidad pública se configura en una ventana separada; ya no ocupa otra columna con explicaciones y horas en la vista diaria.

## Difusión

Se retiró «Destaca en nuestras redes» de Mi panel y del prototipo de Pro, junto con el formulario de solicitudes y la promesa de una difusión mensual. Los enlaces antiguos no reabren el formulario. El endpoint antiguo de solicitudes devuelve 410 y el de revisión de solicitudes también se retiró. Los datos históricos no se borran.

El admin registra la difusión ya realizada: elige cuenta y contenido real (perfil, proyecto, promoción o empleo), red (Instagram/Facebook/TikTok), fecha, enlace y si fue anuncio pagado. Los enlaces deben pertenecer a la red elegida. No acepta fechas futuras. No publica en redes, no crea campañas ni realiza pagos.

El profesional Pro ve «Difusión de ContrataCR» dentro del detalle de su propio contenido, únicamente si existen registros. Se distingue «Compartida en redes» de «Promocionada por ContrataCR · Anuncio pagado». No se muestran métricas inventadas ni estimaciones de resultados. No existe una sección adicional para solicitar difusión.

Los eventos se guardan en el historial administrativo inmutable `pro_audit`. Solo un admin con MFA puede registrarlos. Los profesionales no pueden crear ni modificar estos eventos y solo consultan los de su propia cuenta y contenido. El índice local `docs/pro/sql/promotion-records-draft.sql` evita duplicar un mismo envío reintentado. No hay migración ni aplicación remota.

Para la revisión visual se preparó en la cuenta local una promoción ficticia «Desarrollo web · Ejemplo local», con dos registros de ejemplo (Instagram orgánico y Facebook pagado). Son datos de demostración y enlaces ficticios: no acreditan publicidad real ni generaron publicaciones externas. El admin puede consultar el historial del contenido seleccionado además de registrar nuevas difusiones.

## Validación final

- Suite local completa: **51/51 aprobadas** en WebKit móvil, Chromium escritorio y Chromium móvil, 3,8 minutos (`/tmp/pro-simple-approved.log`).
- Se comprueba con Supabase real local: admin con MFA registra, reintentos no duplican, profesional consulta solo su contenido, otra cuenta no accede, el enlace corresponde a la red seleccionada, la difusión aparece en la ficha pública propia y dentro de Promociones de Mi panel. Los endpoints de solicitudes retirados devuelven 410.
- Agenda: no muestra los controles retirados, seleccionar un día muestra sus citas y Nueva cita propone esa fecha; reservas gratuitas y conflictos concurrentes continúan cubiertos.
- TypeScript sin errores (`/tmp/pro-simple-tsc.log`). ESLint sin errores; dos advertencias preexistentes de hooks en `client-activity.tsx` (`/tmp/pro-simple-lint.log`).
- Revisión visual en el simulador iPhone 17 Pro / iOS 26.5 con cuenta local Isaac Sánchez Monge: `/tmp/contratacr-pro-agenda-simple-iphone.png` y `/tmp/contratacr-pro-difusion-en-publicacion-iphone.png`.
- Sin push, despliegues, publicaciones en redes, cobros ni versiones de tiendas.

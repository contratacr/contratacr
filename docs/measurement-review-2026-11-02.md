# Medición de contactos y consentimiento — 2 de noviembre de 2026

Base main/test: 91b3d249. Se revisaron reports, APIs de privacidad, eventos de
crecimiento y recibos de conversación. No se cambia consentimiento ni se envían
mensajes o eventos a producción para probar.

## Selección de validación

Cambian agregación administrativa, presentación del aviso y captura consentida de
campañas. No se reutiliza un pase previo para certificar estas entradas nuevas.
Se seleccionan: tipos, lint focal, codificación, contratos de agregación nuevos,
admin-contact-segments, privacidad (UI/runtime), crecimiento Meta (guardas,
deduplicación y entrega), y contratos SQL aislados de privacidad/histórico/Meta.
Los tests de UI nuevos se ejecutan en Chromium y WebKit. Las compuertas automáticas
existentes conservan su selección y despliegue; no se debilitan para este cambio.
Los tests no certifican atribución real en Ads Manager, instalaciones ni conversaciones
externas. No se cambian cuentas, presupuestos, campañas ni permisos de personas.

## Qué distingue el panel

- Registros operativos: mensajes guardados y conversaciones que tuvieron mensajes
  del cliente durante el período. Abrir el compositor, una respuesta del profesional
  o varias pulsaciones no generan nuevas conversaciones. Se excluyen cuentas admin
  y autocontactos. No se selecciona contenido de mensajes ni adjuntos.
- Señales Contact consentidas, agrupadas por campaña guardada o «Origen desconocido».
  Las pruebas, colas y confirmaciones de recepción del servidor van por separado.
  Recibido por Meta no significa atribuido al anuncio ni contacto efectivo.
- Última elección explícita conservada por cuenta y finalidad, vigente y dentro de
  180 días. No es permiso actual del dispositivo ni porcentaje de visitantes.
  El registro no incluye todas las decisiones de visitantes; no se inventa denominador.

Las fuentes que fallan muestran «no disponible», no cero. Se pagina cada lectura
administrativa y se acotan las listas IN. El permiso/MFA de admin se verifica antes
de consultar. No se pasan identificadores de personas al componente ni a Meta.

Se aclara el aviso, conservando igualdad de botones, opciones apagadas y la posibilidad
de usar el servicio con solo necesarias. Los UTMs paid_social/cpc/ads/ppc ahora entran
al recorrido consentido de campañas, además de paid y campana. No se recuperan visitas
previas a la aceptación ni se atribuyen retrospectivamente mensajes a un anuncio.

## Límite de atribución

Los mensajes operativos no tienen un vínculo histórico inequívoco con la campaña;
no se les asigna una fuente por haber ocurrido durante el anuncio. Los eventos Contact
existentes agrupan persona/profesional/día, no personas únicas de toda una campaña.
El costo por contacto atribuido se consulta en Meta; gasto y atribución de Ads Manager
no están sincronizados con este panel. No se presenta recepción CAPI como conversión
atribuida. Esta mejora no evita el rechazo de seguimiento ni reconstruye lo no medido.

## Resultado de validación local

- Tipos TypeScript, ESLint focal, codificación UTF-8 e inventario: aprobados.
- Privacidad y Meta/histórico en PGlite: aprobados (sin servicios productivos).
- 66 combinaciones de casos/motor existentes: privacidad, UI ES/EN en cuatro
  anchos, segmentos y guardas/deduplicación de Meta; aprobadas.
- 12 combinaciones nuevas de captura de campañas en Chromium/WebKit: aprobadas.
- 10 combinaciones nuevas de agregación/presentación en Chromium/WebKit: aprobadas.
  La prueba nueva de agregación inicialmente usaba una fecha futura respecto al
  reloj del proceso; se fijó su reloj para probar los límites temporales de forma
  determinista, sin cambiar la regla que excluye registros futuros.

Son pruebas focales de lógica, módulos reales y UI aislada; no una certificación
exhaustiva ni un contacto real atribuido por Meta. Las compuertas remotas y el
despliegue se comprueban por separado después del push. No hay migración nueva.

# Registros profesionales incompletos — 10 de octubre de 2026

Auditoría de producción de solo lectura: perfiles, profesionales, metadatos de autenticación, sugerencias, catálogo, notificaciones conservadas, historial de campañas, rebotes y bajas. No se enviaron mensajes ni se modificaron cuentas. Conteos al momento de la consulta.

## Qué significa «Registros incompletos»

El filtro del administrador identifica cuentas sin fila en `professionals` cuyo registro profesional fue iniciado (`professional_signup_started=true`, `is_provider!=true`). No representa el porcentaje de completitud de perfiles ya publicados.

- 442 cuentas; 317 perfiles profesionales activos.
- 41 registros profesionales sin terminar.
- 28 de esos 41 no tienen confirmación de correo registrada; 13 sí.
- 4 cuentas incompletas tienen sugerencias asociadas (5 solicitudes).
- Ninguna de las 41 tiene una notificación conservada `completa_perfil`. El aviso actual está pensado para después de crear el perfil profesional, por lo que no resuelve el abandono antes de ese paso. La ausencia de filas no prueba que nunca haya existido un aviso eliminado.

## Sugerencias vinculadas a registros sin terminar

| Persona | Sugerencia | Estado comprobado | Próximo paso recomendado |
| --- | --- | --- | --- |
| Uriel Gerardo Granados Morales | Electricidad industrial | Aprobada el 26 de agosto; presente en catálogo; aviso de aprobación sin leer | Correo dirigido indicando que ya puede retomar el registro |
| Rafael Tijerino | Técnico electricista | Rechazada el 26 de agosto: existe Electricidad; aviso sin leer | Explicar que puede elegir Electricidad y describir su especialidad |
| Carlos Enrique Cascante Beita | Fontanería / Mantenimiento | Rechazadas el 10 de agosto; Fontanería ya existe como Plomería, Mantenimiento requiere especialidad; ambos avisos sin leer | Correo con alternativa concreta, sin presentarlo como rechazo de su profesión |
| Marco Gonzalez | Consultoría alimentaria | Aprobada el 10 de octubre como «Consultoría para negocios de alimentos»; ya está en catálogo y se dejó aviso dentro de la app | Permitir que retome el registro, sin enviarle una recuperación inmediata por correo |

Al momento de la auditoría inicial, las 179 solicitudes del historial tenían 114 aprobadas, 64 rechazadas y 1 pendiente; esa pendiente ya se aprobó. La aprobación de un servicio no crea automáticamente el perfil ni agrega el servicio al profesional. No se puede atribuir el abandono a la sugerencia únicamente a partir de estos datos.

## Perfiles profesionales creados

Sobre los 317 perfiles activos: 42 sin foto, 90 sin biografía, 198 sin descripción en sus servicios, 4 sin ubicación/cobertura y 301 sin un precio de referencia identificable. Todos tienen WhatsApp y al menos un servicio activo. Estos conteos se superponen: no son grupos sumables. La falta de precio no implica que el registro esté bloqueado; algunos trabajos requieren cotización.

## Correo recomendado

Una campaña de recuperación, enviada una sola vez, con identidad estable y recibo permanente por destinatario. Mantenerla separada de la campaña general de servicios: tiene otro propósito y otro público.

La preselección de la auditoría arrojó **12 posibles destinatarios**: correo confirmado, cuenta activa, registro profesional sin terminar hace al menos siete días, ninguna sugerencia pendiente, sin baja/rebote conocido y sin campaña en los últimos 14 días. Marco queda fuera por registro reciente. Es una preselección, no una garantía final: comprobar nuevamente estado y todos los bloqueos justo antes del envío, incluyendo reservas y entregas inciertas del sistema nuevo.

Texto base:

> Asunto: Retomá tu registro profesional en ContrataCR
>
> Empezaste a crear tu perfil profesional, pero todavía no terminaste el registro. Podés retomarlo para elegir tus servicios y completar los datos de tu perfil.
>
> Botón: Continuar mi registro → /registro/profesional

Personalizar Uriel con «Electricidad industrial ya está disponible», Rafael con «Podés elegir Electricidad» y Carlos con «Fontanería está disponible como Plomería». No enviar un mensaje que diga «servicio aprobado» a quienes recibieron un rechazo.

No enviar esta campaña a las 28 cuentas sin correo confirmado. Revisar primero el paso de confirmación, la entrega de sus correos de verificación y la facilidad de reenviarlos. Que no confirmaran es un dato; no prueba por sí solo que el correo fallara.

Para profesionales con perfil creado, preferir acciones concretas dentro del panel. Si se prueba correo, dirigirlo a una carencia esencial y no repetir pedidos de precio, reseñas, fotos y biografía en campañas separadas.

## Mejoras del producto propuestas, todavía no implementadas

- Mostrar en Usuarios: «Correo sin confirmar», «Registro por terminar», «Sugerencia pendiente» y «Servicio disponible; registro por terminar».
- Dirigir las decisiones a retomar el registro cuando aún no exista perfil profesional; al editor de servicios cuando sí exista. Los enlaces históricos llevan a notificaciones, y el ajuste local previo al editor no cubre por sí solo el caso de registro sin crear.
- Mantener una acción clara «Continuar registro» al volver a iniciar sesión.
- Medir recuperación por finalización real del registro, no solo aperturas del correo.

Este documento es un análisis y una propuesta. No habilita ni ejecuta nuevos envíos.

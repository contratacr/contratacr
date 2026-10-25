# Auditoría de enlaces y avisos — 24 de octubre de 2026

Revisión de código local main a4767c43 y mobile 602246a0. La tabla describe cobertura declarada, NO una prueba física de apertura. Hosts asociados: contratacr.com y www.contratacr.com. Las variantes de idioma deben probarse por separado. No se enviaron avisos ni se modificaron recibos.

## Hallazgos

- Los enlaces de perfiles que genera enlacePerfil usan /nombre-profesional y no están declarados en ninguno de los dos sistemas ni aceptados por campaignAppPath. No es un problema demostrado de la firma.
- Los enlaces cortos /p, /o, /e y /c tampoco están cubiertos. El middleware los reescribe en la web; eso no registra esos enlaces en iOS/Android.
- Mensajes, notificaciones y soporte directo tampoco están declarados. Dashboard sí está incluido.
- Autenticación, recuperación de contraseña, bajas de correo, API y administración necesitan una política explícita: abrir absolutamente cualquier URL en la app puede romper retornos seguros. No añadir un comodín global sin exclusiones y pruebas.
- Recomendación: cubrir rutas funcionales y alias compartidos; preservar sesión, consulta y fragmento. Mantener callbacks de autenticación y acciones de correo en sus flujos propios. Para perfiles raíz, diseñar exclusiones de rutas reservadas compatibles con cada versión de Android antes de ampliar el manifest.
- Los paquetes firmados existentes deben revisarse y regenerarse si cambia el manifest. No están listos para publicación final con esta omisión pendiente.

## Inventario completo de páginas y alias detectados

Sí = coincide con configuración; no = no coincide. Los parámetros [id], [slug] y [code] se evaluaron con un valor de ejemplo.

| Ruta | iOS declarada | Android declarado | Manejador de app |
|---|---|---|---|
| `/` | Sí | Sí | Sí |
| `/@nombre-profesional` | No | No | No |
| `/abrir-app` | No | No | No |
| `/admin` | No | No | No |
| `/admin/actividad` | No | No | No |
| `/admin/analitica` | No | No | No |
| `/admin/aseguradoras` | No | No | No |
| `/admin/campanas` | No | No | No |
| `/admin/categorias` | No | No | No |
| `/admin/cobertura` | No | No | No |
| `/admin/contactos` | No | No | No |
| `/admin/costos` | No | No | No |
| `/admin/cuentas` | No | No | No |
| `/admin/empleos` | No | No | No |
| `/admin/identificaciones` | No | No | No |
| `/admin/login` | No | No | No |
| `/admin/promociones` | No | No | No |
| `/admin/proveedores/[id]` | No | No | No |
| `/admin/publicaciones` | No | No | No |
| `/admin/reportes` | No | No | No |
| `/admin/resenas` | No | No | No |
| `/admin/servicios` | No | No | No |
| `/admin/soporte` | No | No | No |
| `/admin/usuarios` | No | No | No |
| `/admin/usuarios/[id]` | No | No | No |
| `/admin/verificacion` | No | No | No |
| `/api/trabajos/reportar` | Sí | Sí | Sí |
| `/auth/callback` | No | No | No |
| `/ayuda` | No | No | No |
| `/baja-correos` | No | No | No |
| `/buscar` | Sí | Sí | Sí |
| `/c/abcd1234` | No | No | No |
| `/categorias` | No | No | No |
| `/como-funciona` | No | No | No |
| `/completar-perfil` | No | No | No |
| `/contacto` | No | No | No |
| `/continuar-perfil` | Sí | Sí | Sí |
| `/cotizacion/[code]` | No | No | No |
| `/cotizar` | No | No | No |
| `/dashboard/cliente` | Sí | Sí | Sí |
| `/dashboard/profesional` | Sí | Sí | Sí |
| `/descargar` | No | No | No |
| `/e/abcd1234` | No | No | No |
| `/eliminar-cuenta` | No | No | No |
| `/empleos` | Sí | Sí | Sí |
| `/empleos/[id]` | Sí | Sí | Sí |
| `/empleos/[id]/editar` | Sí | Sí | Sí |
| `/empleos/mis-empleos` | Sí | Sí | Sí |
| `/empleos/publicar` | Sí | Sí | Sí |
| `/fb` | No | No | No |
| `/ig` | No | No | No |
| `/login` | No | No | No |
| `/mantenimiento` | No | No | No |
| `/mejorar-mi-perfil` | No | No | No |
| `/mensajes` | No | No | No |
| `/nombre-profesional` | No | No | No |
| `/notificaciones` | No | No | No |
| `/o/abcd1234` | No | No | No |
| `/ofertas` | No | No | No |
| `/olvide-contrasena` | No | No | No |
| `/onboarding` | No | No | No |
| `/p/abcd1234` | No | No | No |
| `/privacidad` | No | No | No |
| `/pro` | No | No | No |
| `/profesionales` | Sí | Sí | Sí |
| `/profesionales/[slug]` | Sí | Sí | Sí |
| `/profesionales/techos/alajuela/alajuela` | Sí | Sí | Sí |
| `/promociones` | Sí | Sí | Sí |
| `/promociones/[id]` | Sí | Sí | Sí |
| `/promociones/[id]/editar` | Sí | Sí | Sí |
| `/promociones/mis-promociones` | Sí | Sí | Sí |
| `/promociones/publicar` | Sí | Sí | Sí |
| `/proyectos` | Sí | Sí | Sí |
| `/proyectos/[id]` | Sí | Sí | Sí |
| `/publicar-proyecto` | Sí | Sí | Sí |
| `/registro` | No | No | No |
| `/registro/cliente` | No | No | No |
| `/registro/profesional` | No | No | No |
| `/resena-google` | No | No | No |
| `/reset-password` | No | No | No |
| `/servicio-no-disponible` | No | No | No |
| `/servicios` | Sí | Sí | Sí |
| `/soporte` | No | No | No |
| `/soporte/caso/[id]` | No | No | No |
| `/terminos` | No | No | No |
| `/tt` | No | No | No |
| `/verificacion-de-identidad` | No | No | No |
| `/wa` | No | No | No |

## Avisos y recuperación

Cambios locales: títulos multilínea en diálogos centrados; "Cuenta eliminada"; "Contactar soporte" y acciones con destinos concretos. Los avisos sin destino útil no presentan un botón que vuelve a las mismas notificaciones.

Lectura agregada de la cola: 1 pendiente, 0 procesando, 1 entregado al proveedor, 0 fallidos, 1.581 suprimidos. No representa todas las pruebas directas FCM ni confirma lectura humana. El worker suprime cuando no quedan tokens activos; la migración 201 también suprime pendientes mayores de seis horas. No interpretar todos los suprimidos como pérdidas recuperables.

No reenviar en bloque. Para recuperar algo: validar estado actual, usuario activo/token válido, aviso no leído, evento vigente y ausencia de entrega anterior; agrupar por usuario y prioridad. Excluir campañas ya registradas como recibidas, eventos resueltos, mensajes ya leídos y estados sustituidos. Preparar primero un informe de elegibilidad sin envíos. Conservar notification_id y recibos, nunca reiniciar toda la cola.

## Corrección del 25 de octubre de 2026

La tabla anterior conserva el diagnóstico previo. La política compartida ahora cubre perfiles cortos con y sin @, fichas /p /o /e /c, rutas largas, variantes ES/EN, mensajes, notificaciones, soporte, registro y páginas informativas. Los alias se normalizan a la pantalla canónica sin perder consulta ni fragmento. Los enlaces de campañas conservan atribución. No cambió la geografía ni la estructura de enlaces de búsqueda.

Apple: asociación regenerada con exclusiones de autenticación, administración, baja de correos y recursos. Android: entrada por ambos hosts con una actividad de enrutamiento; comprueba la misma política antes de entregar la URL a Capacitor. Las rutas del navegador se devuelven a un navegador concreto para evitar ciclos. El retorno nativo OAuth es una excepción separada con estado y PKCE, nunca navegación genérica. No se añadieron certificados debug/upload a la asociación de producción.

Pruebas: contratos de familias/idiomas/hosts/alias y rechazos; presentación real de las tarjetas con cuentas locales desechables, ES/EN, 320 y 390 px, Chromium móvil y WebKit móvil. Avisos sintéticos marcados push_suppressed; no reenvíos ni cambios de recibos de usuarios reales. Pendiente añadir el resultado de la compilación e instrumentación nativa al historial de publicación.

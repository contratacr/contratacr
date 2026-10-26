# Auditoría de carga y entrada móvil — 26 de octubre de 2026

Estado: investigación e implementación en curso. Este inventario no certifica la validación visual ni todas las acciones de cada ruta.

## Criterio común

- Profesionales, proyectos, promociones y empleos: primera tanda de 20; siguientes tandas con scroll. Skeleton del elemento completo únicamente si tarda; conservar resultados existentes.
- Contactos: resolver canal con los datos iniciales, respetando sesión y bloqueos. Nunca mostrar WhatsApp provisionalmente si el canal es desconocido. Ante fallo de red conservar reintento y respuesta honesta.
- Perfil y detalles: evitar cargas independientes en cada botón. Preparar sus datos juntos.
- Cuenta, seguridad, formularios, chat, adjuntos y administración: mantener indicación de operaciones reales al guardar, enviar, subir o verificar. No eliminar bloqueo de doble envío ni comprobaciones de seguridad para aparentar rapidez.
- Arranque desde URL: conservar cobertura de carga hasta que el destino se confirme; no añadir inicio al historial. Probar cerrado/abierto y eventos nuevos durante la resolución inicial.

## Hallazgos de contacto

- Búsqueda: ContactAvailabilityProvider con valores del servidor y tandas siguientes.
- Perfil profesional: faltaba la preparación inicial. ServerContactAvailability prepara el canal en servidor con caché limitada a la solicitud de React; no se comparte entre usuarios.
- Detalle de promociones: mismo problema; sus dos ubicaciones reciben la misma decisión preparada en servidor.
- Empleos/promociones en tablero: MarketplaceContactBoundary solo se activa con feed.enabled. El detalle de empleo ahora prepara su canal con los datos del empleador en JobsPageContent. Los listados reciben decisiones con cada página del feed.
- ProfessionalSchedule: dos ubicaciones de contacto compartidas por tarjetas y perfil.
- DirectChatLauncher: muestra botón Cargando cuando el canal es desconocido. Conservar mecanismo de respaldo mientras se completa la preparación de todas las superficies; no reemplazar por una acción incorrecta.
- Los call sites de DirectChatLauncher están en ProfessionalSchedule (perfil/búsqueda) y tableros de empleos/promociones. Favoritos y publicaciones enlazan al detalle; no hay un ProfessionalCard adicional fuera de búsqueda. Proyectos utiliza BotonEscribir: la consulta de permiso/contacto ocurre al pulsar, no una consulta de canal antes de pulsar. Las llamadas/contacto privado conservan sus verificaciones al actuar.

## Hallazgos de arranque

- CampaignAppLinks resuelve getLaunchUrl después de iniciar el documento base y escucha appUrlOpen.
- MobileAppBridge y NativeFirstRunOnboarding pueden ocultar splash por separado. La primera corrección no cubría todas las salidas. Ajuste adicional de bienvenida local, pendiente de regresión y prueba física.
- Se añadió cubierta del documento antes de pintar/hidratar; permanece aunque venza el timeout del splash nativo. Se retira al confirmar el pathname y un frame; parámetros/fragmentos se conservan y la comparación normaliza `/es` y barra final.
- La marca de lanzamiento pasó de sessionStorage a memoria del documento: una sesión restaurada no puede omitir getLaunchUrl en un nuevo documento. Un evento nuevo prevalece sobre el lanzamiento lento y un evento duplicado no vuelve a navegar.
- Límite arquitectónico: el binario actual solicita server.url al crear WebView; este cambio evita mostrar esa página antes del destino, no convierte la primera solicitud HTTP nativa en una solicitud directa al destino. Un cambio de arranque nativo requeriría otro candidato firmado. No se declara corregida la experiencia física sin repetirla en el iPhone.

## Fuentes oficiales

- https://capacitorjs.com/docs/guides/deep-links
- https://capacitorjs.com/docs/apis/splash-screen
- https://developer.apple.com/design/human-interface-guidelines/progress-indicators

## Inventario completo de pantallas

71 entradas `page.tsx`, incluidas administración y rutas de acceso. «Servidor/Cliente» describe la entrada de la ruta, no todos sus descendientes. Esta clasificación es una revisión de código; no sustituye una prueba visual individual en iOS/Android.

| Ruta | Familia | Entrada | Criterio de carga |
| --- | --- | --- | --- |
| `[locale]/admin/actividad` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/analitica` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/aseguradoras` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/campanas` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/categorias` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/cobertura` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/contactos` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/costos` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/cuentas` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/empleos` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/identificaciones` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/login` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/promociones` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/proveedores/[id]` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/publicaciones` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/reportes` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/resenas` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/servicios` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/soporte` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/usuarios/[id]` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/usuarios` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/admin/verificacion` | Administración | Servidor | Lectura privada; conservar datos al refrescar; espera al guardar/verificar |
| `[locale]/ayuda` | Información y portada | Cliente | Contenido estable; sin consultas de canal por botón |
| `[locale]/baja-correos` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/buscar` | Catálogo | Servidor | 20 resultados; siguiente tanda sin vaciar los existentes |
| `[locale]/categorias` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/como-funciona` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/completar-perfil` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/contacto` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/continuar-perfil` | Cuenta y actividad | Servidor | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/cotizacion/[code]` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/cotizar` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/dashboard/cliente` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/dashboard/profesional` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/eliminar-cuenta` | Acceso | Servidor | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/empleos/[id]/editar` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/empleos/[id]` | Detalle empleo | Servidor | Canal junto con ficha; espera solo al abrir/enviar |
| `[locale]/empleos/mis-empleos` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/empleos` | Catálogo | Servidor | 20 resultados; siguiente tanda sin vaciar los existentes |
| `[locale]/empleos/publicar` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/login` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/mantenimiento` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/mejorar-mi-perfil` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/mensajes` | Cuenta y actividad | Servidor | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/notificaciones` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/olvide-contrasena` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/onboarding` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/privacidad` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/profesionales/[slug]` | Detalle profesional | Servidor | Canal junto con ficha; espera solo al abrir/enviar |
| `[locale]/profesionales` | Catálogo | Servidor | 20 resultados; siguiente tanda sin vaciar los existentes |
| `[locale]/promociones/[id]/editar` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/promociones/[id]` | Detalle promoción | Servidor | Canal junto con ficha; espera solo al abrir/enviar |
| `[locale]/promociones/mis-promociones` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/promociones` | Catálogo | Servidor | 20 resultados; siguiente tanda sin vaciar los existentes |
| `[locale]/promociones/publicar` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/proyectos/[id]` | Detalle proyecto | Servidor | Datos iniciales; validar permiso al contactar |
| `[locale]/proyectos` | Catálogo | Servidor | 20 resultados; siguiente tanda sin vaciar los existentes |
| `[locale]/publicar-proyecto` | Publicación y gestión | Servidor | Datos iniciales; espera al guardar/subir/consultar permisos |
| `[locale]/registro/cliente` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/registro` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/registro/profesional` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/resena-google` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/reset-password` | Acceso | Cliente | Formulario estable; espera al autenticar/guardar, sin saltarse controles |
| `[locale]/servicio-no-disponible` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/servicios` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/soporte/caso/[id]` | Cuenta y actividad | Servidor | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/soporte` | Cuenta y actividad | Cliente | Datos privados; caché por usuario; espera en acciones reales |
| `[locale]/terminos` | Información y portada | Servidor | Contenido estable; sin consultas de canal por botón |
| `[locale]/verificacion-de-identidad` | Cuenta y actividad | Servidor | Datos privados; caché por usuario; espera en acciones reales |

## Fallbacks de carga existentes

- `src/app/[locale]/profesionales/[slug]/loading.tsx`
- `src/app/[locale]/publicar-proyecto/loading.tsx`

## Validación de esta revisión

- 48 casos de navegador en Chromium escritorio/móvil y WebKit móvil: lanzamiento demorado, evento más reciente, almacenamiento restaurado, cubierta antes de hidratación, canales preparados sin consulta duplicada, cambio de usuario y recuperación de canal.
- 45 casos adicionales en los mismos motores: tandas de 20 en proyectos/promociones/empleos, respuesta lenta, filtros y reintento; repetición de lanzamiento con parámetros, fragmento y barra final.
- Estos harnesses montan los componentes reales con adaptadores controlados. No son una prueba del splash nativo ni de Universal Links del sistema.
- Pruebas integradas de perfil con datos privados, marca, CI y comprobación física: en curso. Publicación bloqueada hasta aprobarlas.

## Esperas que no deben eliminarse

Mensajes, notificaciones, identidad, permisos y formularios necesitan datos o una confirmación del servidor. Mostrar contenido previamente confirmado durante una actualización y preparar datos juntos reduce saltos; prometer que nunca habrá carga fuera de las cuatro listas sería incorrecto en una conexión lenta o sin red. No se añadió un retraso artificial ni se retiraron controles de acceso, bloqueo o doble envío.

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
- Marca integrada: 3 casos aprobados. El usuario confirmó el 26-oct-2026: «al presionar los links ya no lleva a inicio primero». También respondió a la prueba de app cerrada/abierta: «Ambos llegan sin inicio y el contacto aparece listo». Queda aprobada esa matriz física de iPhone y el contacto del perfil; no certifica por sí sola todas las superficies ni la distribución firmada por Google Play. CI de contactos y móvil sigue en curso. Publicación bloqueada hasta aprobar los controles restantes.

## Esperas que no deben eliminarse

Mensajes, notificaciones, identidad, permisos y formularios necesitan datos o una confirmación del servidor. Mostrar contenido previamente confirmado durante una actualización y preparar datos juntos reduce saltos; prometer que nunca habrá carga fuera de las cuatro listas sería incorrecto en una conexión lenta o sin red. No se añadió un retraso artificial ni se retiraron controles de acceso, bloqueo o doble envío.

- Se canceló la exhaustiva adicional 40367837442 mientras estaba pendiente: conservar la pasada actual con regresiones de contacto/enlaces y la móvil evita duplicar la batería completa por cambios posteriores de comentarios/configuración. Esta nota documental se guarda localmente para incorporarla al siguiente registro necesario, sin provocar otro CI por sí sola.


## Encabezados y búsquedas — cierre del 28 de octubre de 2026

Fuente compartida `221e182f` (main/test), integrada en mobile `bb098e51`.
Esta revisión visual no modifica entradas nativas ni necesita nuevos paquetes
de tienda. El trabajo local de Pro quedó intacto: al integrar Pro se debe
conservar este arreglo compartido, en lugar de restaurar encabezados antiguos.

### Investigación y corrección

- En producción, el encabezado de Proyectos tenía 8 px de separación adicional
  entre las cajas del símbolo y el título, además del margen transparente del
  símbolo, y texto de 17 px. `SectionBrand` agrupa símbolo de 32 px y título de
  19 px sin gap añadido, como el conjunto de marca de inicio. Se usa en los tres
  tableros, Servicios y las secciones raíz de la barra compartida; conserva los
  títulos y la semántica h1/p correspondiente.
- En la búsqueda de profesionales, servicio empezaba en x=77 y ubicación en
  x=73 (viewport móvil de 390 px). Back reservaba 40 px, mientras ubicación
  mezclaba un icono de 24 px con márgenes y padding diferentes. Ahora ambos
  campos comparten fila, espacio inicial de 40 px e inset de texto de 8 px,
  incluyendo los buscadores de proyectos, empleos y promociones. Ambos textos
  empiezan en x=77. Se igualaron también color y placeholder.

### Evidencia

- Nueve comprobaciones de marca/encabezados/búsqueda aprobaron en Chromium
  escritorio, Chromium móvil y WebKit móvil: logo sin fuentes web, cinco rutas
  de encabezados y las cuatro superficies de búsqueda, incluyendo inglés,
  campos vacíos/escritos/borrados y el botón de volver.
- [Regresión 40640703673](https://github.com/contratacr/contratacr/actions/runs/40640703673): contratos, inventario, tipos, build, verificaciones previas y resultado final aprobados. Smoke final: 927 aprobadas y 45 omisiones declaradas, sin fallos, flakies ni omisiones inesperadas. El bloque Safari reportó 96 aprobadas; no sumar bloques solapados como casos únicos.
- [WebView 40640703456](https://github.com/contratacr/contratacr/actions/runs/40640703456): 178 aprobadas y 4 omisiones previstas. Los jobs de iOS simulador y Android emulador quedaron omitidos por la política existente; no se ejecutaron.
- Seguridad main/test `40640703481` / `40640703727` y Cloudflare main/test/mobile `40640703563` / `40640703838` / `40640703514`: aprobados.
- Veintiuna comprobaciones HTTP y de geometría desplegada aprobaron en
  producción/test, incluyendo www e inglés. Se observaron el 28-oct-2026 a las
  00:08:39 de Costa Rica (06:08:39 UTC): símbolo 32 px, gap añadido 0, título
  19 px y ambos textos de búsqueda alineados. Es una observación del despliegue,
  no una nueva prueba física de iPhone/Android ni una publicación de binarios.

Las notas históricas de CI/tiendas pendientes de apartados anteriores describen
su revisión original; no representan el estado de esta validación. Los estados
de tiendas y builds se registran en `docs/mobile-release-history.md`.


## Unificación de todos los títulos de navbar — 28 de octubre de 2026

La ampliación `563e9c77` (main/test), integrada en mobile `61bdb134`, elimina
las diferencias que todavía tenían las cabeceras interiores. Todos los títulos
de navbar reutilizan `CABECERA_TITULO`: 19 px, peso 800 y línea de 24 px, sin
overrides de tamaño/peso por breakpoint. Incluye marca/sección, flecha de volver,
tableros de escritorio, panel, AI, conversación, soporte, filtros y formularios
fullscreen/sheet. Los títulos del contenido/documentos y avisos centrados no
son navbars y mantienen su jerarquía. Pro local quedó intacto.

- Pruebas locales de componentes reales y CSS generado: Chromium escritorio,
  Chromium móvil y WebKit móvil; anchos 320/390/768/1440, títulos largos sin
  overflow, Back accionable y formularios fullscreen/sheet/sheet-compact.
  También se verificaron las cabeceras de filtros reales en móvil/escritorio.
- [Regresión 40707452593, intento 2](https://github.com/contratacr/contratacr/actions/runs/40707452593/attempts/2): aprobada. Smoke final: 929 aprobadas y 45 omisiones declaradas, cero fallos, flakies u omisiones inesperadas en ese intento. Safari: 97 aprobadas y 4 omisiones previstas; los bloques se solapan, no sumar como casos únicos.
- [WebView 40707451640](https://github.com/contratacr/contratacr/actions/runs/40707451640): 178 aprobadas y 4 omisiones previstas. Los jobs iOS simulador y Android emulador se omitieron por política, no se ejecutaron.
- Seguridad main/test `40707452029` / `40707452441` y Cloudflare main/test/mobile `40707452464` / `40707453118` / `40707451527`: aprobados.
- Veinte mediciones desplegadas aprobaron en producción/test, ES/EN y
  móvil/escritorio: tableros desktop, Servicios con flecha y filtros. Todas
  confirmaron 19 px/800/24 px. Observado a las 08:49:31 de Costa Rica
  (14:49:31 UTC). No se repitieron pruebas físicas ni se publicaron binarios.

El primer intento de regresión falló por `read ECONNRESET` en el transporte de
un POST local de la prueba de documentos, antes de recibir respuesta para su
aserción. No hubo cambio de API ni se estableció una causa definitiva. Se
reintentó únicamente el job fallido, con fuentes y aserciones intactas; se
conservaron las demás compuertas aprobadas. El segundo intento aprobó, incluido
el caso afectado. No presentar el primer intento fallido como verde.

## CRÍTICO abierto — bloqueo/pantalla blanca al alternar apps o iniciar sesión (29-oct-2026)

Reporte de Isaac: ocurre en iPhone y Android al regresar rápidamente desde otra
app y con distintos métodos de inicio de sesión. No se considera cerrado por
pasar una prueba aislada ni por corregir una sola causa.

Base de investigación: `e748cdbd` compartido. Defectos investigados con
componentes/lógica reales y transportes aislados:

- La deduplicación de señales de foreground (2 s) ignoraba una segunda suspensión
  real rápida. Un candado huérfano quedaba activo. Las cuatro variantes web/nativo
  en Chromium/WebKit fallaron antes del arreglo. Ahora cada ciclo suspendido se
  recupera; se siguen agrupando señales duplicadas del mismo regreso.
- Lecturas de sesión iniciadas antes de SIGNED_IN/SIGNED_OUT podían llegar tarde
  y deshacer el evento más reciente. Reproducción negativa en arranque y regreso.
  Ahora una revisión invalida esas lecturas y los reintentos antiguos, incluidos
  los de perfil. Un evento válido también termina el estado de carga aunque la
  lectura inicial nunca responda. No se altera la validación servidor/MFA.

También se corrigió el manejo de errores devueltos por getSession al arrancar
y en su reintento: un error conserva la identidad conocida, mientras SIGNED_OUT
sí se aplica. Se comprueba con error inicial persistente y con error al reanudar.

Regresiones permanentes: `recuperacion-al-desbloquear.spec.ts` cubre cuatro vueltas
rápidas, borradores/adjuntos/cookies, suspensión corta/larga, offline/reconexión,
limpieza de listeners, candados de diálogos, respuestas tardías y lecturas colgadas
con SIGNED_IN/SIGNED_OUT. `reanudar-la-app.spec.ts` añade cinco vueltas rápidas al
recorrido real con red interrumpida, panel y borradores de chat en base aislada.
Este último recorrido requiere CI y sus fixtures: no se sembró producción.

Validación focal: 34 casos finales de recuperación/sesión en motores móviles,
8 casos de navegación móvil y 15 casos de MFA/enlaces de arranque en tres motores.
No confundir estos casos aislados con ejecución de todos los proveedores OAuth
en dispositivos físicos. Se conserva la cubierta de enlaces hasta confirmar destino y se conserva
MFA: no se retiran barreras de seguridad para mostrar contenido.

Pendiente para cierre crítico: CI de esta revisión, prueba física repetida en
ambas plataformas con correo/contraseña, Google y Apple donde estén disponibles,
y captura de diagnóstico del episodio si reaparece. Diferenciar DOM bloqueado,
fallo de navegación/red, restauración de sesión y terminación del renderer por el
sistema. Capacitor iOS ya maneja webViewWebContentProcessDidTerminate con reload;
no se ha probado aquí que ese mecanismo recupere un proceso real terminado ni se
ha cambiado el binario. Un navegador simulado no certifica ese caso. No borrar
sesiones/borradores ni introducir recargas automáticas indiscriminadas.

Video de referencia de navegación: muestreo cada 25 ms entre 1,85 y 2,43 s muestra
entrada visible aproximadamente 1,85–2,00 s; no es medición de constantes internas
de Facebook. Ajuste compartido: ocultación60 ms y entrada160 ms con inicio gradual.
Pruebas verifican posiciones intermedias y gesto rápido, no solo estado final.

### Continuación de investigación — 28-oct-2026, Costa Rica

La comprobación desplegada de lectura en producción/test pasó en Chromium y
WebKit móviles para login/búsqueda, diez vueltas rápidas por recorrido. Login
conservó el texto sin enviarlo; no había cubierta ni body inert/position fixed,
y health respondió200. Evidencia local `/tmp/ccr-live-resume-proof.json`.
Esto no es autenticación real ni suspensión física del proceso.

Otro bloqueo reproducido: `SocialLogin.initialize()` sin respuesta dejaba pendiente
la operación de login. Ahora ese paso técnico tiene plazo10s, diagnóstico de
categoría fija y permite reintentar. La hoja interactiva de selección de cuenta no
tiene ese plazo. Seis casos en Chromium/WebKit cubren Google Android/iOS y Apple
iOS, inicialización colgada, reintento y selección de cuenta prolongada120s.
No se alteró el flujo PKCE distinto de Apple Android. Logs `/tmp/ccr-init-before.log`
(fallo esperado pending), `/tmp/ccr-init-after.log` (corrección). Tipos/lint pass.

Al registrar esta continuación los CI web40818961240 y mobile40818971041 de
`f2c3ea2d`/`bb69e836` siguen en ejecución. Seguridad y Cloudflare aprobaron.
El arreglo adicional debe pasar sus propias compuertas tras publicarse; no hereda
aprobación del SHA previo. El iPhone emparejado estaba desconectado y se pidió
conectarlo para diagnóstico físico. No se tocó ningún simulador de otros trabajos.
El caso crítico continúa abierto hasta validación física y CI, sin prometer que
las causas encontradas expliquen todas las pantallas blancas reportadas.

### Investigación física de bloqueo de WebKit — 28 de octubre de 2026

En el iPhone 16 Pro con iOS 26.6.2, la sesión se conservó al instalar una
compilación Debug como actualización, sin desinstalar ni borrar el contenedor.
El usuario reprodujo el congelamiento al alternar apps. El Inspector dejó de
responder incluso a una expresión constante. Dos capturas de pila mostraron el
hilo principal WebContent esperando `RemoteImageDecoderAVF::createFrameImageAtIndex`
y el hilo principal GPU esperando `WebCoreDecompressionSession::decodeSampleSync`
a través de `ImageDecoderAVFObjC`. La guía usaba MP4 dentro de `img` en Safari.
Esto identifica una ruta de bloqueo físico; no demuestra que explique todos los
casos de login ni los fallos Android.

El candidato elimina esa ruta y utiliza `video` en todos los motores, mantiene
las tomas/posters y pausa al ocultarse. El componente real con transporte de
medios simulado aprobó tres motores y cinco ciclos de ocultar/mostrar por motor,
verificando pausa, reanudación, pestaña conservada y ausencia de MP4/blob en img.
En una vista nativa aislada con el componente corregido y los MP4 reales, seis
cambios físicos Facebook/ContrataCR conservaron respuesta del Inspector y vídeo
en reproducción. Evidencia local: `/tmp/ccr-guide-physical-cycles.jsonl`.
La vista aislada no valida la portada completa, autenticación ni Android.

Estado: ABIERTO. Regresión web `40818961240` aprobó el runtime anterior; WebView
`40818971041` falló dos veces en entrega en tiempo real de chat (198 aprobadas).
Esos resultados no certifican el candidato actual. Falta resolver el fallo de
chat, validar integración desplegada y repetir los recorridos físicos completos.

La investigación del chat reprodujo además una ventana sin reconciliación:
la primera lectura HTTP puede preceder a la confirmación del canal y perder
inserciones de ese intervalo. Una prueba del efecto real con transporte
controlado falló en ambos motores antes del cambio y aprobó en ambos después:
al recibir SUBSCRIBED se actualiza el hilo y se ignoran confirmaciones de
canales retirados. No establece por sí sola que esta sea la causa de los dos
fallos anteriores de CI. La aserción de entrega en 15 segundos se conserva y
adjunta únicamente estados del protocolo, sin payloads ni credenciales, para
verificarlo en la siguiente ejecución aislada. El candidato final de la guía
sin autoPlay aprobó otros dos ciclos físicos; siguen siendo una vista aislada,
no certificación de portada completa, login o Android. El incidente sigue abierto.

### Portada y cinta de marcas según sesión

Se añadió una regresión de portada que comprueba el avance de los cuatro juegos
visibles de marcas en tres intervalos consecutivos, tanto sin iniciar sesión
como con la cuenta sintética aislada de regresión. La prueba confirma que las
animaciones Web Animations permanecen activas mientras la cinta está visible;
se mantiene separada de la comprobación visual de huecos y de las pruebas de
cambio de app. No reproduce una credencial ni modifica datos de producción.

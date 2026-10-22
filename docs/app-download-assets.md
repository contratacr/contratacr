# Recursos de la sección de descarga

## Foto anterior (ya no se muestra)

- Autor: Valentin Ilas.
- Fuente: https://www.pexels.com/photo/smartphone-on-wooden-table-33039024/
- Licencia revisada: https://www.pexels.com/license/ (permite uso gratuito, modificaciones y banners de producto).
- Archivo local optimizado: `public/stores/app-phone-table.webp`.
- Se conserva el recurso y su atribución, pero fue sustituido por un mockup frontal para evitar desalineación y distorsión al ampliar.

## QR

- Destino permanente: `https://contratacr.com/#descargar-app`.
- Generado con `qrcode`, corrección H y margen de cuatro módulos.
- Logo existente `public/logo-mark-transparent.png`, integrado en el centro sobre fondo blanco; área de siete módulos en un SVG de 45 × 45 módulos (incluye margen).
- Verificado con decodificador ZXing a 112, 168 y 256 píxeles; todos devuelven el destino exacto.

## Aviso y footer

El aviso aparece arriba en navegación pública móvil, detecta iOS/Android, permanece fijo al desplazar y se puede cerrar por 30 días. No aparece en la app nativa, formularios ni tareas privadas. El enlace compartido con `#descargar-app` vuelve a mostrarlo aunque se hubiera cerrado, para que siempre ofrezca las tiendas. El footer de escritorio muestra accesos mediante los símbolos de Apple y Android con nombres accesibles.

## Texto y encaje de la pantalla

Referencias en español: https://www.habitissimo.es/landing/app-movil-pro y https://promo.milanuncios.com/app/. Se adopta una invitación directa a descargar acompañada de beneficios concretos, con redacción propia para clientes y profesionales.

Texto: «Descarga la app de ContrataCR». Descripción: «Encuentra profesionales, publica proyectos u ofrece tus servicios desde tu celular». Ayuda: «Ingresa con tu cuenta de siempre».

`AppPhonePreview` muestra la captura real `public/guia/profesionales.jpg` completa y sin deformación dentro de un marco frontal hecho con CSS. La imagen mantiene su relación de aspecto, sin mallas ni perspectiva. El dispositivo está centrado en la segunda columna del mismo contenedor que el texto; el fondo radial usa los colores de ContrataCR. No se presenta como fotografía de un dispositivo real.

## Marco azul y videos actualizados (13 de octubre de 2026)

Referencia original revisada: `/Users/contratacr/Desktop/contratacr/traspaso-ia/generador-capturas/componer3.py`. El generador de capturas de tienda usaba azul RGB (0,159,217), borde negro RGB (20,20,24) y botones negros. Se replica en el mockup de descarga y el marco de «Así funciona ContrataCR».

Los cuatro videos y sus pósters se regeneran con `scripts/landing/grabar-guia.mjs`, usando pantallas públicas actuales de producción en formato móvil. Muestran navegación a profesionales/proyectos/empleos/promociones, check junto al nombre, explicación de identidad y detalle. No se inicia sesión ni se envían formularios o mensajes; se excluye la grabación de analítica. El guion ya no lee credenciales ni borra datos. Los recursos llevan versión en la URL para renovar copias en caché.

## Fondo acogedor (13 de octubre de 2026)

Generado con la herramienta integrada ImageGen, sin usar fotografías de personas ni modificar la captura de la app. Fuente conservada: `/Users/contratacr/.codex/generated_images/01a123d4-a531-7e02-86e3-2a3735a2639b/exec-58f106e0-e246-4032-b47d-fd367067597d.png`. Recurso web optimizado: `public/stores/app-home-background-20261013.webp`. El teléfono y todos los textos siguen siendo componentes reales de la página.

Prompt final:

> Use case: photorealistic-natural. Asset type: wide background photograph for the ContrataCR mobile app download section, approximately 2:1 landscape. Create a warm, approachable, naturally lit Costa Rican home workspace: pale warm plaster wall, a light oak tabletop along the bottom, a modest green plant near the far right edge, a window on the far right with a softly out-of-focus lush tropical garden. Quiet everyday home, professional editorial photography, realistic wood texture, soft morning sunlight, welcoming and calm, no luxury showroom styling. Composition: the left 55 percent is a clean low-detail warm wall with subtle shadows for an eventual dark navy text overlay. The center of the right half is uncluttered negative space for a tall front-facing phone mockup that will be added in website code; keep background behind it simple and softly focused. Do not draw a phone, screen, text, icons, logos, badges, people, or additional UI. Color palette warm cream, honey oak, soft leaf green with subtle cool teal shadows. Photorealistic, high quality, restrained natural detail, wide horizontal banner framing.

## Imagen elegida por Isaac (13 de octubre de 2026)

La composición actual usa la descarga «ContrataCR en el taller de carpintería.png», creada por Isaac con ChatGPT web. Sustituye el fondo acogedor y el teléfono CSS en la sección de descarga. El PNG original se conserva byte por byte en `public/stores/app-carpentry-original-20261013.png`: 2172 × 724 píxeles, 1 904 435 bytes. Se sirve con `unoptimized`, sin conversión ni recompresión. En escritorio acompaña el texto como fondo; en web móvil se muestra completa, sin recorte, encima del texto y los enlaces. El footer muestra los iconos de Apple y Android en ambos tamaños; los avisos de descarga siguen ocultos en la app nativa.

SHA-256 original y publicado: `822760b76569dce4a254125b8e176a40948a9a708005e7bc4f8247969dc716fd`.

El enlace compartido `/#descargar-app` ahora lleva a la sección tanto en PC como en móvil y reserva el espacio del header y del aviso superior.

## Recorridos de la guía recuperados (13 de octubre de 2026)

Se recuperan los pasos del guion de `82e4d766`, regrabados con la interfaz actual. La actualización anterior mostraba tarjetas, el modal del check y un detalle; sustituyó por error los recorridos completos.

- Profesionales: portada → buscar cámaras de seguridad → Alajuela → resultados → SG Solutions → servicios → reseñas → casos de éxito → formación → señalar WhatsApp sin abrirlo.
- Proyectos: portada → menú → Proyectos → tablero → señalar Publicar proyecto → formulario vacío y desplazamiento.
- Promociones: portada → menú → Promociones → tablero → señalar Publicar promoción → formulario vacío y desplazamiento.
- Empleos: portada → menú → Empleos → tablero → señalar Publicar empleo → formulario vacío y desplazamiento.

Las pantallas públicas son de producción, con analítica excluida y solicitudes de escritura bloqueadas. Los formularios se muestran en el servidor local del test actual con el actor sintético de regresión; no se llenan ni se envían y no se ejecuta limpieza de datos. Se conservan el desplazamiento suave a 30 fps, los toques visibles y los fundidos de la grabación anterior. Los nuevos recursos usan `?v=20261013-original-flow`.

Para repetir los formularios desde main, establecer `GUIDE_TEST_ENV_FILE` en el archivo privado `.env.test` del checkout test y `GUIDE_FORM_BASE` en su servidor loopback. El guion verifica el proyecto de test antes de iniciar la sesión.

El encuadre de escritorio usa una altura mínima de 540 px, que crece con la proporción 3:1 del original en pantallas amplias. Reduce la ampliación y el recorte lateral frente a los 620 px anteriores. Por debajo del diseño de escritorio amplio se mantiene la imagen completa sobre el texto, evitando que el teléfono quede detrás del contenido. El PNG permanece idéntico.


## Guía con detalles y contacto (13 de octubre de 2026)

Sustituye los recursos `original-flow` por `20261013-detail-contact`:

- El grabador carga todas las fuentes reales de la app y cambia `font-display:optional` a `block` solamente en las hojas de estilo interceptadas durante la captura. Así una navegación en frío no conserva la tipografía de sistema. El logo sigue siendo el componente real, sin superponer otro dibujo.
- Profesionales conserva búsqueda, SG Solutions, servicios, reseñas, casos de éxito y formación, y termina tocando WhatsApp.
- Proyectos, promociones y empleos conservan el recorrido por Publicar y su formulario vacío; después vuelven al tablero, abren una publicación, muestran sus datos y terminan tocando WhatsApp.
- El proyecto «Instalar cámaras de seguridad en una casa» se crea con un UUID exclusivo en el test actual. Usa un cliente sintético, un contacto sintético y un texto de ejemplo; se elimina por UUID y marcador de ambiente al terminar. No se modifica la siembra canónica. Promociones y empleos muestran publicaciones públicas reales.
- El contacto apunta al cliente en proyectos, al empleador en empleos y al profesional en promociones/perfiles. Se intercepta la salida externa para no mostrar conversaciones ni enviar mensajes. En test se comprueba la respuesta real del botón de proyectos. En producción el endpoint de WhatsApp se simula con el número real obtenido mediante una consulta de solo lectura; así la grabación no genera seguimientos de reseñas ni contactos en producción. Esto valida el destino y la interfaz de la demostración, no una conversación dentro de WhatsApp.

El grabador requiere el archivo privado de producción para esas consultas de solo lectura (`GUIDE_PRODUCTION_READ_ENV`, por defecto `.env.local`), además del archivo privado del test indicado anteriormente. No se guardan credenciales en el video ni en el repositorio.

Validación: decodificación completa de los cuatro H.264 a 588 × 1278 y 30 fps, reproducción y cambio de pasos en Chrome/WebKit móvil y escritorio, y comprobación de que no quedaron proyectos `guide-demo-test` en la base de test. Las capturas de detalle muestran el check junto al nombre y la cabecera real de cada sección. No se probó una conversación dentro de WhatsApp.


## Descarga responsive y proporciones de tiendas (13 de octubre de 2026)

En web móvil el encuadre usa `object-cover/object-right` para mostrar el teléfono a mayor tamaño, con un degradado hacia el fondo de la sección. El texto y los botones quedan centrados y se reducen los márgenes. Es un cambio de presentación CSS: el PNG original de 2172 × 724 permanece intacto y sin recompresión.

App Store y Google Play comparten una altura visible de 40 px en teléfonos y 48 px desde 640 px. El área pulsable conserva al menos 48 px de alto. El PNG español de Google tiene límites visibles (0, 29, 646, 221); el inglés (41, 41, 605, 209). Se normaliza ese margen transparente mediante un contenedor CSS, sin deformar el diseño ni editar los archivos oficiales. El ancho conserva las proporciones propias de cada tienda.

Validado en español e inglés, en Chrome y WebKit, a 320, 390, 768 y 1440 px: botones alineados, sin salto de fila ni desbordamiento. Pasaron además nueve casos existentes de ocultación en app nativa, enlace compartido y enlaces del footer.


## QR directo a las tiendas (13 de octubre de 2026)

El QR nuevo contiene `https://contratacr.com/descargar`, no el ancla de la sección web. La ruta GET pública elige App Store para iPhone/iPad, Google Play para Android y la sección web para navegadores sin plataforma móvil detectable. La decisión se toma en el servidor y no depende de iniciar sesión ni de JavaScript. Responde con 307, `Cache-Control: private, no-store` y `Vary: User-Agent, Sec-CH-UA-Platform` para no reutilizar la tienda de otro dispositivo. Middleware deja pasar esta ruta antes de las reescrituras de idioma y perfiles.

El SVG se reproduce con `scripts/landing/generar-qr-descarga.mjs`, corrección H, 41 módulos con margen de cuatro. Se muestra a 144 × 144 px. El logo ocupa ocho módulos; una ventana SVG usa los límites visibles del PNG original (38, 40, 177, 174), eliminando solamente el espacio transparente del encuadre. La marca visible central pasa de unos 9 px a unos 28 px. La máscara blanca mide diez módulos y los módulos oscuros usan formas rellenas.

Lectura verificada con ZXing sobre capturas de Chrome y WebKit a 144, 168 y 256 px. A 112 px pasó Chrome, pero no WebKit; por eso no se usa ese tamaño en la sección. Pasaron los doce casos de navegación, QR/tiendas, caché, enlace compartido y ocultación en la app nativa. El enlace `/#descargar-app` que Isaac ya compartió conserva la sección web; los QR de capturas antiguas conservan ese destino anterior.


## Publicación antes del formulario (13 de octubre de 2026)

Los videos de proyectos, promociones y empleos usan ahora `20261013-detail-before-form`: portada → menú → tablero → abrir publicación → mostrar su detalle y contacto → volver al tablero → Publicar → formulario vacío. Conservan el logo y las fuentes reales, los toques visibles y el contacto sin enviar mensajes. El video de profesionales conserva su grabación anterior.

Cada detalle y formulario comienza con los contenedores de desplazamiento en cero. El detalle se recorre hasta su final real, sin un desplazamiento fijo que deje contenido fuera. El grabador también reconoce contenedores con desplazamientos cortos: antes ignoraba los que tenían menos de 200 px de recorrido. El proyecto de ejemplo y el formulario se revisaron visualmente desde su encabezado, sin empezar a media pantalla. No se envía ningún formulario. El proyecto de test se elimina al concluir.

Se guardaron capturas de inicio/final del detalle e inicio del formulario para las tres escenas, y se verificó la decodificación completa de los videos nuevos.

## Encuadre y navegación pública sin sesión (13 de octubre de 2026)

Los cuatro clips se regraban con `20261013-anonymous-framing`. El video omite la barra de estado del sistema; ahora la emulación reserva 0 px arriba y 34 px para el indicador inferior. Antes se reservaban 62 px arriba sin dibujar la barra de estado, dejando los campos de servicio y ubicación artificialmente bajos. Se elimina también el ajuste CSS exclusivo de formularios: todas las pantallas comparten el mismo encuadre y conservan sus estilos reales.

Portada, menú, tableros y detalles se recorren sin sesión en las cuatro escenas. Proyectos ya no muestra el perfil del actor sintético en el menú. Al tocar su WhatsApp aparece el aviso real que pide ingresar con una cuenta profesional; se muestra y se cierra. Solo después, durante el corte al formulario vacío local, se añaden las cookies del actor de test. Ningún formulario se envía y no se contacta a terceros. El proyecto de demostración continúa siendo exclusivo del test aislado y se elimina al terminar.

El grabador comprueba que el campo Servicio queda como máximo a 32 px del borde superior (incluido el margen interior del campo) y que el menú público no ofrece «Ir a mi panel». Guarda capturas del buscador, menú sin sesión, tablero desde arriba, detalle inicial/final, aviso de contacto y formulario. La cabecera de proyectos se revisa completa en esos encuadres.

El regreso del detalle usa ahora la flecha real de la app. La recarga completa anterior podía reservar otra cabecera por encima del tablero; las capturas de regreso confirman que el logo y el buscador permanecen en el borde superior. Se verificó la decodificación completa de los cuatro MP4 y seis pruebas de la guía en Chrome móvil, WebKit móvil y escritorio. Las pruebas reconocen los dos motores existentes: video HTML silenciado/en línea en Chrome e imagen MP4 animada decodificada en Safari; antes exigían erróneamente un elemento video también en Safari.

## Dos fotografías y contenido superpuesto (13 de octubre de 2026)

Isaac eligió las dos descargas de las 13:14. Se conservan byte por byte, sin conversión ni recompresión:

- Escritorio: `public/stores/app-workshop-desktop-20261013.png`, 1672 × 941. SHA-256 `7b23dcef008bfa6f1e8eabd2e91cbb081ebe1a7c350db1d98a24f5e64027f976`.
- Móvil: `public/stores/app-workshop-mobile-20261013.png`, 941 × 1672. SHA-256 `dd48a1bdbe449dbce4e33ce898e134047f1b8d95d896be39839835e6f1dc43a5`.

Un `picture` selecciona la fotografía vertical hasta 639 px y la horizontal desde 640 px. El título y la descripción son HTML real sobre la imagen: debajo del teléfono en móvil y a la izquierda desde tablet. No se añaden capas azules ni degradados; una sombra neutra del texto mejora su lectura. Los botones mantienen sus proporciones normalizadas. El QR sigue visible desde 1024 px con el destino `/descargar`, y el enlace compartido `/#descargar-app` se conserva. La sección sigue oculta dentro de la app nativa.

El ancho explícito y `min-width:0` evitan que WebKit amplíe la sección al combinar la proporción de la foto con la altura mínima. Se comprueban los límites del viewport y los botones también a 320, 768 y 1440 px, leyendo los rectángulos en un mismo cuadro para no confundir la alineación del ancla con un desbordamiento. Capturas visuales en español/inglés y Chrome/WebKit conservadas fuera del repositorio en `evidencia-pruebas-moviles/descarga-imagenes-20261013`.

## Aviso superior exclusivo de web móvil (13 de octubre de 2026)

El aviso requiere una plataforma móvil detectada (iOS/Android), además de las condiciones existentes de ancho, sesión nativa, página y cierre. Una ventana estrecha de PC/Mac ya no muestra los dos botones de tiendas encima del navbar ni reserva sus 76 px. La sección de descarga y los enlaces del footer permanecen disponibles. Se verifica con y sin JavaScript en escritorio, a 390/800/1000 px, y se conservan las pruebas de iPhone/Android, rutas públicas, teclado y cierre persistente.

## Proyecto sin ventana de acceso en la guía (13 de octubre de 2026)

El clip de proyectos usa `20261013-project-contact-highlight`: señala WhatsApp con el marcador de toque sin ejecutar el contacto ni mostrar la ventana que pide ingresar. Después regresa con la flecha al tablero y muestra el formulario. La navegación pública sigue sin sesión y el demo solo existe en test durante la grabación; se elimina al terminar. La protección real para contactar al cliente no se modifica.

Auditoría de publicación: `/publicar-proyecto` permite abrir el formulario sin sesión; al enviar conserva el borrador y solicita acceso. La API exige una cuenta autenticada, pero no un perfil profesional: mantiene el rol cliente y permite también que un profesional publique como cliente. Las páginas de empleos/promociones solicitan crear el perfil profesional si falta; sus API comprueban además que la ficha pertenezca al usuario. Se añade una prueba con un cliente desechable sin ficha profesional, eliminándolo al terminar; no se envía ningún proyecto ni notificación de contacto.

## Compact original artwork — 13 October 2026

Use Isaac's two Downloads from 14:51, copied byte-for-byte, not the generated alternatives:
- `app-workshop-desktop-compact-20261013.png`: 2172×724, 3:1.
- `app-workshop-mobile-compact-20261013.png`: 1122×1402, approximately 4:5.

Keep `unoptimized`, HTML copy/store links, and the shared download anchor. Reduce section height to match the artwork: 480 px at desktop width 1440, about 488 px at phone width 390. Smaller layouts retain enough room for readable copy and store buttons. Six existing responsive/shared-anchor cases passed across Chromium mobile, WebKit mobile, and desktop. Inspected screenshots at 390, 768, and 1440 px.

## Primary brand on light surfaces — 13 October 2026

Footer now uses white with navy copy and the primary navbar logo. Social links remain left and mobile-store links right on desktop, stacking on small screens; store SVGs have separate navy variants. The native welcome screen and its prepaint use the primary logo on a white action panel beneath the existing role photograph. Client/professional selection and login/registration destinations are unchanged. The shared web deployment updates iOS and Android presentation.

Logo audit: light-on-dark mark remains in the dark admin shell, quote-image renderer, share-kit renderer, and dark-mode email artwork. It is no longer used by the footer or welcome/prepaint. Keep these contrast variants for their dark backgrounds.

Validation: existing first-installation navigation test passed in Chromium and WebKit; footer links passed all three browser projects; focused ESLint passed. At 390×844 welcome content fits without scrolling; at 320×568 the extra 19 px remain reachable, with no horizontal overflow and the final login action reachable in both browsers.

### Welcome design withdrawn

Isaac rejected the white-panel welcome preview. Restored the complete welcome component, prepaint bridge and styles from 5e029c77; retained the approved light footer and navy store icons. Show a future welcome redesign for approval before publishing it.

## Approved registration-style welcome and stable wordmark — 13 October 2026

After reviewing the card preview, Isaac approved the responsive-registration layout with the shared hamburger menu. Browsing from the menu completes the first-run welcome without requiring an account; choosing a registration card or login retains the retryable access journey. The prepaint uses the same light branding. No native permissions or store build changes.

Production investigation confirmed why the previous welcome remained: main was still 835eed63 (the rollback), with the replacement only in the working copies. A cold Chromium navigation also rendered the brand using Arial, then Inter ExtraBold on the next page because the global Inter font uses `font-display: optional`. The shared wordmark now uses outlined SVG paths from the existing Inter 800 asset, preserving its 19 px type size, tracking and brand colors independently of font loading. Both contrast variants and the first-run prepaint use these assets; the other typography remains unchanged.

Validation: first-installation login/registration and guest-menu persistence in Chromium/WebKit mobile; public navbar/drawer wordmark checks with WOFF2 requests blocked across home, registration, login, projects, promotions and jobs. No production account or data changes during the audit.

## Screen-only correction — 13 October 2026

Restored the original workshop composition and responsive layout. The replacement assets `app-workshop-desktop-welcome-20261013.png` and `app-workshop-mobile-welcome-20261013.png` were edited with the built-in image tool using the original Downloads images and an actual welcome-screen capture. Prompt: preserve the workshop, framing and phone position; replace only its screen with the supplied current welcome UI, fitted to the existing perspective. Original source images remain unchanged. Removed the separate CSS phone and enlarged background crop.

## Recorridos regrabados con la app actual — 21 de octubre de 2026

Se regrabaron los cuatro videos y sus pósters con el mismo guion, encuadre de 402 × 874, capturas a 2×, toques visibles, desplazamientos a 30 fps y fundidos existentes. Se conservan los recorridos de profesionales/SG Solutions y menú → tablero → detalle/contacto → tablero → formulario vacío para proyectos, promociones y empleos. Las pantallas reflejan la interfaz actual, incluidos nombres, insignias, menú y campos de publicación. No se rediseña la sección móvil ni de escritorio.

Producción se recorre en solo lectura. Se intercepta la salida de WhatsApp sin enviar mensajes; el proyecto de demostración se crea únicamente en TEST y se elimina por UUID y marcador propio al terminar. Los formularios usan el actor sintético de TEST y no se envían. El selector del grabador reconoce ahora «Publicar un proyecto».

Los MP4 conservan H.264, 588 × 1278, 30 fps y el ajuste CRF 23 del guion original. Duraciones finales: profesionales 28,77 s; proyectos 16,70 s; promociones 21,63 s; empleos 19,47 s. Se regeneraron los pósters desde el primer cuadro y se verificó la decodificación completa de cada MP4. Todos los recursos usan `?v=20261021-current-app` para renovar caché. Las capturas y hojas de revisión están en `/tmp/contratacr-guide-current-20261021`.

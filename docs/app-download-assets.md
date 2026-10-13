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

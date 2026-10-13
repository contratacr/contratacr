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

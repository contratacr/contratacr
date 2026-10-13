# Recursos de la sección de descarga

## Foto del teléfono

- Autor: Valentin Ilas.
- Fuente: https://www.pexels.com/photo/smartphone-on-wooden-table-33039024/
- Licencia revisada: https://www.pexels.com/license/ (permite uso gratuito, modificaciones y banners de producto).
- Archivo local optimizado: `public/stores/app-phone-table.webp`.
- La pantalla de ContrataCR se proyecta con una malla SVG dentro de las cuatro esquinas del cristal, con recorte redondeado y reflejo sutil; la captura es `public/guia/profesionales.jpg`. No se implica respaldo del fotógrafo ni del fabricante del teléfono.

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

`AppPhonePreview` usa la foto de 1200 × 800 y las esquinas del cristal (645,150), (848,226), (689,679), (469,609). La proyección se divide en triángulos SVG con un pequeño solapamiento para evitar costuras. Se evita `foreignObject` con `matrix3d` porque Safari desplazaba la captura fuera del marco. La captura original y el QR conservan sus destinos.

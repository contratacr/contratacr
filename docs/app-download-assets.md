# Recursos de la sección de descarga

## Foto del teléfono

- Autor: Valentin Ilas.
- Fuente: https://www.pexels.com/photo/smartphone-on-wooden-table-33039024/
- Licencia revisada: https://www.pexels.com/license/ (permite uso gratuito, modificaciones y banners de producto).
- Archivo local optimizado: `public/stores/app-phone-table.webp`.
- La pantalla de ContrataCR se coloca con HTML/CSS sobre la foto; la captura es `public/guia/profesionales.jpg`. No se implica respaldo del fotógrafo ni del fabricante del teléfono.

## QR

- Destino permanente: `https://contratacr.com/#descargar-app`.
- Generado con `qrcode`, corrección H y margen de cuatro módulos.
- Logo existente `public/logo-mark-transparent.png`, integrado en el centro sobre fondo blanco; área de siete módulos en un SVG de 45 × 45 módulos (incluye margen).
- Verificado con decodificador ZXing a 112, 168 y 256 píxeles; todos devuelven el destino exacto.

## Aviso y footer

El aviso aparece arriba en navegación pública móvil, detecta iOS/Android, permanece fijo al desplazar y se puede cerrar por 30 días. No aparece en la app nativa, formularios ni tareas privadas. El enlace compartido con `#descargar-app` vuelve a mostrarlo aunque se hubiera cerrado, para que siempre ofrezca las tiendas. El footer de escritorio muestra accesos mediante los símbolos de Apple y Android con nombres accesibles.

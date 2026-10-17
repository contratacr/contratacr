# Ajuste de foto de perfil y logos — 17 de octubre de 2026

Se comparte un único editor en registro profesional, completar perfil OAuth, perfil personal, editor profesional y foto del encabezado del panel. Permite arrastrar, ajustar zoom, mover con controles accesibles, centrar y mostrar un logo completo dentro de la vista circular. El logo completo usa un margen blanco para que sus esquinas no desaparezcan en el avatar circular.

Seleccionar un archivo no modifica el perfil. Cancelar conserva el archivo y avatar anteriores; «Usar foto» entrega una imagen cuadrada de 800 px al flujo de guardado existente. En los editores sigue siendo necesario guardar sus cambios. El encabezado y completar perfil mantienen su guardado inmediato después de confirmar. La foto original de OAuth no se cambia automáticamente: al elegir otra se abre el mismo editor.

La imagen se decodifica y prepara localmente antes de editar, con el mismo tratamiento de orientación y HEIC admitido por el navegador. Los archivos no compatibles muestran un error sin sustituir el avatar. La subida mantiene las validaciones de autenticación, tipos de archivo, tamaño y compresión existentes. Cloudinary deja de aplicar detección de rostros al resultado: conserva el encuadre elegido, igual que R2.

## Validación

- `avatar-framing.spec.ts`: cancelar y volver a elegir el mismo archivo, logo completo con margen blanco, dimensiones reales del JPEG exportado, arrastre y zoom comprobados por píxeles del resultado, archivo inválido, traducción inglesa y controles táctiles en el contenedor nativo simulado. Chromium escritorio, Chromium móvil y WebKit móvil. No crea cuentas ni escribe perfiles reales.
- TypeScript sin errores, comprobaciones UTF-8 e idiomas correctas.
- Compilación Next/OpenNext para Cloudflare terminada correctamente.
- Nuevos casos añadidos al smoke de cada push y al inventario de regresión.

Son pruebas de los motores web y del contenedor nativo simulado; no se ha instalado ni publicado un nuevo binario en las tiendas. La funcionalidad usa la web compartida por iOS, Android, PWA y navegadores.

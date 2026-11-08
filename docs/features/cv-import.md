# Importar CV a Formación

Implementación aprobada por el usuario para publicar. Base: ae2343a0ce2f01c802fa748157ec324e2460f092.

## Decisiones de producto

- Opcional dentro de Formación; no añade pasos obligatorios al registro ni al alta de servicios.
- PDF con texto y DOCX. Los Word antiguos deben exportarse a DOCX. Máximo 5 MB, 15 páginas PDF, 80.000 caracteres y 1 MB de XML descomprimido en DOCX.
- Importación local, sin enviar archivo ni texto a IA o API. Compartir el documento es una acción independiente y explícita. Sin coste de tokens. PDF.js se carga solo al elegir un PDF y utiliza un worker alojado en el mismo dominio.
- Reconoce encabezados habituales en español e inglés. Sugiere estudios, experiencia y habilidades sin inferir credenciales, verificar títulos, calcular antigüedad ni añadir servicios automáticamente. No es OCR ni un extractor universal: formatos sin encabezados y columnas complejas pueden requerir completar/corregir los campos.
- Se revisan y editan las sugerencias antes de agregarlas; el guardado normal del perfil confirma su publicación. Archivo, nombre de archivo, texto original, contactos y referencias no se guardan automáticamente. La persona debe revisar que los campos elegidos no incluyan información privada.
- Conserva datos actuales y certificaciones por servicio. Deduplicación normalizada por título, institución/empresa y fechas; habilidades por nombre. Ediciones que cambien esas claves pueden requerir quitar la sugerencia duplicada manualmente.
- Estudios y experiencia admiten hasta 20 entradas por sección; hasta 40 habilidades. Los campos son editables sin CV y se pueden eliminar.
- No se presenta la información importada como verificada. La insignia de identidad mantiene su alcance actual.

## Investigación

Se revisaron fuentes primarias el 8-nov-2026:

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): formatos permitidos, validación del contenido, tamaños y límites tras descompresión. Compartir el original usa un bucket privado y un handler que comprueba visibilidad y cuarentena en cada descarga.
- [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html): lectura desde bytes, worker y extracción de texto; no renderizado de scripts, formularios ni enlaces del PDF. Versión fijada 6.5.438, worker y licencia incluidos.
- [fflate](https://github.com/101arrowz/fflate): lectura ZIP por flujo. Solo se descomprime word/document.xml; se limitan los bytes reales y no se consultan relaciones o archivos externos. XML se convierte a texto, nunca a HTML.
- [Mammoth](https://github.com/mwilliamson/mammoth.js): revisada como alternativa; no incorporada porque solo se necesita texto de párrafos y conviene reducir la superficie de conversión HTML.

## Datos y despliegue

Migración `262_cv_perfil_publico.sql`: columna `professionals.cv_profile` con listas públicas confirmadas de education/experience/skills. Valida forma, campos, cantidades y tamaños en PostgreSQL. No cambia RLS, permisos, tabla de autenticación ni documentos privados. La migración 263 añade el bucket privado professional-cvs y metadatos. Los permisos de columna impiden leer rutas privadas y una política restrictiva bloquea acceso directo al bucket.

La migración debe estar aplicada antes de habilitar el guardado nuevo. La lectura pública tolera esquemas anteriores; el guardado falla explícitamente si falta la columna, sin fingir éxito. No se ha aplicado a producción durante la implementación.

`profile-editor.tsx` incluye la información en el estado de cambios y verifica el resultado de la escritura. `getProfessionalBySlug` la carga y Formación la muestra como texto escapado. La educación cuenta como alternativa a certificaciones en el indicador de perfil.

## Validación reproducible

- `node --test tests/cv/model.test.mjs`: parser, fusión, límites y migración en PGlite con contrato mínimo de RLS de propietario. No equivale a ejecutar toda la base de producción.
- `node tests/cv/serve-preview.mjs`: editor real y ficha pública real, con cuenta sintética y Supabase sustituido; escucha solo en 127.0.0.1:3194. No lee archivos .env. Usa esbuild y Tailwind instalados en el proyecto.
- `node tests/cv/browser.mjs`: Chromium escritorio/móvil y WebKit móvil. PDF/DOCX reales sintéticos, revisión, edición, guardado/relectura con backend simulado, descarte, error/reintento, archivos inválidos/protegidos, no subida y ancho móvil.
- `node tests/cv/edge-cases.mjs`: Chromium/WebKit, inglés, reimportación sin duplicados, eliminación, 16 páginas, XML comprimido excesivo, archivo dañado y encabezados desconocidos.
- TypeScript, ESLint focal, UTF-8, diff e inventario. Las advertencias preexistentes de hooks/navegación en los dos componentes mayores se conservan; no se desactivaron reglas para ocultarlas.
- Next.js build con webpack, OpenNext Cloudflare y Wrangler deploy --dry-run aprobados en copia temporal sin .env ni datos de producción y con variables públicas ficticias. El primer empaquetado falló porque node_modules era un enlace a la ruta canónica; al copiar las dependencias y recompilar, OpenNext y Wrangler aprobaron. No hubo despliegue ni prueba en un iPhone físico.

La previsualización no se agrega a rutas públicas ni a producción. Los scripts de navegador son pruebas focales manuales; los workflows amplios existentes no se modificaron.

## Resultado local — 8-nov-2026

5 casos de modelo/migración aprobados; 3 recorridos completos de navegador aprobados (Chromium móvil/escritorio y WebKit móvil); 2 recorridos adicionales aprobados (Chromium/WebKit). TypeScript, lint de archivos nuevos, UTF-8, inventario y diff aprobados. Lint de componentes existentes: 0 errores, 3 advertencias previas. Auditoría de dependencias: ninguna alerta para pdfjs-dist o fflate; undici 7.29.1 conserva avisos preexistentes (sin cambio respecto a HEAD).

Evidencia detallada: `/tmp/ccr-cv-review/`. Capturas persistentes: `output/cv-import-2026-11-08` del espacio de trabajo de Codex. Cuenta y documentos de las capturas son sintéticos. El usuario aprobó el push y la puesta en marcha tras revisar las capturas.

## Revisión solicitada

Se elimina el formulario redundante al final. Las certificaciones anteriores se conservan dentro de Estudios. El encabezado se reduce a una frase y formatos.

Mostrar mi CV en el perfil empieza desactivado. Activarlo sube el documento y guarda esa decisión inmediatamente, independientemente del guardado de estudios/experiencia/habilidades. Se puede ocultar, reemplazar o retirar. El perfil ofrece Ver CV: PDF se abre y DOCX se descarga. Retirar acceso no elimina copias previamente descargadas.

El endpoint valida sesión, propietario, origen, tamaño y formato; usa versiones contra sobrescrituras concurrentes. No expone URLs permanentes del almacenamiento. Comprueba cuarentena y vuelve a comprobar visibilidad tras descargar. Reutiliza el scanner configurado de la aplicación; si no está configurado, no equivale a análisis antivirus. No se presenta el documento como verificado.

Pruebas adicionales: tests/cv/sharing.test.mjs (API con dependencias simuladas y permisos PostgreSQL aislados), tests/cv/sharing-browser.mjs (consentimiento explícito, ocultar, errores, retirar en Chromium/WebKit). Ninguna sube datos a producción.

Validación de la revisión: 6 casos API/permisos y 1 caso DOCX aprobados en bloques separados; 2 recorridos de compartir en Chromium/WebKit y 3 regresiones del editor en Chromium móvil/escritorio y WebKit aprobados. TypeScript sin errores. ESLint focal sin errores, una advertencia de hook preexistente. La disponibilidad de Ver CV se consulta fuera de la caché del perfil.

El encabezado de la previsualización también se llama Formación. La etiqueta de pruebas Vista pública guardada nunca formó parte del perfil de producción. Evidencia local anterior reutilizada: solo cambia esta etiqueta del harness y documentación; no requiere repetir pruebas de aplicación.

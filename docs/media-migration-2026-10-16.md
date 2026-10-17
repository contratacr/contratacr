# Migración de imágenes a R2 — 16 de octubre de 2026

## Producción

- Cloudinary antes de la copia: plan Free, 4,86/25 créditos, 239,86 MB de almacenamiento y 3,41 GB de transferencia en los últimos 30 días.
- R2 antes de la copia: 141,99 MB de imágenes y 379,53 MB de caché de Next.js; consumo facturable de R2: $0.
- Copia de respaldo: 724 imágenes originales, 89.571.661 bytes. Cada objeto se comprobó mediante SHA-256 desde su URL pública. No se eliminaron los originales de Cloudinary.
- Los cuatro videos de Cloudinary (125.149.885 bytes) pertenecen a `samples`; no son contenido de la app y no se trasladaron.
- Fotos grandes que ya estaban en R2: 64 referencias de perfil actualizadas; 67.310.545 → 3.595.904 bytes. Los originales siguen disponibles.
- Contenido activo de Cloudinary: 271 imágenes preparadas para R2 y comprobadas; 248 registros actualizados mediante comparación con el valor original. 23.935.597 → 17.406.863 bytes.
- Auditoría posterior: cero referencias de Cloudinary en los campos de imágenes de perfiles, profesionales (servicios, trabajos y certificaciones), ofertas, actividad, proyectos, mensajes y soporte.
- Se sincronizaron también 37 avatares de los metadatos de acceso. Se conservaron las referencias históricas de `user_media_assets` para permitir revertir o eliminar correctamente los originales.
- Se registró el propietario de 289 copias de respaldo en `user_media_assets`, además de los derivados activos, para incluirlas en la eliminación futura de la cuenta.

Los manifiestos con identificadores, URL anteriores/nuevas, estados y comprobaciones son archivos privados fuera de Git. Las credenciales temporales se limitaron al bucket `contratacr-assets` y a 24 horas. No se añadieron credenciales al repositorio ni se publicaron versiones en las tiendas.

## Herramientas

- `scripts/archive-cloudinary-to-r2.mjs`: copia de originales con comprobación pública, reanudación y protección frente a colisiones. No cambia la base de datos ni elimina archivos.
- `scripts/migrate-cloudinary-references.mjs`: derivados con propietario, control de tamaño, comprobación pública y actualización condicionada al valor original. La protección de actividad evita generar avisos históricos a seguidores.
- `scripts/sync-migrated-auth-avatars.mjs`: sincroniza únicamente avatares que siguen coincidiendo con el valor anterior del manifiesto y con el perfil migrado.

Los scripts usan modo de simulación salvo que se indique `--apply`. Exigen rutas explícitas para los manifiestos privados y comprueban el proyecto de destino.

## Pendientes de certificación

- Las vistas públicas respondieron correctamente con imágenes de R2 tras renovar la caché. La búsqueda bajó de aproximadamente 4,5 MB a 1,36 MB, pero todavía excede el presupuesto de 800 KB y su FCP medido fue de 1.992 ms frente al objetivo de 1.500 ms. La migración no certifica por sí sola el rendimiento completo.
- Test también terminó sin referencias activas de Cloudinary en los mismos campos: 262 operaciones de actualización verificadas entre los distintos lotes. Se revisaron individualmente dos fuentes antiguas fuera del inventario inicial. El servicio histórico que impedía continuar recibió una entrada temporal de actividad mediante inserción directa; el recuento de notificaciones permaneció en 172 antes y después. Esa única entrada temporal se retiró al terminar la migración, restaurando el conjunto original de actividad. Se registró además el propietario de 491 copias de respaldo para test. No hubo avatares pendientes de sincronizar en los metadatos de acceso. Se conservaron los originales y los registros históricos de propiedad. Los manifiestos privados distinguen cada lote y no cuentan estos respaldos como contenido activo.
- No borrar Cloudinary ni el respaldo hasta completar la revisión funcional y manual.
- La ronda completa sobre el commit anterior `a98c2db4` terminó con 1.528 pruebas aprobadas, 46 fallidas, 151 saltos y 36 sin ejecutar. Parte de esos fallos ya tiene correcciones posteriores; la app completa aún no está certificada.
- El smoke posterior ejecutó 182 pruebas correctamente y 14 saltos, pero su verificador rechazó dos saltos de escritorio sin motivo declarado en los casos del aviso móvil de descarga. Se añadieron esos motivos: la comprobación dirigida pasa en los cuatro casos móviles y reconoce los dos saltos de escritorio. No se flexibilizó el verificador.

## Medición completa posterior

Medición de producción con teléfono de 390 px, CPU ×4 y red de aproximadamente 1,6 Mbps/150 ms. Los umbrales originales siguen intactos; ninguno de estos resultados constituye una certificación de rendimiento.

| Ruta | JavaScript | Transferencia | FCP |
| --- | ---: | ---: | ---: |
| Inicio | 667 KB | 5.083 KB | 1.708 ms |
| Profesionales | 685 KB | 1.389 KB | 1.720 ms |
| Categorías | 570 KB | 880 KB | 1.300 ms |
| Login | 762 KB | 1.196 KB | 1.420 ms |
| Empleos | 570 KB | 1.378 KB | 1.180 ms |
| Un perfil público | 625 KB | 1.761 KB | 1.156 ms |

Objetivos vigentes: inicio ≤450 KB de JavaScript, cada ruta ≤800 KB y FCP ≤1.500 ms. La transferencia incluye mapas, recursos compartidos y fotografías de catálogo, además de los archivos migrados. El mapa está visible desde la entrada en la búsqueda; eliminar su carga inicial cambiaría el comportamiento de esa vista.

El inventario final del bucket `contratacr-assets` contiene 1.600 objetos y 266.364.380 bytes. Junto a la caché de Next.js previamente medida (379,53 MB), son unos 646 MB. La fuente antigua de test `qayxamdb` recibió además un respaldo íntegro comprobado por SHA-256; es compartida entre cuentas de prueba y no se asignó arbitrariamente a una sola cuenta.

## Imágenes grandes que ya estaban en R2

La auditoría adicional detectó 46 imágenes activas grandes fuera de los avatares. Se prepararon 45 derivados únicos (dos fuentes idénticas se deduplicaron), se comprobaron sus bytes públicos y se actualizaron 27 registros mediante comparación con el valor anterior: 38.262.198 → 14.217.146 bytes. Los originales y sus referencias históricas se conservaron.

Antes de terminar los tres registros retenidos se comprobó en la interfaz de Supabase de producción que `trg_capture_professional_profile_activity` ya no existe, de acuerdo con la migración 210. No fue necesario crear actividad histórica en producción. La comprobación posterior registró cero actividades y cero notificaciones de seguidores desde el inicio de esta operación.

La revisión directa del origen R2 cubrió 687 URL activas distintas: cero objetos ausentes y cero imágenes superiores a 512 KiB (máximo 523.366 bytes). Las 291 fotos de perfil alojadas en R2 están por debajo de 150 KiB (máximo 148.076 bytes). Las respuestas HEAD públicas pueden reflejar tamaños diferentes al objeto de origen; el control definitivo usa metadatos del almacenamiento y checksum de los derivados, no solo ese encabezado.

En test se optimizaron además 17 fuentes grandes que ya estaban en R2, con 23 registros actualizados: 18.023.842 → 5.077.886 bytes. La auditoría final directa cubrió 495 URL activas sin objetos ausentes ni imágenes superiores a 512 KiB (máximo 520.637 bytes). No se generó actividad ni avisos de seguidores. Las fotos de perfil de R2 de test también cumplen el límite de 150 KiB.

Las nuevas cargas públicas de servicios, casos de éxito y promociones usan también el presupuesto compartido de 512 KiB antes de subir; los adjuntos de chat/soporte siguen su política propia. La prueba de cámara lo comprueba junto con el presupuesto de avatar en los tres navegadores.

## Compatibilidad de las fotos con tarjetas compartidas

La revisión adicional detectó que el renderizador de Open Graph acepta JPEG/PNG, pero no los WebP generados por la primera optimización. Se normalizaron únicamente avatares y fotos de promociones que usan esas tarjetas, conservando transparencia con PNG y usando JPEG para las fotos opacas. Los originales y las versiones anteriores permanecen en R2. Las utilidades de migración comparten ahora esa misma conversión y los límites de 150 KiB/800 px para avatar y 512 KiB/1.600 px para fotos públicas.

Producción: 246 archivos y 243 filas comprobados; 42 metadatos de avatar de acceso sincronizados. Test: 230 archivos y 231 filas comprobados; sin metadatos de acceso pendientes. La prueba dirigida verifica conversión, transparencia, presupuesto y el render real mediante ImageResponse en los tres navegadores. La tarjeta pública de SG Solutions respondió 200 PNG y muestra su fotografía tras la conversión.

La auditoría posterior mantiene cero referencias activas de Cloudinary en ambos ambientes. El almacenamiento de medios ocupa 276,74 MB y conserva 1.849 objetos, incluidos respaldos y versiones anteriores; no representa solo las fotos activas. No se borró contenido de Cloudinary ni originales de R2.

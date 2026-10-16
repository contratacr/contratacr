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

- Comprobar las vistas públicas después de renovar las cachés y repetir la medición de rendimiento. La primera medición posterior aún recibió imágenes antiguas desde la caché; los originales siguen funcionando.
- El entorno de test contiene además referencias históricas de otra nube de Cloudinary (`qayxamdb`) y una URL transformada fuera del inventario revisado. La migración se detuvo en esos casos y en un servicio sin actividad histórica para no inventar propiedad ni generar notificaciones. Se conservaron sus referencias originales. Esto no afecta a la auditoría de producción descrita arriba.
- No borrar Cloudinary ni el respaldo hasta completar la revisión funcional y manual.
- La ronda completa sobre el commit anterior `a98c2db4` terminó con 1.528 pruebas aprobadas, 46 fallidas, 151 saltos y 36 sin ejecutar. Parte de esos fallos ya tiene correcciones posteriores; la app completa aún no está certificada.
- El smoke posterior ejecutó 182 pruebas correctamente y 14 saltos, pero su verificador rechazó dos saltos de escritorio sin motivo declarado en los casos del aviso móvil de descarga. Se añadieron esos motivos: la comprobación dirigida pasa en los cuatro casos móviles y reconoce los dos saltos de escritorio. No se flexibilizó el verificador.

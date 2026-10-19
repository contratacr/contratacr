# Verificación coherente — 19 de octubre de 2026

## Hallazgos

La cuenta de Isaac Sánchez Monge estaba aprobada en la base: `verification_status=verified`, `is_verified=true` e identidad de cuenta verificada. La respuesta pública del enlace corto seguía devolviendo `pending` y `isVerified=false`. Las dos rutas de decisión administrativa guardaban la aprobación sin publicar una nueva revisión de la caché profesional.

Una revisión administrativa antigua también bloqueaba la verificación de un documento nuevo: el historial y los casos se buscaban por cuenta/profesional sin distinguir el cambio de identificación.

## Cambios

- Las decisiones administrativas de cuentas y profesionales invalidan la caché pública. La sincronización de identidad de cuenta hace lo mismo y repara una insignia faltante aunque el estado profesional ya diga verificado.
- Se renuevan las claves del detalle y de búsquedas una vez para descartar respuestas antiguas inconsistentes ya almacenadas.
- Un cambio de documento retira la aprobación anterior, registra una marca de auditoría sin guardar el número en el log y verifica la identificación esperada. Las decisiones y casos anteriores al cambio no bloquean el documento nuevo. Una revisión actual y las apelaciones siguen protegidas.
- La consulta de documentos aplica el mismo límite temporal, para que un reintento posterior a una caída de Hacienda no quede bloqueado por el documento anterior.
- Una consulta oficial exitosa guarda el nombre completo recibido. También se aplica al aprobar manualmente si Hacienda devuelve un nombre; una caída o un resultado no encontrado no impiden la aprobación humana basada en documentos. La presentación pública abreviada no cambia.
- El bloque de espera administrativa queda en «Pendiente de revisión», sin explicación larga ni enlace «Contactar a soporte». Se conserva «Ver caso» cuando existe un trámite real.

## DIMEX

Si Hacienda devuelve identificación y nombre, el flujo existente verifica la cuenta. Si devuelve no encontrado, ofrece revisión manual con foto de la persona junto a su identificación. Una consulta no disponible no se trata como identificación inválida. Para jurídicas, el formulario manual conserva la personería o autorización adicional. No se piden fotos de trabajos como prueba de identidad.

## Validación

Pruebas de servidor con dobles de base de datos que respetan condiciones de actualización: 70 casos correctos, incluyendo verificación de tipos de identificación, caídas, duplicados, decisiones administrativas, nombre oficial, cambio de documento y reparación de insignia.

Contratos de consultas/caché: seis de perfil y siete de catálogo correctos. Se conservan las comprobaciones de suspensión en vivo. TypeScript, codificación, idiomas y propiedad de superficies comprobados.

Las pruebas visuales usan cuentas temporales aisladas en el proyecto de pruebas, nunca cuentas reales de producción. Cubren documentos nacionales, DIMEX y jurídicos en Chromium escritorio, Chromium móvil y WebKit móvil. Pasaron 12 escenarios de integración de documentos/insignia, tres comprobaciones del nombre completo en pantalla y una repetición final del flujo DIMEX en Chromium móvil con la compilación actual. No sustituyen una ejecución nativa en dispositivos físicos.

No se crean migraciones, no se cambian identificaciones de usuarios en producción ni se envían recordatorios. El cambio es web compartida; no requiere publicar otro binario en tiendas.

## Simplificación del formulario

La revisión manual muestra directamente los archivos necesarios, sin comentario opcional, explicación repetida, reintento automático ni paso de apertura adicional. DIMEX y personas físicas adjuntan una foto con su identificación; las jurídicas conservan también el documento de representación. La instrucción queda junto al archivo y los botones mantienen el mismo tamaño. El envío se habilita solo cuando están todos los archivos exigidos; los casos anteriores pueden completar sus documentos sin crear solicitudes duplicadas. La API de apelaciones existente permanece disponible para clientes anteriores.

Validación adicional: compilación Cloudflare, TypeScript, ESLint, textos e idiomas. La regresión de documentos comprueba ausencia del comentario, archivos obligatorios, envío, permisos privados y reintentos.

## Transición al guardar identificación

El guardado de identificación usaba la devolución de una sección completa del perfil: en móvil cerraba la sección y restablecía su foco. Ahora refresca los datos en segundo plano y conserva la pantalla abierta. La identificación y el estado confirmados por el POST se mantienen visibles hasta que llegan los datos actualizados del perfil, sin mostrar otra vez el número ni la insignia anteriores. Al sincronizarse, el estado vuelve a depender de las lecturas normales, incluidas decisiones administrativas posteriores.

Se añaden seis regresiones de transición (verificado/pendiente en Chromium escritorio, Chromium móvil y WebKit móvil), con actualización del padre retrasada y muestreo de 12 fotogramas. También comprueban que una revocación posterior siga reflejándose. El flujo completo de documentos DIMEX pasó en Chromium y WebKit móviles sin recargar ni reabrir después del guardado. TypeScript, ESLint y compilación Next correctos. La prueba espera la URL canónica del panel antes de navegar a la siguiente sección.

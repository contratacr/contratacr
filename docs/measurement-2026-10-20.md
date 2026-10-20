# Medición de ContrataCR · 20 de octubre de 2026

## Alcance implementado

- Panel admin con recorridos de cuentas y visitantes: pantallas, búsquedas internas existentes, navegación, botones con vocabulario cerrado, filtros, inicio/intento de envío/abandono/validación de formularios, avance de lectura y errores sin mensajes ni trazas. Filtros por ambiente, periodo y cuenta/visitante; paginación estable. Acceso solo con rol admin vigente y MFA.
- Eventos de recorrido agrupados (hasta 20 por petición, 5 segundos, cola limitada); UUID para deduplicar reintentos. Almacenamiento privado con RLS, sin acceso de clientes, retención de 90 días mediante cron cuando pg_cron está instalado y eliminación en cascada de los recorridos de cuentas borradas. La BD también excluye administradores.
- La búsqueda escrita, zona elegida y resultados siguen siendo analítica interna. Meta recibe Search sin términos ni ubicación; PageView y registro mantienen deduplicación por sesión. Los ocho eventos de negocio se originan en acciones autorizadas y recibos únicos del servidor.
- El panel distingue conversiones de negocio aceptadas por CAPI, pendientes, suprimidas, expiradas y entregas al cliente/app sin confirmación. No presenta ese último grupo como recibido por Meta ni como instalación atribuida.
- Sin nuevas ventanas, pasos de aceptación ni pantallas de cookies. Preferencias en Privacidad; los rechazos guardados se respetan. El estado inicial limitado no se convierte en un recibo de consentimiento expreso.

## Nativo preparado, sin publicación en tiendas

Android: plugin Capacitor propio y facebook-core 19.0.0. Inicio del SDK después del control de rol/configuración; sin eventos automáticos, metadatos de pantallas, mejoras de producto, identificación de cuenta o datos de contacto. Se eliminan los permisos AD_ID y AdServices. Solo eventos del catálogo; recibos locales limitados. Instalación por App Events API con identificador seudónimo de instalación y, cuando tiene el formato reconocido, únicamente el token cifrado de atribución de Meta obtenido de Google Play Install Referrer. No se reenvía el texto arbitrario del referrer. Se usan datos técnicos del SDK: no es una integración anónima. Un evento encolado no acredita recepción ni atribución publicitaria.

El token cliente del SDK es configuración pública normal de la aplicación; nunca es el token privado de Conversions API. Los candidatos no incrementan versión ni build y no se han enviado a tiendas.

iOS: StoreKit SKAdNetwork, sin SDK de Meta, IDFA, IDFV, identificadores de cuenta ni eventos individuales enviados a Meta. La API de uso informa si el esquema está habilitado; solo `META_IOS_SKAN_SCHEMA_READY=true` permite hitos. Mientras esté pendiente, solo se usa el valor base 0. Las apps instaladas actualmente no adquieren este plugin con un despliegue web.

### Pendientes reales antes de afirmar atribución nativa completa

Events Manager permite crear la configuración personalizada, pero deshabilita Add Event y Next porque **no hay eventos de app procesándose**. No se inventaron conversiones de producción para desbloquearlo. El app de Meta está Unpublished; revisar su elegibilidad antes de iniciar campañas nativas.

Cuando Meta permita configurarlos, el esquema fino del candidato es máximo hito alcanzado: 0 apertura, 1 búsqueda, 2 registro, 3 contacto, 4 publicación de proyecto/oferta/empleo/perfil, 5 contratación o propuesta aceptada. Valores coarse: low=0–1, medium=2–3, high=4–5. Debe reproducirse exactamente en Meta antes de activar la variable. Si Meta exige otro esquema, actualizar la asignación y repetir pruebas; no activar una correspondencia distinta. Son hitos acumulados, no cantidades por persona ni conteos exactos de eventos.

Es necesario verificar posteriormente una instalación atribuida desde anuncio y la recepción de postbacks de Apple con el candidato distribuido mediante un canal permitido. Compilar, llamar la API local o abrir la app sin un anuncio no demuestra atribución. Los informes de Apple tienen retrasos y umbrales de privacidad. No se ha usado CAPI web para sortear restricciones de iOS.

## Validación

- `journey-privacy.spec.ts`: contrato sin contenido privado; controles nativos; rechazo guardado; compatibilidad con apps antiguas sin plugin.
- `journey-browser.spec.ts`: captura agrupada real en navegador sin correo ni contraseña escritos.
- `admin-journey.spec.ts`: invitados y cuentas ordinarias reciben 403; admin con MFA ve cuentas/visitantes; filtros y no-store.
- `meta-minimal.spec.ts`, `meta-growth-runtime.spec.ts`, `meta-growth-contract.spec.ts`, `privacy-consent-runtime.spec.ts`, `legal-privacy.spec.ts`: filtros de salida, deduplicación, recibos auténticos, preferencias, idiomas y ausencia de ventanas automáticas.
- `scripts/verify-journey-privacy.mjs`: SQL aislado, permisos y cascada, paginación con fechas iguales, exclusión de administradores, datos internos de búsquedas y totales de entrega. `scripts/verify-meta-growth-receipts.mjs`: once verificaciones SQL anteriores.
- TypeScript, ESLint focalizado, build Next, build Android Debug e iOS Simulator. Android real del emulador: plugin disponible, configurar desactivado y rechazar envío; sin evento Meta para esa prueba. Contrato nativo valida flags y permisos antes de una futura publicación.

## Revisión jurídica pendiente

No hay certificación legal al 100 %. La ausencia de una obligación específica de mostrar un banner no elimina las reglas sobre datos personales. Los identificadores de navegador, clic e instalación son seudónimos; no debe presentarse su envío como anónimo. Debe validar el abogado la base de tratamiento y transferencia, especialmente la medición activada sin una elección expresa previa y el tráfico no registrado. La aceptación general de términos no demuestra por sí sola autorización específica para todos los fines.

Fuentes primarias: [Ley 8968, artículos 5 y 14 (INAMU)](https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf), [privacidad y uso de datos de Apple](https://developer.apple.com/app-store/user-privacy-and-data-use/), [SKAdNetwork](https://developer.apple.com/documentation/storekit/skadnetwork), [configuración de una app anunciada](https://developer.apple.com/documentation/storekit/configuring-an-advertised-app), [código oficial del SDK Android de Meta](https://github.com/facebook/facebook-android-sdk).

## Continuación de QA

La regresión de TEST `39456570152` se detuvo en el inventario de responsables, antes de ejecutar el smoke amplio: faltaban las rutas `/api/privacy/*`. Se asignaron responsables específicos a privacidad, recorridos y recepción Meta, se regeneró el inventario (71 páginas, 104 handlers, 490 superficies) y se añadieron pruebas de origen y elecciones inválidas para retirar publicidad. Se corrigieron además los bloqueos de idiomas y vocabulario sin ampliar sus presupuestos. TypeScript y lint focal/global de contratos pasan; ESLint mantiene tres avisos previos, sin errores. Los 21 casos focalizados de privacidad y Meta pasan en Chromium de escritorio.

Android: la primera prueba habilitada detectó que el emulador conservaba un APK anterior a `fullyInitialize`. Se reinstaló el APK actualizado sobre la misma app, sin borrar sus datos. Ahora la apertura se encola, no aparecen errores de SDK no inicializado y, tras desactivarlo, el envío se rechaza. Esto no confirma recepción de Meta ni atribución de una instalación. Test Events indica que su vista de pruebas de app requiere sesión en Facebook en el dispositivo; no se inició una cuenta personal ni se fabricaron conversiones.

Segunda comprobación Android con diagnóstico exclusivo de builds depurables: el SDK confirmó `sdkReady=true` y `flush=SUCCESS` para la apertura real del candidato; el recibo `install_sent=true` acredita respuesta sin error de Graph API al aviso de instalación. La retirada posterior bloquea un nuevo evento. No acredita instalación proveniente de anuncio, descifrado de Install Referrer ni postbacks de Apple. El diagnóstico no devuelve contenido, credenciales ni identificadores y está rechazado en builds no depurables.

La auditoría de almacenamiento también bloqueaba el CI anterior: se revisaron los accesos añadidos, todos de preferencias/deduplicación temporal sin registros de cuenta, y se documentaron sus motivos manteniendo conteos exactos. Smoke de seguridad, plantillas de correo y auditoría de dependencias de producción pasan, con cero vulnerabilidades reportadas.

## Acceso a Meta y revisión de regresión del 20 de octubre

La confirmación en Centro de cuentas mediante contraseña y código permitió volver a Security Center; la verificación empresarial continuó después con SMS. No se desactivaron passkeys, doble factor ni controles del portfolio. El titular confirmó que la actividad aún no está inscrita: el borrador usa Sole Proprietorship / Not yet registered. Meta sigue solicitando documentación oficial de registro, licencia o constancia tributaria. No se enviaron documentos ni se presentó una solicitud con información de una sociedad todavía en trámite.

Events Manager muestra Conversions API web activa, con recepción reciente. La coincidencia avanzada de datos personales, el registro automático de eventos y la recopilación adicional de información de la app siguen desactivados. El asistente SKAdNetwork permite revisar Custom Integration, pero exige eventos nativos recibidos y la integración correspondiente antes de confirmar sus requisitos. No se confirmó ese requisito sin evidencia, no se publicó un esquema y la atribución iOS continúa pendiente; recepción de Android no equivale a atribución de instalación desde un anuncio. No hubo publicaciones en tiendas.

La ronda compartida `39459329921` terminó con 2.126 casos aprobados, 238 omitidos/no ejecutados y 93 fallidos entre los cuatro shards. Son ejecuciones de casos en varios proyectos, no 93 bugs distintos. La ronda nativa `39460799093` aprobó las compilaciones y pruebas Android e iOS; el smoke WebView tuvo cuatro fallos por selectores que confundían la copia oculta de escritorio con la fila móvil. Esos cuatro casos pasan después de seleccionar y observar la fila visible.

La revisión detectó dos fallos reales además de contratos de pruebas desactualizados:

- La comprobación MFA desmontaba los formularios públicos justo al establecer una sesión. Se mantienen montados login y registro, ocultos e inertes mientras el acceso está bloqueado. Las rutas protegidas siguen sustituyendo su contenido. Pasaron los ocho flujos de registro y la edición completa de perfil/servicios, con ajuste explícito de la foto.
- La política UPDATE heredada de la migración 001 se consultaba a sí misma. La migración 008 había añadido otra política con un nombre distinto sin retirar la anterior. La reparación 252 se aplicó en TEST y producción, conserva la política restrictiva de MFA y comprueba propietario tanto antes como después del cambio. La regresión real valida modificación propia, rechazo de modificación ajena, rechazo de transferencia de propietario y rechazo de modificación anónima. Producción confirma una sola política UPDATE, MFA restrictivo conservado y migración registrada.

El aviso de guardado se monta mediante portal para que las transformaciones del panel no alteren su posición fija. Pasó el guardado real y la confirmación visible en escritorio, Chromium móvil y WebKit móvil. Pasaron también ocho casos de búsqueda/nombres, canales de contacto iniciales, paginación y fin de resultados, y el ciclo real de activación, nuevo login y desactivación del MFA opcional. Las pruebas de documentos incorporan ahora la denegación AAL1 y la verificación real del revisor antes de leer el caso privado.

Los contratos antiguos se actualizaron para medir la última palabra y el control de insignia, distinguir el interruptor de confirmaciones de lectura de las preferencias nuevas, completar el encuadre antes de guardar una foto y contemplar la etiqueta actual de cerrar sesión. El CI local obtiene perfiles desechables suficientes para tres páginas y sus actores verificados tienen identificaciones sintéticas de formato, sin consultas al padrón. La ronda completa debe volver a ejecutarse sobre el nuevo commit; estos resultados focalizados no sustituyen su aprobación.

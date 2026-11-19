# Ventas y cobros — organización Pro local

31 octubre de 2026. Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push, emisión fiscal ni cambios de datos existentes.

## Decisión y alcance

El usuario aprobó simplificar Pro tomando los esenciales fiscales de GTI y los patrones de gestión de servicios de otras plataformas. La [comparación pública para Costa Rica](costa-rica-billing-comparison-local.md) documenta HuliPractice, Alegra CR y Factura Profesional. No se afirma qué funciones usa más la población ni se inventan pruebas de sus cuentas privadas.

El menú Pro muestra una sola entrada **Ventas y cobros**, con tres destinos reconocibles: **Cotizaciones**, **Facturas** y **Pagos**. Las cuentas sin Pro conservan su sección de Cotizaciones existente. Clientes, Agenda, Inventario y Gastos siguen accesibles y conectados.

Los datos no cambian por reorganizar la navegación. Se conservan los enlaces `tab=quotes`, el alias `tab=pro_quotes` y `tab=pro_billing` con sus parámetros y documentos. `tab=pro_payments` abre el listado de pagos directamente. La selección del menú y el título del panel identifican el mismo grupo desde las tres rutas. No se redirigen todas las URLs a una ruta nueva ni se pierden filtros/orígenes.

## Uso sencillo y opciones avanzadas

- Cotizaciones conserva la creación, búsqueda, estados, cliente, catálogo y plantillas actuales.
- Facturas muestra claramente los borradores existentes. Configuración del emisor/documentos, recurrencia y otras herramientas siguen en su menú de opciones. Los campos fiscales especializados permanecen plegados y conservan validaciones y copias históricas.
- Pagos abre una lista embebida de pagos recibidos. Búsqueda y estado son los controles principales. Fechas se abren en **Filtrar por fechas**, y la descarga en **Exportar pagos**; si el enlace ya lleva fechas, el filtro se muestra abierto para que la restricción sea visible. También permite abrir clientes/saldos y recibos.
- Las pestañas de ventas se ocultan mientras hay formulario, detalle o gestor abierto para evitar abandonar ediciones sin su confirmación. Las correcciones de pagos conservan su protección de cambios/reintentos y retorno al listado con filtros.
- Los accesos antiguos a Pagos recibidos desde Facturación siguen mostrando su modal habitual, con fechas/CSV visibles como antes. La presentación embebida se añade sin cambiar el motor de pagos.

Es una simplificación del acceso y de los controles principales. No cambia los límites de borradores, impuestos, saldos, inventario ni la autorización de emisión. Continúa pendiente la integración fiscal validada antes de ofrecer facturas reales.

## Implementación y selección de pruebas

`SalesWorkspace` reúne los componentes Pro existentes. `PaymentOverview` admite una presentación embebida adicional y conserva la modalidad predeterminada. El panel compartido aplica el nuevo nombre y agrupación únicamente cuando la cuenta tiene Pro; el nuevo destino de pagos no carga recursos Pro en cuentas sin acceso. El API conserva sus propias comprobaciones de sesión, pertenencia y propietario.

No hay SQL, migración ni cambios de permisos o modelos. Por tocar selección de secciones del panel y títulos compartidos, se seleccionan el nuevo recorrido en tres perfiles y consumidores de cotización, facturas/pagos/metadatos, navegación con recarga, panel Pro, membresía/MFA/aislamiento y cuentas gratuitas, además del contrato y recorrido de marca. No se repiten fórmulas fiscales/SQL compatibles ni tiendas, CI o pruebas físicas.

## Evidencia y límites

La comparación pública y el contrato estático de marca están comprobados. El nuevo recorrido `pro-sales-workspace.spec.ts` aprobó **3/3 perfiles** (WebKit móvil, Chromium escritorio y móvil), más **1/1 comprobación visual móvil**. Verifica filtros, CSV, formularios sin guardar, enlaces antiguos, recarga y retorno exacto con pérdida del estado de navegación, cuenta gratuita y aislamiento entre propietarios. Los registros privados se comparan antes/después y las cuentas desechables se eliminan. Evidencia: `/tmp/pro-sales-workspace-settled.log`, `/tmp/pro-sales-workspace-visual.log`; captura `sales-payments.png` dentro de `/tmp/pro-sales-workspace-visual/`.

El chequeo global final de TypeScript encuentra un bloqueo preexistente de la ruta pública Empleos: el export `JobsPageContent` no cumple el tipo de página generado por Next (`.next/dev/types/app/[locale]/empleos/page.ts`, TS2344). Se confirmó el mismo export en HEAD; no se modificó esa página ni se excluyeron tipos para forzar verde. La comprobación anterior a generar esa ruta pública pasó, pero no sustituye este resultado global final. Los componentes y tests cambiados tienen ESLint focal aprobado.

El lint completo del panel compartido mantiene **3 errores y 6 advertencias preexistentes**, confirmados contra el contenido exacto de HEAD mediante ESLint por stdin (`/tmp/pro-sales-head-lint.log` frente a `/tmp/pro-sales-lint.log`). Los errores corresponden a setState en efectos previos de Guías, caché de arranque y reconocimiento de cabecera. No se alteraron esos flujos generales ni se suprimieron reglas para obtener verde. Los componentes y tests de esta entrega tienen lint focal separado. No se declara el lint global aprobado ni aptitud de publicación por este incremento local.

Comprobaciones de conservación adicionales: los helpers existentes de gastos y pagos locales aprobaron contra sus snapshots previos (`/tmp/pro-work-expenses-preserve.cjs`, `/tmp/pro-overview-native-preserve.cjs`). El helper antiguo del emisor no pudo comparar porque falta su archivo temporal `/tmp/pro-invoice-preservation-before.json`; no se regeneró un supuesto «antes» después del cambio ni se declara esa comprobación aprobada. Este incremento no escribe datos del emisor ni introduce migraciones.

La primera regresión de consumidores terminó en **31 aprobadas y 8 fallidas** de 39 (`/tmp/pro-sales-consumers.log`), con recargas de desarrollo y varios procesos simultáneos. Se investigaron los errores: la prueba de acceso desde el menú de facturación carecía de una fila real de profesional; el fixture se corrigió, sin autorizar acceso mediante metadatos ni cambiar aserciones. Se mantuvieron los timeouts. La revisión posterior de membresía/MFA/aislamiento y navegación aprobó **9/9** en los tres perfiles (`/tmp/pro-sales-boundaries.log`). Facturación aprobó en Chromium escritorio/móvil (`/tmp/pro-billing-valid-professional.log`) y WebKit por separado **1/1** (`/tmp/pro-sales-billing-webkit-final.log`). Metadatos de pagos en Chromium móvil aprobó **1/1** (`/tmp/pro-sales-metadata-mobile-final.log`); los otros perfiles ya tenían evidencia compatible aprobada. El resultado compuesto se distingue de una única ejecución completamente verde.

El recorrido de marca pasa en WebKit móvil y Chromium móvil. Chromium escritorio sigue bloqueado al navegar a la ruta pública `/empleos`: `page.goto: net::ERR_ABORTED`, reproducido también sin otros procesos E2E (`/tmp/pro-sales-brand-desktop-final.log`). No falla una aserción del logo; las rutas públicas no montan `SalesWorkspace`. No se modificó el test ni se declaró aprobado. Resultado compuesto: **38/39 consumidores** con evidencia compatible aprobada, más **3/3 casos nuevos** y **1/1 captura adicional**. Los chequeos de codificación UTF-8, presupuesto bilingüe y `git diff --check` pasan. No se declara regresión global completamente verde; quedan registrados este bloqueo, el TypeScript de Empleos y el lint previo del panel.

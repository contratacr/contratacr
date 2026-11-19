# Recibos internos de pagos — validación local

Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push, despliegue ni emisión fiscal.

Copia explícita e inmutable de un abono existente; preparar un recibo no registra otro pago ni modifica saldos, materiales, facturas o el workspace. Cliente y emisor se copian al preparar; la fecha del abono se etiqueta como fecha de registro. Las anulaciones posteriores se consultan y muestran sin reescribir la copia.

Selección previa: verificar SQL aislado (RLS, permisos, aislamiento, copia, reversos, cursores y preservación); E2E con dos propietarios desechables y anónimo, 27 abonos, paginación, búsqueda, impresión privada y preservación exacta de las tablas originales en Chromium escritorio/móvil y WebKit móvil. Revisar consumidores de operaciones de cliente e impresión de facturas y cabeceras globales. Reutilizar evidencia compatible previa de funciones fiscales, tiendas y módulos sin cambios; no repetir toda la suite. Validación visual nativa descrita abajo.

El verificador SQL aislado pasó. Extensión aditiva sin backfill ni modificación de tablas originales, aplicada únicamente a Supabase de loopback para las pruebas. No se declara paridad completa con GTI.

## Resultado 27 octubre 2026

- SQL aislado: `node scripts/pro/verify-payment-receipts-db.mjs`, PASS (`/tmp/pro-payment-receipts-db-final.log`). Incluye inmutabilidad, reintentos, reversos previos/posteriores, orden con empates, búsqueda literal/acentos, RLS/grants, cascadas, reinstalación y preservación.
- Nueva E2E final: 3/3 PASS, Chromium escritorio/móvil y WebKit móvil (`/tmp/pro-receipts-release-local.log`). Cuenta propia, otra propietaria real y anónimo; 27 recibos con paginación 20+7, filtros y limpieza, snapshots, acceso privado, XSS escapado, reversos vigentes, popup web sin imprimir y vista nativa simulada con iframe del mismo origen. Se comprueba altura de copia y acceso al footer, retorno al detalle y comparación exacta de 16 tablas originales. Las repeticiones previas detectaron oportunidades de interfaz y no sustituyen esta ejecución final.
- Consumidores: 9/9 PASS (`/tmp/pro-receipts-consumers.log`): operaciones de clientes; archivo/restauración/copia e impresión provisional de facturas; cabeceras globales. Tres perfiles cada una. Conservan evidencia compatible de módulos previos sin repetir toda la suite.
- TypeScript final `npx tsc --noEmit`: PASS (`/tmp/pro-receipts-tsc-final.log` vacío y exit 0). ESLint focal, UTF-8, presupuesto bilingüe sin elevarlo, contrato del wordmark y diff-check: PASS. Se corrigió una referencia DOM en la nueva prueba que colisionaba con su variable de fixture `document`.
- Revisión independiente de SQL/API/aislamiento/impresión: sin hallazgos P1/P2.

## Simulador iPhone 17 Pro / iOS 26.5

Se preparó mediante el botón de la app una copia del abono ficticio existente de ₡20.000 de María / Pintura de habitación. Se verificó la fila contra el abono original y su identificador; no se registró otro pago. Se comprobó regresar del detalle al trabajo y del trabajo al cliente; lista por cliente, filtro Reversados vacío, Limpiar filtros y reapertura del recibo.

La prueba detectó que target blank nativo salía a Safari, sin compartir sesión. Se cambió únicamente esta acción nueva: en web mantiene impresión privada; en app «Ver copia del recibo» abre una vista previa privada dentro de Pro con query/path propio y flecha al detalle. La vista nativa no ofrece un botón de impresión sin soporte; no se imprimió ni envió nada. La copia read-only del mismo origen ajusta su altura por ResizeObserver para usar el scroll del modal; las E2E verifican altura y acceso al pie. El gesto scroll/drag de CUA no produjo desplazamiento observable en la ventana nativa: no se declara ese gesto validado manualmente. Sí se confirmó visualmente la copia autenticada con marca y monto y el regreso al detalle.

Capturas locales: `/tmp/contratacr-pro-recibo-interno-20261027.png`, `/tmp/contratacr-pro-recibo-copia-nativa-20261027.png`. Se eliminó exclusivamente la nueva copia de prueba tras validar su ID/monto contra el abono; las copias anteriores y el abono quedaron exactos. Los cinco verificadores privados de preservación originales pasaron de nuevo (workspace/revisiones, movimientos/ledger, clientes/productos/agenda/cotizaciones, borradores/líneas/materiales y emisor). Simulador queda en la ficha del cliente de ejemplo.

## Pendiente para equivalencia GTI

Este incremento cubre recibos internos. Faltan aplicación de pagos a documentos, fecha efectiva/medio/referencia y conciliación; además recibo electrónico fiscal, otros tipos documentales, monedas, recibidos/aceptación/importación y permisos por negocio. El recibo interno no tiene consecutivo fiscal, no confirma la fecha efectiva del pago y no habilita emisión. Ver matriz `gti-parity-ledger-local.md`.

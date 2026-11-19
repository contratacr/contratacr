# Filtros y acciones de Pro: segunda revisión

26 de octubre de 2026. Rama local/pro-suite-no-push, HEAD 06b70019de69bb4e1ee46ead3eda22eedf05f7d0. Todo el trabajo anterior se conserva. Solo Pro, sin push, SQL, cambios de permisos ni comunicaciones reales.

Cambios: búsqueda consistente con botón para borrar solo el texto y devolver foco al campo, sin perder estado de cotización/producto/cliente; explicación de Próximas; botón de cargar movimientos al final del historial; discriminador legacy al abrir cotización antigua desde cita. Estados desconocidos en enlaces de clientes/cotizaciones usan la vista predeterminada válida.

Selección antes de pruebas: usabilidad de fichas/catálogos, cotizaciones (estados, ES/EN, recuperación y UUID anterior), operaciones de agenda, historial de stock y recorrido de navegación. 18 casos en WebKit móvil y Chromium escritorio/móvil. Se amplían aserciones para borrar búsqueda conservando filtro/foco y cita→cotización anterior cuyo UUID coincide con una canónica. Se reutiliza evidencia compatible de SQL/RLS, almacenamiento e integración porque sus entradas no cambian; no se toca encabezado compartido ni marca. TypeScript de fuentes y ESLint focal, UTF-8/bilingüe, datos originales y simulador cierran la revisión. La limitación previa del chequeo generado de Next para Empleos sigue documentada en navigation-paths-local.md.

## Resultados

Selección inicial: 15/18 aprobados en 4,8 minutos. Los tres fallos fueron del nuevo paso de prueba que buscaba el botón español después de fijar preferencia inglesa. Se exige la ruta inglesa y el botón View quote, conservando todas las comprobaciones de contenido y discriminador legacy. Logs: /tmp/pro-usability2-selected.log.

Repetición focal de las dos pruebas ampliadas: **6/6 aprobados**, 2,7 minutos, WebKit móvil y Chromium escritorio/móvil, sin skips. /tmp/pro-usability2-final.log y /tmp/pro-usability2-final contienen evidencia. Los otros 12 casos conservan entradas relevantes iguales y resultado aprobado de la selección inicial. Hay cobertura compatible de los 18 casos, no una ejecución inicial 18/18 verde.

Las aserciones nuevas exigen foco en búsqueda tras borrar, filtro archivados/por reponer/retirada conservado, enlaces con filtros desconocidos recuperados y cita con quoteId UUID abriendo la anterior correcta aunque exista una canónica con ese UUID. Se conservan las comprobaciones de paginación, 503/reintento, versión concurrente, acciones CSV y documentos/revisión intactos.

TypeScript estricto de fuentes y ESLint focal aprobados (/tmp/pro-usability2-tsc.log, /tmp/pro-usability2-lint-complete.log). Se reutiliza la limitación conocida de tipos generados de Next, sin ocultarla ni debilitar reglas. UTF-8, privacidad de env, presupuesto bilingüe 427/65 y git diff --check aprobados.

Simulador iPhone 17 Pro, iOS 26.5, app temporal contra 127.0.0.1:3185: borrado con × en Inventario mantiene Por reponer y foco; Calendario/Próximas muestra explicación; Cotizaciones combina selector nativo Aceptada y búsqueda Grecia sin desbordamiento. Clientes se inspeccionó visualmente con la búsqueda nueva; su filtro y borrado se comprobaron también en los E2E. Inicialmente el control de ventana devolvió noWindowsAvailable; relanzar la misma app temporal recuperó la interacción. No se guardaron, importaron, descartaron ni enviaron datos durante la revisión visual.

Capturas:
- /tmp/contratacr-pro-usabilidad2-borrar-sin-perder-filtro-20261026.png
- /tmp/contratacr-pro-usabilidad2-agenda-20261026.png
- /tmp/contratacr-pro-usabilidad2-cotizaciones-20261026.png

Comparación exacta de datos y revisiones aprobada: 2 cuentas, 11 citas, 10 cotizaciones anteriores, 50 disponibilidades, 46 clientes, 45 productos, 10 movimientos; también coincide el respaldo original de 11 clientes/10 productos. Rama y HEAD sin cambios. Todo queda sin commit ni push, main/mobile sin modificar.

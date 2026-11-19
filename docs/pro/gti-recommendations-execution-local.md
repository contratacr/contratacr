# Aplicación de recomendaciones GTI — ejecución local

27 octubre 2026. Autorización: «aplica todas tus recomendaciones». Checkout exclusivo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Los cambios anteriores permanecen sin commit. No se crean ramas ni worktrees, se hace push, modifica main/mobile, emite, cobra, envía mensajes ni se usan datos de producción.

## Contrato de trabajo

La [matriz GTI](gti-parity-ledger-local.md) conserva el alcance completo y sus dependencias. No se declara paridad por añadir pantallas. La emisión/recepción fiscal exige proveedor o integración oficial, autorización por emisor, sandbox, esquemas y revisión tributaria; la sesión web no habilita una API. Ninguna recomendación permite automatizar decisiones fiscales ni envíos reales.

Seis incrementos preparados localmente:

| Incremento | Contrato de aceptación |
|---|---|
| Configurar documentos | Condiciones, plazo, fecha CR, medio y notas para borradores nuevos; snapshots anteriores exactos, cambios explícitos respetados, retries/CAS/RLS |
| Gestión de borradores | Duplicado independiente e idempotente sin deuda/stock; archivar/restaurar sin borrar; impresión provisional privada, escapada y marcada sin validez fiscal |
| Grupos y categorías | Administrar/adoptar/renombrar/archivar con aliases y contador propio; no modificar asignaciones ni revisiones del workspace al administrar nombres |
| Gastos/proveedores | Cuenta interna CRC con pagos parciales/reversos append-only; dinero exacto, sin sobrepago, snapshots de proveedor, ledger paginado e idempotencia |
| Descuentos guardados | Preajustes comerciales por monto/porcentaje copiados a líneas, sin cambiar documentos guardados ni motor fiscal |
| Recurrencia de borradores | Plantillas pausables y generación explícita por fecha, copia única por ocurrencia, bloqueo si fuente cambia/archiva; ningún scheduler ni emisión automática |

No dar por cubiertos monedas/tipos de comprobante, descuentos fiscales múltiples, combos fiscales, archivo XML/PDF/importación, cuentas por cobrar completas, recepción/aceptación ni equipo/perfiles por estos incrementos. Continúan como filas distintas de la matriz hasta disponer de implementación y evidencia propias.

## Selección de pruebas antes de ejecución

Base: HEAD indicado y todos los cambios locales previos preservados. Entradas nuevas: seis conjuntos normalizados de dominio/API/SQL/UI, hooks de creación de borrador, gestión documental y navegación Pro. No se cambian credenciales, roles globales, criterios de autenticación ni dependencias. Las cabeceras de middleware/Next reservan la ruta privada de impresión para su CSP restrictiva con nonce; las demás rutas mantienen las protecciones globales. Nuevas tablas requieren RLS/owner/CAS y contratos en PostgreSQL aislado; no basta inspección visual.

Seleccionar por consumidores: nuevos recorridos; emisor, receptor, preparación, creación directa/origen, detalle/impuestos/cargos; catálogo/importación/selector/grupos; pagos/materiales y navegación; integración Pro. Chromium escritorio/móvil y WebKit móvil, ejecución serial. Reutilizar cálculos fiscales compatibles mientras sus entradas no cambien y ampliar cadena SQL por defaults/archivo/copias. Impresión usa logo aprobado: verificar contrato de marca y recorridos de marca correspondientes. No repetir tiendas, pruebas físicas ni CI ajenos.

Antes/después de aplicar extensiones únicamente a loopback: comparar documentos, revisiones, filas de facturas/preparación/detalle/materiales, operaciones, catálogos y emisor originales. No reescribir baselines ni sembrar fixtures remotas. Las pruebas crean cuentas/filas locales desechables y limpian solo sus propios IDs.

## Estado

Los seis incrementos tienen contratos aislados y recorridos funcionales aprobados en Chromium escritorio/móvil y WebKit móvil. Se realizó la revisión nativa descrita más abajo. No se declara paridad completa con GTI, emisión fiscal ni compilación global aprobada. El catálogo de servicios conserva además su evidencia anterior compatible.

## Hallazgos corregidos durante la integración

- Los managers y formularios nuevos reciben nombre accesible explícito; las confirmaciones se identifican por su encabezado real.
- Un mismo PopStateEvent evalúa una sola guardia compartida, evitando una segunda confirmación del formulario inferior al cerrar descuentos. La navegación siguiente conserva su propia comprobación.
- El guardado de una plantilla consume su respuesta antes de cerrar/navegar, evitando respuestas interrumpidas y conservando idempotencia.
- La asociación de una copia permite cascada al eliminar la cuenta; el verificador comprueba los tipos reales de FK y el resto de propietarios intactos. No hay API de eliminación de borradores.
- Las respuestas correctas y de error de impresión tienen CSP, no-store y no-referrer; el texto muestra condiciones y medios de pago en español.
- La transición de borrador nuevo a guardado conserva el aviso tras comprobar propiedad y estado activo; los archivados siguen bloqueados en cualquier entrada.
- En iPhone, las fechas nuevas usan ancho limitado y appearance-none. No se ofrece archivar un proveedor que todavía no existe; su nombre no se altera mediante autocorrección. El ledger muestra Transferencia/Efectivo/Tarjeta en lugar de códigos internos.

## Evidencia nativa y preservación

Simulador iPhone 17 Pro, iOS 26.5, app temporal local com.contratacr.app →127.0.0.1:3185. Control CUA, sin build ni envío a tiendas. Se probó guardar defaults crédito 30/fechaCR y se verificó la fila exacta; después se restauró su ausencia original. Se creó proveedor ficticio y gasto PRO-NATIVE-20261027 por 1001 centavos con los formularios, se abrió su detalle/saldo y se verificó que no existía pago. Se retiraron exclusivamente esas filas verificadas y se restituyeron exactamente las tablas originalmente vacías. No se registraron transferencias reales.

Capturas: /tmp/contratacr-pro-documentos-configurados-20261027.png, /tmp/contratacr-pro-plantilla-recurrente-20261027.png, /tmp/contratacr-pro-gasto-formulario-20261027.png y /tmp/contratacr-pro-gasto-guardado-20261027.png. La plantilla se inspeccionó y cerró sin guardarla. El guardado de ocurrencias y reversos se valida en E2E; no se presenta como prueba manual nativa.

Todos los verificadores originales de preservación vuelven a aprobar tras la limpieza: documentos/revisiones, facturas/líneas/preparación/materiales, operaciones/catálogos y emisor. Se limpiaron además únicamente tres cuentas desechables abandonadas por fallos iniciales, verificando sus IDs/correos exactos desde los traces. La limpieza E2E ahora intenta ambas cuentas aunque falle la navegación y falla si una limpieza falla.

## Límite del chequeo global de tipos

Los chequeos iniciales de TypeScript aprobaron. Tras la prueba de marca que visita rutas públicas, Next generó tipos de /empleos y el chequeo global detectó TS2344: JobsPageContent es una exportación de src/app/[locale]/empleos/page.tsx:17 incompatible con las exportaciones de page de esta versión de Next. Se comprobó que la misma línea ya existe en HEAD y el archivo no tiene cambios locales. No se excluyó el archivo, no se debilitó TypeScript ni se modificó Empleos para obtener verde. La compilación global no se declara aprobada; el alcance de estos incrementos sigue siendo Pro local.

## Resultado final de selección de pruebas

| Evidencia | Resultado y alcance |
|---|---|
| Seis verificadores SQL aislados | Aprobados: catalog-organizations, invoice-document-settings, invoice-management, expenses, discount-presets e invoice-recurrence. Las versiones finales de management/recurrence comprueban las FK CASCADE y borrado de cuenta sin afectar otro dueño |
| Seis recorridos nuevos × tres navegadores | 18 casos funcionales aprobados: organizaciones, descuentos, defaults, gastos, gestión/impresión y recurrencia |
| Consumidores existentes × tres navegadores | 30 casos aprobados: marca, servicios, factura directa, formularios, preparación, emisor, integración/MFA/aislamiento, paths y selectores. La primera ronda tuvo 29 aprobados y un fallo real del aviso de guardado en emisor WebKit; corregido y repetido satisfactoriamente |
| Cabeceras existentes × tres navegadores | 3 casos aprobados. La primera solicitud a la raíz en WebKit excedió 15 s de compilación fría; la repetición en caliente aprobó sin cambiar timeout ni aserciones |
| Apertura y diseño de impresión |Popup privado, propietario, CSP/errores, texto escapado, logo y aislamiento opener aprobados en tres navegadores; capturas revisadas en escritorio y WebKit móvil. Se abrevia Cant. manteniendo aria-label Cantidad para evitar partir la palabra en pantallas estrechas. No se invoca window.print ni el diálogo del sistema |
| Preservación |Todos los baselines originales aprobaron después de aplicar extensiones, ejecutar pruebas y limpiar fixtures nativas; no se rebasaron snapshots |
| Estáticos |Marca, traducciones, security-smoke y diff-check aprobados; ESLint focal sin errores. El chequeo ampliado conserva una advertencia de contador de invalidación en cleanup de defaults, sin supresión. TypeScript global bloqueado exclusivamente por el hallazgo previo de Empleos descrito arriba |

Son 51 combinaciones funcionales E2E distintas, con repeticiones focales por correcciones; no 51 archivos ni una suite general completa. Los fallos iniciales y las correcciones se conservan en logs, no se relajan las aserciones.

Logs principales: /tmp/pro-gti-crossbrowser.log, /tmp/pro-gti-org-desktop-retry.log, /tmp/pro-gti-consumers.log, /tmp/pro-gti-final-corrections.log, /tmp/pro-gti-final-desktop.log, /tmp/pro-gti-final-webkit.log, /tmp/pro-gti-final-mobile.log y /tmp/pro-gti-print-layout.log. El último contiene 3/3 gestión/impresión con el diseño final. El log global de tipos es /tmp/pro-gti-final-types-confirmed.log. Los logs con fallos no se presentan como corridas totalmente verdes: se enlazan con sus repeticiones corregidas.

Preparador local actualizado con las seis extensiones en orden. Todas las instalaciones vivas fueron únicamente a API 127.0.0.1:54321 y PostgreSQL de loopback; sin reset ni migraciones alojadas. Se mantiene el acceso de desarrollo y los permisos Pro previos. HEAD y rama permanecen iguales, sin commit, push ni cambios en main/mobile. El simulador queda abierto en Configurar documentos con la configuración original restaurada.

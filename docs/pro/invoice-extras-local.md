# Impuestos especiales y otros cargos — Pro local

27 octubre 2026. Rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Conservación del trabajo local previo; sin ramas/worktrees, commits, push, emisión ni producción.

## Alcance y fuentes

Se reutiliza la inspección autorizada de GTI documentada en `billing-gti-gap-review-local.md`: otros impuestos separados del IVA y otros cargos en apartado independiente. Reglas contrastadas con [anexos oficiales Hacienda v4.4](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf), ajustes22/04/2026, pp37–44,47–49,56,71,80. Se consultó la fuente vigente antes de implementar. No se modifican documentos GTI ni se invocan operaciones fiscales.

Incremento delimitado a impuestos que se cobran en esta venta: cemento12 sobre subtotal después del descuento (tarifa explícita), combustibles03 sobre litros totales de la línea por impuesto por litro, tabaco06 sobre cantidad de productos × unidades por producto × impuesto por unidad. Solo cemento se añade a la base del IVA en estos tres casos. La exoneración ordinaria se calcula sobre esa base. No se infieren tarifas específicas actuales por producto/CABYS.

No usar para impuestos ya cobrados a nivel de fábrica o asumidos por emisor. Selectivo02, bebidas04/05, IVAespecial07, factor08, impuesto99, surtidos, regalías y fábrica requieren modelos propios y continúan pendientes. No se ofrece un porcentaje genérico para simularlos.

Otros cargos admiten hasta15 entradas de catálogo01–10/99, monto fijo positivo o porcentaje sobre base explícita. Servicio06 exige10%; cobro de tercero04 requiere identificación tipada/número/nombre;99 requiere detalle adicional. La base de un cargo porcentual se conserva tal como se guarda y no se recalcula silenciosamente al cambiar líneas. Los cargos se suman al final, sin IVA automático ni registro de pagos/saldos. Se mantiene el requisito interno de al menos una línea de producto/servicio; documentos de solo cargos no están cubiertos.

## Selección de pruebas previa

Cambian cálculo monetario, tabla/RLS/RPC y API común de borradores. Validar matemáticas BigInt, comparación SQLnumeric, redondeo5decimales, límites/entradas inválidas y compatibilidad v1/v2; contratos en base aislada para CAS, rollback, idempotencia, owner/RLS, reinstalación, escritores anteriores y refresh/reset. Nuevo E2E de extras y consumidores Facturación/detalle/directa/IVA/receptor/preparación en Chromium escritorio/móvil y WebKit móvil. Reutilizar evidencia compatible de navegación/marca/almacenamiento operativo sin cambios; no suite global. Lint focal, tipos de fuentes, UTF-8/diff, revisión independiente y prueba manual en simulador loopback con fixture descartable y comparación posterior de originales.

## Resultados

Implementación y verificaciones cerradas según el registro siguiente. No se declara paridad completa con GTI ni validez fiscal.

## Implementación y comprobación manual

Dos tablas relacionales opcionales: `pro_invoice_line_special_tax` por línea y `pro_invoice_draft_charges` por borrador, con dueño/FK/RLS. Wrappers `pro_invoice_extras_read/save` conservan payload original/idempotencia y revisión atómica. No hay relleno ni recálculo de históricos. Versión `crc-draft-extras-v3` solo con extras presentes; sin ellos se devuelve la forma v1/v2 anterior. El editor actual envía colecciones vacías explícitas; escritores que omiten extras ya guardados reciben conflicto antes de perderlos. Reinstalar IVA admite v3 antes de reinstalar la extensión.

Actualización de título/receptor/preparación conserva extras. Refrescar origen mantiene líneas editadas y cargos; restaurar detalle elimina impuestos de sus líneas explícitamente y conserva cargos independientes, sin duplicarlos en posteriores refresh/reset. La base del cargo porcentual es histórica/explícita. `taxCents` contiene IVA neto más impuestos especiales, mientras `editedDetail.tax` mantiene IVA neto para compatibilidad; se añaden `specialTax` y `chargeTotal`. Se comprueba el límite total antes de exoneración, incluidos impuestos y cargos.

La revisión independiente no encontró defectos de cálculo/CAS/preservación; sugirió distinguir subtotal y baseIVA, ya aplicado. Se preservan grupos plegados y errores que abren/enfocan el campo correspondiente.

Simulador iPhone17Pro/iOS26.5, app temporal/loopback: se creó una única fixture desde helper con guardia127.0.0.1 y baseline privada no sobrescribible. Se agregó cemento5% desde el formulario y un cargo fijo ficticio250, guardó, volvió al borrador y reabrió el detalle. Confirmados visualmente y mediante lectura deBD: subtotal10000,cemento500,baseIVA10500,IVA1365,cargo250,total12115. Captura `/tmp/contratacr-pro-impuestos-cargos-20261027.png`. Se retiró solo esa fixture por dueño/ID/título/directo y se compararon exactamente las tablas de borradores, detalle/líneas e impuestos/cargos originales. Verificadores de workspace, operaciones, normalización, paneles y emisor aprobados. No se alteró el perfil suspendido ficticio ni los datos originales. El simulador vuelve a Facturación.

Matemáticas ampliadas aprobadas: `/tmp/pro-invoice-extras-math.log`, seis bloques incluyendo los anteriores. SQL/PGlite aprobado: `/tmp/pro-invoice-extras-db.log`, ambos orígenes/directa, IVA/exo ampliado, terceros, idempotencia, rollback/CAS, límites, reinstalación, RLS y cascadas. Lint/tipos fuentes/UTF8 aprobados (`/tmp/pro-extras-lint-final.log`, `/tmp/pro-extras-types-final.log`, `/tmp/pro-extras-encoding.log`); no se afirma compilación global.

## Registro de regresión

La primera regresión de siete consumidores × tres perfiles reportó18 aprobados y3 fallos (`/tmp/pro-extras-regression.log`,10,3min). Fallaron clic de preparación en escritorio, persistencia de una modificación IVA en escritorio (POST pendiente/abortado al acabar) y filtro de Facturación móvil. Se observó presión en Next y `Manifest file is empty` en el servidor de desarrollo, abierto desde hacía más de11horas. No se cambió producto ni aserciones/timeout para resolver estos resultados. Se reinició únicamente ese servidor local y se serializaron las repeticiones.

Los dos casos de escritorio aprobaron2/2 en49,1s (`/tmp/pro-extras-recheck-desktop.log`), Facturación móvil1/1 en20,2s (`/tmp/pro-extras-recheck-mobile.log`). Se reutilizan los18 casos compatibles que ya aprobaron; no se repite toda la suite.

El nuevo E2E tuvo primero un timeout de compilación fría y después dos ajustes de harness: selectors de summaries admiten el contador visible; la eliminación explícita retorna forma anterior sin propiedades de extras. La aserción final se hizo exacta: ausencia de las propiedades y versiónIVA-v2 conservada, junto con total/impuestos/catálogos/operaciones originales. No se relajó un resultado monetario. La corrida intermedia aprobó3/3; la corrida con aserciones exactas aprobó Chromium escritorio/móvil y falló WebKit tras recarga en la pantalla real de recuperación de sesión. Se conserva esa evidencia fallida; el caso WebKit se repite después del reinicio, con iguales aserciones y límites (`/tmp/pro-extras-recheck-webkit.log`).

Los datos de terceros cubren en este incremento cédula física/jurídica, DIMEX y NITE, con formato validado pero sin consulta de inscripción. Tercero extranjero no domiciliado queda pendiente. La preparación no certifica elegibilidad de ningún impuesto/cargo ni genera XML fiscal.

Cierre: WebKit extras aprobó1/1 en16,9s, `/tmp/pro-extras-recheck-webkit.log`. Se cubren los21 recorridos consumidores (18primera tanda +3repetidos) y los3 perfiles de extras con aserciones exactas (2Chromium +1WebKit repetido); no se presenta como una única corrida verde ni suite global. Los cinco verificadores privados de conservación volvieron a aprobar al final. HEAD/rama intactos, sin commits/push/emisiones ni cambios a main/mobile.

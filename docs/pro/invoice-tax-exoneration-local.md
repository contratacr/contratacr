# IVA y exoneraciones por línea — Pro local

27 octubre 2026. HEAD/base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama `local/pro-suite-no-push`. Se conserva todo el trabajo local anterior. Sin ramas/worktrees, commits, push, emisión, mensajes ni producción.

## Referencia y alcance

Se reutilizan las observaciones autorizadas de GTI guardadas en `billing-gti-gap-review-local.md`: impuesto/tarifa, base/monto, exoneración documental, institución, fecha y desglose. Se consultó su página pública `https://www.facturaelectronica.cr/LeyesyReglamentos`. Las reglas se contrastaron con `https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf`, edición con cambios del 22/04/2026, páginas44–46,72,75,83, y el ejemplo oficial `https://www.hacienda.go.cr/docs/Escenario8CE.pdf`. No se modificó GTI ni se consultaron autorizaciones de clientes. La versión antigua reproducida en PGR difiere; no gobierna el catálogo implementado.

Esta entrega cubre IVA ordinario y exoneración documental por línea. Mantiene exento, no sujeto y pendiente como estados distintos. Los casos de surtidos, impuestos especiales, IVA especial/fábrica, regalías/bonificaciones, otros cargos y NC/ND/REP quedan pendientes de sus reglas propias; no se simulan con un porcentaje genérico. Tampoco se valida vigencia, elegibilidad, CABYS, XML ni aceptación de Hacienda.

Catálogos de preparación: IVA01/02/03/04/08/09/10/11, documentos de exoneración02/03/04/08/09/10/99 e instituciones01–12/99. No se ofrecen códigos transitorios o reservados a NC/ND como opciones de una factura ordinaria. Las descripciones se conservan en el catálogo del código fuente, con referencia versionada. Elegir un código no certifica su aplicabilidad.

## Cálculo y conservación

IVA bruto calculado sobre la base posterior al descuento comercial; exoneración = base × puntos de tarifa exonerados /100. IVA neto = bruto − exonerado; total = base + IVA neto. No es un porcentaje del impuesto bruto. Se calcula a cinco decimales con BigInt/PostgreSQLnumeric, sumando líneas y redondeando a dos paraCRC. Límites internos siguen conservadores: total antes de exoneración también debe caber en el límite del borrador.

La autorización recoge documento (conserva guiones), artículo/inciso cuando corresponda, institución, fecha y puntos con hasta dos decimales. La fecha es de referencia de borrador (día), sin inventar hora o XML fiscal. Los campos «Otros» se habilitan solo cuando corresponden. Se calcula el monto automáticamente y se impide exceder el IVA generado; no se admite monto libre para casos especiales aún no modelados.

Nueva tabla relacional opcional por dueño/borrador/línea, FK/RLS y revisión atómica del borrador. Sin relleno ni recálculo de históricos. Versión v1 se conserva sin metadatos; escritura explícita nueva usa `crc-draft-tax-v2`. Reintentos de creación, actualización del origen y edición de receptor conservan snapshots. Restaurar origen es acción explícita. Un escritor antiguo que omite los campos fiscales no puede borrar una exoneración existente silenciosamente; debe recargar. El editor actual envía null explícito para líneas sin metadatos en un detalle mixto.

## Selección previa de pruebas

Cambio monetario + tabla/RLS/RPC: ampliar verificador matemático con decimales/límites/validación y casos de control; verificador SQL aislado con equivalencia BigInt/numeric, ambos caminos de creación, CAS, rollback, reintentos, instalación/reinstalación, RLS y conservación. E2E nuevo y consumidores de Facturación/cliente fiscal/emisor/detalle/orígenes/preparación en Chromium escritorio/móvil y WebKit móvil. Se reutiliza la evidencia compatible de almacenamiento operativo y marca/navegación sin cambios. No suite global por cada corrección. Lint, TypeScript de fuentes, UTF-8, diff, revisión independiente y simuladorloopback con fixture identificada y retirada. No producción.

## Revisión y resultados

- Matemáticas ampliadas: PASS (`/tmp/pro-tax-math-final.log`), manteniendo las aserciones anteriores. Parcial/completa, tarifa0,5%, descuentos, redondeos5decimales y centavos, suma100líneas, fechas/documentos/códigos inválidos y límite antes de exoneración.
- SQL/PGlite ampliado: PASS (`/tmp/pro-tax-db-final.log`): ambos caminos, huella original/idempotencia, CAS/rollback, propietario/RLS/RPC, v1 sin cambio/reinstalación, v2 y mezcla de líneas, escritores anteriores, refresh/reset y cascadas.
- La revisión encontró dos fallos recuperables que se corrigieron: el editor actual envía `tax:null` explícito para líneas nuevas sin metadatos; al elegir tarifa cero mantiene accesible el control para retirar la exoneración existente. Se probaron agregando servicio y producto a un borrador exonerado, y retirando la exoneración después de seleccionar cero.
- El primer focal ampliado falló porque `uncheck` de Playwright esperaba un control que desaparece al quitar una exoneración con tarifa cero; se cambió a clic y comprobación explícita de ausencia, snapshot `{vatCode:01,exemption:null}` y total/IVA. Focal corregido PASS (`/tmp/pro-tax-recovery.log`), sin debilitar aserciones.
- Regresión de ocho consumidores × tres perfiles:22 aprobados y2 fallidos durante recarga de desarrollo, registro `/tmp/pro-tax-regression.log`. Un caso perdió el editor durante comprobación del receptor y otro agotó15s consultando el origen. Se repiten únicamente esos dos en Chromium móvil con el código estable; no se cambia ningún timeout ni aserción. La última modificación solo acorta textos/etiquetas y localiza el error documental; se repite además el test fiscal en tres perfiles.
- Lint y TypeScript de fuentes aprobados (`/tmp/pro-tax-copy-lint.log`, `/tmp/pro-tax-copy-types.log`), sin afirmar compilación global ni modificar dependencias/toolchain.

## Simulador y conservación

iPhone17Pro/iOS26.5, binario temporal y servidor Pro loopback, cuenta de demostración ficticia. Se creó un único borrador descartable desde un helper local con guardia explícita127.0.0.1 y baseline privada sin sobrescritura. Se abrió la línea, activó exoneración, eligió autorización04 y comprobó que guardar sin documento revela/enfoca el campo. Se ingresó documento ficticio, institución01, ocho puntos y fecha26octubre2026 mediante calendario nativo. Guardado y reapertura confirmaron base10000, IVAbruto1300, exonerado800, IVAneto500,total10500. La lectura de BD confirmó esos valores y todos los campos documentales.

Se capturó `/tmp/contratacr-pro-exoneracion-guardada-20261027.png` después de reabrir y simplificar textos. Hubo interrupciones `noWindowsAvailable`; se recuperó el control y se completó el recorrido, sin contar intentos incompletos como aprobados.

Se retiró únicamente ese borrador nuevo mediante dueño/ID/título/tipo; su snapshot fiscal se eliminó por cascada. Comparación exacta con baseline privada y verificadores previos: borradores/líneas/materiales/preparación, workspace/revisiones/entradas operativas, catálogo, agenda/cotizaciones y emisor conservados. No se modificaron clientes ni saldos para la prueba. El simulador vuelve a Facturación con los datos originales. Sin emisiones, cobros, notificaciones, commits ni push.

## Cierre de regresión

Los dos recorridos repetidos aprobaron sin cambios en aserciones ni tiempos: **2/2**,1,3min, `/tmp/pro-tax-recheck.log`. Sumados a los22 aprobados originales cubren los24 recorridos seleccionados. El formulario fiscal con textos simplificados/error documental localizado aprobó **3/3**,1min, `/tmp/pro-tax-copy-final.log`.

Última frontera detectada: JavaScript acepta año0000 y PostgreSQL no. Se rechaza esa fecha antes de convertirla enBD; no se toca ninguna fecha existente. Se añadió comprobación matemática/esquema y API400 con snapshot inalterado, repitiendo solo el recorrido fiscal Chromium móvil. La selección anterior de navegadores y cálculos ordinarios se reutiliza: la modificación únicamente restringe esa entrada imposible en la fecha documental.

La comprobación final de fecha y el recorrido fiscal completo aprobaron **1/1**,29,4s (`/tmp/pro-tax-date-final.log`); esquema/matemáticas y lint focal también aprobados. No se modificaron dependencias ni configuración global. La rama y HEAD permanecen iguales, con todo el trabajo local conservado.

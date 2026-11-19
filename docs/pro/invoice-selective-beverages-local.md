# Selectivo y bebidas — preparación local Pro

27 octubre2026. Rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo local anterior; no ramas/worktrees/commits/push ni cambios main/mobile. No emisión, comunicaciones ni producción.

## Investigación y alcance

Se reutiliza la sesión GTI autorizada y su inspección documentada en `billing-gti-gap-review-local.md`: IVA y otros impuestos separados, cantidades/bases/montos específicos y otros cargos independientes. Las reglas se contrastan con [Hacienda v4.4, cambios22/04/2026](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf), pp37–44, y la [Ley4961](https://www.asamblea.go.cr/sd/Documents/BIBLIOTECADIGITAL/DOCUMENTOS/LEYES/LEY%204961-LEY%20DE%20REFORMA%20TRIBUTARIA.pdf), art10. No se modifica GTI ni se infieren tarifas vigentes por CABYS o por la apariencia del formulario.

Selectivo02: tarifa porcentual y base total explícita de la línea con referencia normativa/de cálculo; no se supone que la base sea el subtotal comercial ni se vuelve a multiplicar por cantidad. El usuario debe revisar la base aplicable a su régimen. No se admiten liquidaciones arbitrarias por monto sin base en este incremento.

Alcohol04: ml por envase × porcentaje /100, redondeado a5decimales para obtener alcohol absoluto; impuesto = cantidad de envases × proporción redondeada × impuesto por ml absoluto, redondeado a5decimales. Bebida05: cantidad × ml por envase × impuesto por volumen de referencia / volumen de referencia; un único redondeo final5decimales, evitando pérdida por dividir la tarifa primero. Solo bebidas envasadas: la variante de jabón tiene fórmula propia y se rechaza.

02/04/05 amplían la base IVA junto a cemento12; se conserva la exoneración sobre la base IVA aplicable. Tarifas unitarias se introducen explícitamente, sin catálogo automático ni actualización fiscal. Los impuestos cobrados en fábrica/asumidos, surtidos, jabón, IVAespecial07/factor08 y reglas de emisión permanecen fuera. Seleccionar un código no certifica que aplique al producto/contribuyente.

## Selección previa de pruebas

Cambio monetario + extensión de esquema/RPC: matemáticas exactas y contratos PostgreSQL aislados con comparación v3 antes/después de instalar/reinstalar; todos los caminos heredados de receptor/emisor/preparación, RLS/CAS, idempotencia, rollback, refresh/reset y límites. Nuevo E2E de02/04/05 y regresión de impuestos/cargos anteriores, IVA/exoneración, detalle, directa, borradores de origen y Facturación en Chromium escritorio/móvil y WebKit móvil. Se reutilizan pruebas compatibles de datos fiscales/configuración/preparación cuya implementación no cambia, reforzadas por los contratos SQL compartidos. Sin suite global ni cambios de marca/auth. Lint/tipos de fuentes/UTF8/diff, revisión independiente y simuladorloopback con fixture identificada y retirada; comparación exacta de originales.

## Resultados

Implementación y verificaciones cerradas según el registro siguiente. No se declara paridad completa con GTI ni validez fiscal.


## Conservación y extensión

`invoice-special-expanded-local.sql` se instala al final de la preparación local. Añade cinco columnas opcionales en la tabla relacional de impuestos, amplía a seis códigos únicos y valida los grupos específicos de cada código. No rellena snapshots ni recalcula históricos. El JSON de03/06/12 conserva exactamente sus cuatro campos; los objetos selective/alcohol/beverage aparecen solo en el código correspondiente. Versiónv4 se guarda únicamente con02/04/05; sin ellos se conserva v3/v2/v1. Los instaladores anteriores admiten v4 para permitir una reinstalación ordenada. Se mantienen los mismos RPCs y el payload original para idempotencia; título/receptor/preparación, refresh/reset y cargos independientes conservan su contrato.

## Revisión y resultados

- Matemáticas: ocho bloques PASS, `/tmp/pro-invoice-beverages-math.log`, manteniendo las aserciones anteriores y añadiendo base selectiva independiente del descuento/cantidad, proporción de alcohol redondeada antes de multiplicar, división racional final de bebida05, mezcla de seis códigos, baseIVA/exoneración, límites y campos incompatibles.
- SQL/PGlite: PASS, `/tmp/pro-invoice-special-v4-db.log`. Instalación sobre filasv3 existentes y reinstalación completa ordenada conv3/v4, igualdad de headers/snapshots/JSON anteriores, ambas creaciones, rollback/CAS, idempotencia, omisión de editores antiguos, terceros/cargos, refresh/reset, RLS y cascadas. Incluye todos los contratos anteriores de datos fiscales/emisor/preparación.
- La revisión independiente detectó un defecto real de precisión05: cantidad0.01871,ml69.83,unitario76539.61943,referencia99999.99. La divisiónnumeric PostgreSQL redondeaba a1.0000050000000000 antes de round5 y daba1.00001; BigInt exacto daba1.00000. Se corrigió usando unidades enterasnumeric y `div(2*N+D,2*D)` antes de volver a la escala decimal. No se fija una cantidad arbitraria de dígitos. Ocho casos de paridad TS/SQL incluyen el valor señalado, vecinos y empates; todos PASS. Una revisión posterior confirmó la corrección sin otros defectos concretos. Solo se reaplicó esta extensión a loopback, sin reinstalar los wrappers anteriores durante E2E activos.
- Regresión de seis consumidores × tres perfiles: **18/18 PASS**,5.4min, `/tmp/pro-beverages-regression.log`. Facturación, directa, detalle, borradores de origen, IVA/exoneración e impuestos/cargos anteriores. Sin fallos ni aumento de tiempos ni cambios de aserciones.
- E2E nuevo: primer focal Chromium móvil1/1 PASS,25.7s (`/tmp/pro-beverages-focal.log`). Tras añadir la frontera05 exacta y corregir SQL: WebKit móvil/Chromium escritorio **2/2 PASS**,36.7s (`/tmp/pro-beverages-new-browsers.log`), y solo Chromium móvil repetido **1/1 PASS**,17s (`/tmp/pro-beverages-mobile-final.log`). Los tres perfiles finales comprueban fórmulas, exoneración, versionesv3/v4, validación/campos cruzados, snapshots, dueño/CAS/reintentos, UIcondicional, foco de error, guardado/recarga, ancho y conservación de workspace/libro. El test admite usar el botón real Reintentar si la recarga muestra recuperación de sesión, exigiendo después el editor; no se aumenta el timeout ni se omite la comprobación de persistencia.
- Lint y TypeScript de fuentes PASS, `/tmp/pro-beverages-lint-final.log`, `/tmp/pro-beverages-types-final.log`; UTF8/diff PASS. No se afirma compilación global. Se reutiliza la evidencia compatible de navegación, marca y datos fiscales; no se cambian dependencias ni autenticación.

## Simulador y limpieza

IPhone17Pro/iOS26.5, binario temporal con servidor Pro loopback. Helper con guardia127.0.0.1 y baseline privada no sobrescribible creó un único borrador descartable. Su combinación ficticia prueba aritmética y campos; no representa la elegibilidad tributaria de un producto real. En el formulario se modificaron base selectiva100→200, alcohol12→20% y referencia de bebida250→500ml. Guardado, vuelta al borrador y reapertura mostraron subtotal180,selectivo20,alcohol30,bebida4,baseIVA234,IVA30.42,total264.42. La lectura deBD confirmó todos los valores y la referencia conservada.

Capturas: `/tmp/contratacr-pro-selectivo-formulario-20261027.png`, `/tmp/contratacr-pro-bebida-alcohol-formulario-20261027.png` y `/tmp/contratacr-pro-selectivo-bebidas-20261027.png`. Se retiró únicamente esa fixture por dueño/ID/título/tipo y se compararon exactamente borradores, detalle/líneas, IVA/exoneración, otros impuestos y cargos originales. Los cinco verificadores privados de workspace/operaciones, detalle, normalización, paneles y emisor volvieron a aprobar. Datos originales conservados; el simulador vuelve a Facturación. Rama yHEAD intactos; sin commits/push/emisión ni comunicaciones reales.

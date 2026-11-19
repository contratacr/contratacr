# Agenda y cotizaciones: consultas acotadas de Pro

> Etapa previa de consultas. La normalización posterior del almacenamiento,
> aplicada localmente, se documenta en [normalized-agenda-quotes-local.md](normalized-agenda-quotes-local.md).
> Ese documento sustituye los límites de almacenamiento JSON descritos aquí.

26 de octubre de 2026. Solo `/Users/contratacr/Desktop/contratacr/contratacr-pro`,
`local/pro-suite-no-push`; HEAD/base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`.
Se preservan los cambios locales previos de catálogos. Sin push ni merge.

## Comportamiento

- Agenda usa `/api/pro/agenda`: fecha elegida, páginas de hasta 20 citas, horarios
  de ese día e indicadores distintos del mes visible (máximo 31 fechas). Navegar
  por meses carga sus indicadores sin descargar las citas del mes completo.
- Los detalles de citas y borradores recuperados se consultan por ID. Las citas
  terminadas/canceladas y sus IDs se mantienen; los clientes archivados siguen
  disponibles en su contexto histórico.
- La lista de Cotizaciones usa `/api/pro/quotes`: une los documentos habituales y
  las cotizaciones antiguas, filtra/busca en PostgreSQL y devuelve resúmenes de 20.
  El cursor compuesto por fecha/origen/ID conserva empates y permite continuar
  más allá del límite de 100 del endpoint habitual. Los detalles y líneas se
  cargan únicamente al abrir un documento. El profesional sin Pro conserva su
  sección/API anterior.
- Los selectores de clientes, inventario y cotizaciones aceptadas tienen páginas,
  búsqueda y recuperación por ID de la selección actual, aunque esté fuera de la
  primera página. Los precios y el tratamiento del IVA del editor no cambian.
- Una cotización antigua mantiene su editor, estados y descarga. Se lee/guarda
  solo ese registro, con el cliente elegido y un selector paginado de inventario.
- La comprobación de acceso se resuelve antes de montar Cotizaciones. Para Pro
  se omite además la precarga antigua de `/api/quotes` que Mi panel hacía en
  segundo plano, evitando descargar hasta 100 documentos con líneas aunque
  la lista visible estuviera paginada. Sin Pro y fuera de desarrollo conserva
  su comportamiento anterior.
- No hay GET/PUT de `/api/pro/workspace` en los recorridos conectados de Agenda y
  Cotizaciones, incluidos los formularios y el detalle antiguo. El endpoint de
  compatibilidad permanece para contratos anteriores y pruebas explícitas.
  El enlace antiguo `?tab=pro` abre también la agenda acotada.
- Las escrituras parciales usan `pro_patch_core`, con el mismo bloqueo/revisión
  de catálogos y del contrato anterior. No se envían al servidor arrays completos
  del workspace para guardar una cita, horario, vínculo o cotización antigua.
- Las reservas públicas leen solo disponibilidad y citas; `pro_reserve_core`
  guarda atómicamente la cita y su cliente. Reintentos y conflictos siguen cubiertos.

## Preservación y límites

`panel-queries-draft.sql` agrega/reemplaza funciones locales y permisos de RPC,
sin migrar ni borrar registros. Lo aplica el preparador existente, que exige
API/PostgreSQL en loopback. Todos los RPC quedan restringidos a `service_role`;
las rutas conservan desarrollo, sesión, Pro, propietario, origen y MFA de admin.

Agenda, disponibilidad, cotizaciones antiguas y vínculos continúan almacenados en
el núcleo JSON. Las consultas de listado filtran/paginan en PostgreSQL; algunas
validaciones de escritura consultan el núcleo en servidor para detectar cruces
con citas de otras fechas y comprobar vínculos. Ese núcleo no se entrega al
navegador. No se afirma que todo el almacenamiento de Pro sea ahora relacional.

Las citas se muestran en el día de inicio, como antes; una cita que atraviesa
medianoche sí participa en la validación de solapamientos de ambos días. El CSV
recorre todas las páginas del día solicitado y cancela si cambia la revisión.

Se corrigió la lectura de opcionales SQL NULL como campos ausentes del contrato
existente, sin relajar los esquemas de entrada. También se toma el borrador tras
actualizar los controles, conservando el cliente aunque su selector aún cargue.

## Selección y evidencia

El cambio toca contratos de lectura/escritura compartidos con catálogos,
reservas, permisos y MFA: corresponde una regresión amplia de **Pro** en los tres
motores. No cambia marca, layout raíz, dependencias, binarios o CI; no se repiten
las pruebas físicas/tiendas ni la suite histórica global del otro chat.

- Focales existentes: integración completa (admin MFA, crear cotización, vínculo,
  cita, borrador, clientes, inventario), panel y reservas. Los fallos iniciales
  expusieron los opcionales NULL y el borrador durante carga diferida; se
  corrigieron sin alterar sus aserciones.
- `pro-scoped-panels.spec.ts`: 150 cotizaciones (105 habituales y 45 antiguas),
  42 citas paginadas, fechas/cursores inválidos, indicadores mensuales, detalle,
  precios antiguos con redondeo, búsqueda literal/con tildes, selección fuera
  de página, privacidad, denegación de RPC, Pro inactivo, CAS con catálogos,
  conservación de otros registros, borrador/reintento y ausencia de workspace
  completo en red, incluida la precarga de cotizaciones habituales.
- `verify-panel-db.mjs`: PostgreSQL aislado (PGlite), documento previo idéntico
  después del SQL, proyecciones, total antiguo, actualizaciones parciales, CAS,
  reserva/cliente atómicos, identidad de reserva y denegaciones de RPC/RLS.
  Aprobado: `/tmp/pro-panel-db.log`.
- Regresión completa y artefactos: `/tmp/pro-panels-final.log` y
  `/tmp/pro-panels-final`: **63/63 aprobadas**, tres motores, sin omisiones;
  6,2 minutos. Tras suprimir la precarga de Mi panel se seleccionan solo los
  consumidores afectados (integración, panel, Pro/sin Pro y red acotada), sin
  repetir la suite completa. Log: `/tmp/pro-panels-prefetch.log`.
- Comparación adicional contra las copias originales de dos cuentas: **11 citas,
  10 cotizaciones, 50 horarios, 11 clientes, 10 productos y 10 movimientos
  conservados**, además de vínculos idénticos. Los ejemplos añadidos en la ronda
  anterior permanecen; las cuentas de pruebas nuevas son desechables.

## Simulador

Se reutilizó `/tmp/contratacr-pro-simulator/App.app`, con servidor
`http://127.0.0.1:3185` y la cuenta ficticia existente `Isaac Sánchez Monge · Local`.
No se recompiló ni publicó una app ni se modificó el checkout mobile. Se
inspeccionaron visualmente Agenda y Cotizaciones en iPhone 17 Pro/iOS 26.5:

- `/tmp/contratacr-pro-agenda-acotada-20261026.png`
- `/tmp/contratacr-pro-cotizaciones-paginadas-20261026.png`

El simulador queda en Cotizaciones, con la sesión y servicios locales activos.
No se enviaron mensajes, correos, campañas ni notificaciones reales.

## Comprobaciones estáticas

TypeScript aprobado: `/tmp/pro-panels-tsc-prefetch.log`. ESLint de módulos Pro,
selectores, APIs y pruebas afectados, sin errores ni advertencias nuevas. Al
incluir Mi panel completo aparecieron **3 errores y 6 advertencias preexistentes**;
se comparó su mismo archivo de HEAD mediante ESLint por stdin y produjo los
mismos diagnósticos. No se desactivaron reglas ni se modificaron esas secciones
ajenas al cambio. Evidencias: `/tmp/pro-panels-lint-prefetch.log` y
`/tmp/pro-panels-dashboard-lint-baseline.log`.

La primera ejecución focal de WebKit alcanzó un error transitorio de compilación
al quedar un import antes de `use client`; se corrigió el orden. Ese intento no
cuenta como integración aprobada: se repite su caso tras terminar los otros
consumidores. No se aumentan timeouts ni se cambia ninguna aserción existente.

## Cierre final

- Suite Pro: **63/63 aprobadas**, tres navegadores, sin omisiones.
- Focal posterior a la precarga: **11 aprobadas**; el único caso detenido por
  compilación se repitió correctamente en la revisión final.
- Revisión final: **4/4 aprobadas** en `/tmp/pro-panels-review.log`: integración
  admin/MFA en WebKit y recorrido acotado en WebKit/Chromium escritorio/Chromium
  móvil, incluido el enlace antiguo `?tab=pro` y el bloqueo de ambas descargas
  completas en segundo plano. Se reutilizan los otros focales compatibles.
- TypeScript aprobado: `/tmp/pro-panels-tsc-final.log`. Los módulos Pro, API,
  selectores, formulario y pruebas pasan ESLint sin errores/advertencias:
  `/tmp/pro-panels-lint-final.log`. La página contenedora mantiene únicamente los
  diagnósticos previos ya comparados contra HEAD; no se afirma lint global verde.
- Codificación UTF-8, presupuesto bilingüe, archivos privados y diff-check
  aprobados. Comparación final de datos originales aprobada otra vez.
- Cambios sin commit/push; mismo HEAD y rama. Sin acciones en main/mobile,
  producción, tiendas o canales de comunicación reales.

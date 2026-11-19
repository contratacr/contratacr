# Pro: ejecución autónoma y criterios de candidato local

## Estados del panel corregidos — 4 noviembre 2026

Tres errores y seis advertencias cerrados, caché/Guías/cabecera probados en ES/EN y tres proyectos; 28 casos seleccionados aprobados y datos de referencia conservados. [Informe vigente](panel-state-and-project-simulator-local.md). La revisión manual de Proyectos en iOS sigue bloqueada por noWindowsAvailable; no confundir los E2E WebKit con ese pendiente ni habilitar publicación.

## Cierre de alcance vigente — 4 noviembre 2026

Congelar nuevas funciones y cerrar calidad del recorrido de servicios. No preparar venta ni ampliar GTI. [Alcance, cobertura y bloqueos de publicación](local-readiness-review-2026-11-04.md) prevalece sobre los planes históricos de abajo. Facturación sigue secundaria; los endpoints continúan locales y no se habilitan en producción.

## Ronda de calidad ampliada — 4 noviembre 2026

Se cerró la validación EN de preparación, cambios, constancias/fotos, paquetes, costos, gastos, estados de cuenta y correcciones de pagos en Chromium móvil/WebKit móvil, con regresión ES: [resultado y límites](secondary-english-review-local.md). Correcciones de idioma/accesibilidad sin ampliar secciones ni motor fiscal. Se conserva la pausa de paridad GTI y el objetivo de mejorar ContrataCR antes de vender Pro. La prueba manual del teléfono EN quedó completada en el simulador (país, longitud y formato CR, retirando el número ficticio); no equivale a una certificación global de todo el producto.

## Recorrido de trabajo a abono — 4 noviembre 2026

Acceso directo Saldo y abonos en el trabajo terminado, conservando el origen para volver. Se amplía la prueba de aceptación hasta cierre y pago con respuesta perdida/reintento exacto. [Alcance, evidencia y límites](journey-completion-and-payment-local.md).

## Proyectos conectados con el servicio — 4 noviembre 2026

Se reutilizan Proyectos, contacto, editor/cuenta existente y trabajo: continuación Pro con cliente/proyecto precargados, respuesta del cliente desde Mis proyectos y acceso al trabajo aceptado. Borradores ajenos y fichas enriquecidas conservados. Aprobación de complementos reutilizada, sin otra sección ni envío automático. [Pruebas, capturas y límites](project-service-journey-local.md).

## Ejecución vigente — mejora continua solicitada el 3 noviembre 2026

El usuario solicita autoasignación de tareas, comparación con Thumbtack, Yelp, GetNinjas, Upwork, Fiverr y otras apps, pruebas funcionales/diseño/inglés para las secciones nuevas. No preparar todavía lanzamiento/venta Pro. El tablero y comparación actualizados están en [mejora continua](research/2026-11-03/autonomous-product-review.md). Cada incremento debe preservar datos, usar evidencia por caso y declarar pendientes; investigación documental no equivale a probar cuentas privadas. Sin push/producción ni automatizaciones fuera de sesión no solicitadas.

## Prioridad vigente — 3 noviembre 2026

El usuario reorientó el trabajo a hacer ContrataCR más eficiente, atractivo y fácil de usar; preparar Pro para vender no es el objetivo inmediato. Se pausa ampliar equivalencia GTI. Primero solicitud → cotización → visita → trabajo terminado, reutilización de datos y próximos pasos claros. Facturación se conserva como herramienta secundaria, sin emisiones reales. [Navegación simplificada](simplified-pro-local.md) y [eficiencia del servicio](service-efficiency-local.md) prevalecen sobre los objetivos históricos de lanzamiento y paridad que siguen abajo. Solo checkout Pro local, conservando datos, sin push ni producción.

## Decisión de producto vigente — 31 octubre 2026

El usuario aprobó priorizar las funciones habituales y organizar Pro por tareas, comparando proveedores que operan en Costa Rica. El objetivo de lanzamiento es un recorrido útil y completo para profesionales de servicios: cliente → cotización → trabajo → borrador/factura validada → pagos y saldo, con costos para entender el resultado. La matriz GTI se conserva como referencia de capacidades y dependencias; reproducir todos sus módulos deja de ser un requisito del lanzamiento inicial.

La organización aplicada es **Ventas y cobros** con **Cotizaciones**, **Facturas** y **Pagos**, manteniendo Clientes, Agenda, Inventario y Gastos conectados. Los casos especializados se presentan como opciones avanzadas sin retirar datos ni validaciones. La simplificación no elimina requisitos fiscales del caso aplicable ni habilita emisión real antes de su validación específica.

Comparación pública local en [proveedores para Costa Rica](costa-rica-billing-comparison-local.md): HuliPractice conecta cita/cliente/proforma/factura/abonos; Alegra CR distingue Facturación de ERP/POS; Factura Profesional ofrece capacidades por nivel. Son patrones publicados, no evidencia de popularidad, estadísticas de uso ni de que estas plataformas copien GTI. La revisión funcional de ContrataCR está en [Ventas y cobros](sales-workspace-local.md).

Este bloque tiene prioridad sobre los objetivos históricos de paridad total que se conservan a continuación. No se elimina funcionalidad ya implementada. Solo Pro local; sin push, emisión, cobros, envíos o cambios en otros checkouts.

## Prioridades de producto revisadas — 28 octubre 2026

El usuario pide una lista de lo que realmente sirve de GTI, investigar otras aplicaciones e implementar mejoras mientras se plantean. Este apartado es el plan vigente para priorizar; el registro `gti-parity-ledger-local.md` conserva el detalle de los 33 accesos auditados. Trabajar solamente en Pro local, preservar datos, sin push, emisión, envíos reales ni modificaciones de otros checkouts.

### Qué debe ofrecer la licencia Pro

Un profesional puede pasar de una solicitud a una cotización, agendar el trabajo, registrar materiales y abonos, preparar su factura y consultar el saldo del mismo cliente. Se reutiliza la información en cada paso. La parte fiscal debe completar sus propias pruebas de esquema/proveedor/sandbox antes de ofrecer emisión real; tener formularios o borradores no cierra esa dependencia.

### Lista de GTI que sí aporta utilidad

Los números corresponden a la matriz de 33 accesos; se agrupan por tarea para evitar replicar 33 entradas en el menú.

| Capacidad para Pro | Referencia GTI | Estado comprobado y siguiente paso |
|---|---|---|
| Factura directa y desde un trabajo/cotización, con cliente y líneas reutilizables | 1, 6 | Borradores parciales implementados; completar tipos/campos, proveedor, firma y ciclo fiscal en sandbox |
| Proformas/cotizaciones que se convierten en trabajo y borrador | 5, 10 | Integración parcial; cerrar impresión, revisión de versiones y conversión sin duplicados |
| Guardar, encontrar, editar, duplicar y archivar borradores | 9 | Implementado localmente; fortalecer historial y comprobar recorridos finales |
| Archivo de emitidos, estados reales y notas de crédito/débito | 8 y transversal | Pendiente; comercial, fiscal y pago deben ser estados distintos |
| Tiquete, factura de compra y exportación | 2, 3, 4 | Pendiente; activar según necesidad, con reglas propias por documento |
| Descargar PDF/XML/respuesta y exportar períodos completos | 11 | Solo impresión provisional/CSV parciales; archivo fiscal privado pendiente |
| Importar documentos y aceptaciones del proveedor anterior | 12, 15 | Pendiente; vista previa, deduplicación, origen preservado y ninguna reemisión |
| Recibir documentos, revisar y aceptar/rechazar explícitamente | 13 | Pendiente; bandeja y estados de receptor con pruebas sandbox |
| Proveedores y gastos vinculados al negocio/trabajo | 14 | Gastos internos CRC parciales; adjuntos e impuestos de documento pendientes |
| Abonos, saldo disponible, correcciones con historial y recibos | 16, 17 | Implementación interna parcial; caja, conciliación, monedas y aplicaciones a emitidos pendientes |
| Clientes, contacto y datos para facturas reutilizables | 18 | Ficha integrada parcial; consulta de nombre/tipo añadida en este incremento, múltiples contactos y ubicación codificada pendientes |
| Importación de clientes y reporte/exportación | 19, 21 | CSV propio parcial; mapeo explícito de GTI y manejo de duplicados pendientes |
| Grupos de clientes | 20 | Implementación local; usar filtro avanzado si el usuario los necesita |
| Productos y servicios, CABYS, unidades, existencias y costos | 22 | Catálogo normalizado parcial; búsqueda oficial de CABYS y datos específicos pendientes |
| Descuentos reutilizables | 23 | Catálogo comercial parcial; códigos y combinaciones fiscales pendientes |
| Importar catálogo y exportar inventario/movimientos | 24, 25 | Parcial; separar stock inicial de cantidades comerciales y cubrir el conjunto completo |
| Categorías y paquetes de servicios/materiales | 26, 27 | Categorías y paquetes comerciales reutilizables implementados; combos con consumo automático de inventario pendientes |
| Datos del emisor, valores predeterminados y actividad económica | 28, 29, 30 | Parcial; moneda, series/sucursales, actividades oficiales y múltiples emisores pendientes |
| Cuenta, colaboradores y permisos por negocio | 31, 32, 33 | Cuenta general reutilizable; colaboradores y permisos de negocio pendientes de modelo/RLS |
| Recurrencia y adjuntos | Transversales del servicio GTI | Plantillas internas parciales; visitas recurrentes y archivos privados pendientes |
| Punto de venta/caja | 7 | Pendiente y opcional; se prioriza después del flujo de servicios y del motor fiscal |

No copiar controles de contratación/saldo de la licencia GTI: la suscripción Pro tiene su propio modelo. Q-Declaro, nómina, financiación, GPS permanente y contabilidad completa quedan fuera del núcleo inicial hasta demostrar necesidad y soporte. Las referencias de GTI son inventario histórico observado + servicio público; no se afirma una nueva auditoría de su sesión privada hoy.

### Mejoras útiles de otras aplicaciones

Prioridad 0: tareas frecuentes y coherencia. Prioridad 1: ahorro de tiempo/errores. Prioridad 2: crecimiento o sectores específicos. «Propuesto» no significa implementado.

| Orden | Mejora | Ejemplo de utilidad | Estado / criterio para implementarla |
|---|---|---|---|
| 0 | Consultar identificación sin volver a escribir nombre/tipo | Preparar los datos fiscales de una empresa | Primera implementación de este incremento: consulta explícita, resultado revisable y aplicación voluntaria; no cambia contacto, facturas anteriores ni estado de verificación |
| 0 | Hoy y pendientes | Ver cita siguiente, cotización por responder y saldo por cobrar | Primera entrega por cliente: citas por revisar/próximas y cotizaciones por preparar/responder/agendar; vista global futura |
| 0 | Estado de cuenta del cliente | Entender qué debe por cada trabajo y sus abonos | Implementado local: resumen y movimientos paginados, historial de cambios y pagos directos separados; impresión privada pendiente |
| 0 | Agendar/reprogramar desde el trabajo | Mover una visita conservando cliente y motivo | Base parcial; revisar conflictos, hora CR, duración y trazabilidad |
| 1 | Plantillas y paquetes de servicios | Visita diagnóstica, instalación o limpieza por área | Implementado local: catálogo propio de hasta 20 líneas, copia revisable a cotización/factura y snapshots independientes sin descuento de stock |
| 1 | Horas y gastos por trabajo | Registrar tiempo real y gasto reembolsable | Implementado local: horas/costo por hora y gastos canónicos completos por trabajo, con correcciones auditadas; facturación de reembolsos pendiente |
| 1 | Rentabilidad estimada/real | Saber si un trabajo deja margen tras materiales y horas | Primera vista por trabajo: importe acordado menos costos registrados; resultado incompleto si faltan tarifas. No es utilidad contable neta ni reporte global por servicio |
| 1 | Fotos antes/después, notas y listas breves | Documentar reparación, instalación o limpieza | Constancia local con checklist, recomendaciones, nota interna y fotos privadas seleccionadas; subida recuperable y versiones compartidas inmutables. Clasificación antes/después específica pendiente |
| 1 | Opciones en una cotización | Básico/recomendado/completo y adicionales | Complementos optativos implementados localmente, selección explícita, snapshot y totales aceptados. Paquetes mutuamente excluyentes aún pendientes |
| 1 | Portal del cliente | Ver cotización, solicitar cambios, cita y saldo | Primer recorrido integrado local en Citas: preparación, cotizaciones con complementos, cambios de acuerdo, saldo y constancia, con cuenta gratuita/relación verificada. Portal fiscal completo pendiente |
| 1 | Pendientes de seguimiento | Recordar una cotización sin respuesta o visita por programar | Lista interna por cliente implementada; sin correo/WhatsApp/push ni cambios automáticos de estado |
| 2 | Mantenimiento y garantías | Próxima limpieza, revisión de equipo o vencimiento de garantía | Propuesto; visita, factura y pago recurrentes separados |
| 2 | Equipo con permisos simples | Ayudante ve trabajo y agenda sin acceso a todo el negocio | Pendiente; asignación, revocación y aislamiento probados antes de habilitar |
| 2 | Exportación y respaldo portable | Entregar información al contador o cambiar de herramienta | Parcial; exportación íntegra por período, privada y con versión de formato |
| 2 | Trabajo sin conexión | Guardar notas en campo y sincronizar después | Propuesto a futuro; conflictos explícitos, aislamiento por cuenta y conservación antes de prometerlo |

### Referencias oficiales consultadas

- [GTI: servicio](https://www.facturaelectronica.cr/NuestroServicio): documentos, recepción, reportes, catálogo, borradores, recurrencia, notas y adjuntos. Sirve para el alcance fiscal, sin certificar lo que Pro tiene.
- [Jobber: aprobación de cotizaciones](https://help.getjobber.com/en/articles/quote-approvals/) y [portal](https://help.getjobber.com/en/articles/what-do-your-clients-see-in-client-hub/): interacción del cliente y opciones.
- [Jobber: costos del trabajo](https://help.getjobber.com/en/articles/job-costing/) y [listas de comprobación](https://help.getjobber.com/en/articles/checklists/): horas, costos, gastos y evidencia; evitar doble conteo.
- [Housecall Pro: catálogo de tarifas](https://www.housecallpro.com/features/price-book/): servicios reutilizables, duración, imágenes y paquetes; las tarifas de otro mercado no se importan como recomendaciones de precios CR.
- [Housecall Pro: visitas y recurrencia](https://help.housecallpro.com/en/articles/12892543-appointments-vs-segments-vs-recurring-jobs) y [planes](https://help.housecallpro.com/en/articles/2932107-service-plans-dashboard-overview): próxima visita y pendientes de programación.
- [Zoho Invoice: funciones](https://www.zoho.com/us/invoice/features/): horas, gastos facturables, portal y estado de cuenta. Referencia operativa, no equivalencia fiscal costarricense.
- [Alegra CR: reportes](https://www.alegra.com/costarica/contabilidad/reportes/): cuentas por cobrar e inventario. No etiquetar un resumen operativo como balance contable completo.

### Forma de entregar y comprobar

Orden de siguientes entregas: consulta de identificación → estado de cuenta / pendientes → plantillas de servicios → horas y costos → evidencia del trabajo → portal. La emisión fiscal se lleva como dependencia separada con proveedor/sandbox y criterios propios, no se pospone su identificación ni se sustituye por un PDF provisional.

Cada entrega debe resolver una tarea de principio a fin, conservar originales, tener controles de error/retorno y pruebas focales de consumidores. Menús iniciales cortos, búsqueda más un filtro principal, opciones sectoriales plegadas y entrada manual disponible ante caída externa. La investigación demuestra que las funciones existen en otras plataformas; su prioridad en ContrataCR es una recomendación que debe contrastarse con profesionales de varios oficios. No se declara terminada ni lista para cobrar por tener una lista o pasar una captura.

Identificaciones: la integración inicial reutilizaba `/api/cedula/[id]`. Desde el 1 noviembre, los formularios fiscales Pro usan una consulta privada por POST, sin caché de resultados y con cuotas compartidas; ver [endurecimiento y revisión jurídica pendiente](identity-lookup-security-local.md). El endpoint público de registro anterior sigue separado y requiere auditoría antes de ofrecer una herramienta independiente. Actividad económica, CABYS, morosidad, representación legal y titularidad de la cuenta no quedan cubiertos por la consulta Pro. Las pruebas usan respuestas simuladas; no envían identificaciones reales a Hacienda.

Primera entrega de este plan: consulta de identificación implementada y comprobada en WebKit móvil y Chromium móvil/escritorio, con validación de conservación. Detalle en `client-fiscal-local.md`. El filtro de pagos sin fecha también cerró su E2E en los tres perfiles (`payment-overview-local.md`). Ambos mantienen pendiente la revisión nativa porque el control del simulador devuelve `noWindowsAvailable`; no se declara paridad GTI ni validación del proveedor externo por estas pruebas.

Segunda entrega: [estado de cuenta y pendientes por cliente](client-statement-and-pending-local.md), sobre datos normalizados y sin duplicar cargos por borradores. El detalle enlazado conserva el alcance y la evidencia de esta entrega.

Tercera entrega: [plantillas y paquetes de servicios](service-packages-local.md) reutilizables en cotizaciones y facturas, con precios propios, revisión antes de copiar y edición independiente. No representa combos con consumo automático de inventario ni equivalencia fiscal adicional.

Cuarta entrega: [horas, gastos y resultado por trabajo](work-costs-local.md), con materiales históricos netos, valoración del tiempo y gastos reutilizados. El saldo por cobrar, los pagos y el resultado económico conservan funciones distintas.

> Evidencia histórica del plan inicial (26–27 octubre): lo que sigue conserva sus resultados y no sustituye las prioridades del 28 octubre anteriores ni la restricción vigente de trabajar solo en Pro, sin push. Consultar también el [registro de equivalencia GTI → Pro](gti-parity-ledger-local.md).

26 octubre 2026. Autorización del usuario en este chat: asignar tareas a agentes,
implementar, probar funcionalidad y usabilidad y revisar visualmente con GTI ya
inspeccionado como referencia. Solo checkout Pro, rama `local/pro-suite-no-push`,
HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Todo el trabajo previo permanece
sin commit. Sin nuevas ramas/worktrees, push, despliegue, producción ni mensajes
reales. Este plan no reactiva autorizaciones históricas de otros documentos.

## Forma de trabajar

Coordinador integra y decide alcance. Agentes acotados para producto/historial,
interfaz/cotizaciones y revisión independiente de confiabilidad. Cada archivo de
implementación tiene un propietario durante el trabajo paralelo. SQL, pruebas
compartidas y simulador se ejecutan centralmente para evitar interferencias.

Ciclo: hallazgo verificable → criterio de aceptación → implementación → pruebas
según dependencias → revisión independiente → recorrido visual → evidencia.
No se marca una tarea terminada por existir código, por consenso entre agentes
o por una captura sola. No se repetirán suites completas por cada retoque.

La [documentación oficial de subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents)
recomienda dividir tareas y limitar conflictos de escritura. El
[flujo de desarrollo de Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)
propone criterios y evidencia observada. Se adopta ese método dentro de las
reglas de este repositorio, sin añadir dependencias o servicios para coordinarlo.

## Meta local verificable

Profesional independiente o negocio pequeño puede gestionar clientes,
cotizaciones, agenda e inventario con datos propios, sin repetir información y
sin menús innecesarios. GTI aporta continuidad y jerarquía, no33 entradas de menú
ni funciones fiscales ficticias. La disposición a pagar requiere validación con
profesionales reales; pruebas automáticas no la demuestran.

| Tarea | Criterio de aceptación | Responsable | Estado |
|---|---|---|---|
| Inventario de implementación y límites GTI | Distinguir lo existente de faltantes y bloqueos externos | Agentes de auditoría | Auditado |
| Filtros de cotizaciones | Búsqueda +un estado, seis estados disponibles incluyendo retiradas; sin carril de cinco botones; restablecer búsquedas vacías | UX | Validado |
| Detalle de cotización recuperable | Carga visible, error y reintento del mismo ID, sin mostrar otra cotización por carrera | UX | Validado |
| Historia completa y escalable de cliente |20 resúmenes mixtos por página, cotización vinculada fuera100 globales visible; detalles por ID, sin GET global/workspace | Producto | Validado |
| Datos guardados al cotizar | Identificación/contacto reutilizados; cambiar cliente no hereda datos ajenos ni provoca consulta externa del ID guardado | Coordinador | Validado |
| Borrador de cotización Pro | Recuperación tras recarga/cierre, por cuenta, sin envío automático ni duplicar una cotización ya creada cuyo vínculo falló | Coordinador | Validado |
| Carga y disponibilidad claras | Selectores anuncian carga/sin coincidencias; horarios muestran inicio/final y eliminación accesible | Coordinador | Validado |
| Revisión independiente | Resolver hallazgos graves y documentar pendientes concretos | Confiabilidad | Revisado sin P0/P1; P2 corregidos |
| Validación y visual | Pruebas de consumidores afectados agrupadas, ES/EN móvil/escritorio, simulador real y comparación de datos originales | Coordinador | Validado localmente; observación nativa abajo |

Clientes ya tiene2 filtros útiles e Inventario3; se conservan. Archivo conserva
historial; cotizar no descuenta stock. Se reutiliza la evidencia previa compatible
(63 casos Pro, normalización y preservación) solo donde las entradas no cambien.
SQL/APIs compartidas nuevas requerirán verificadores aislados y regresión amplia
Pro una vez integradas, según la política de selección leída en main como
referencia, sin modificar aquel checkout.

## Dependencias y siguientes incrementos

No se declarará lista para cobrar/publicar por pasar pruebas locales. Los
adaptadores GTI/Tilopay y las condiciones multiemisor/sandbox siguen pendientes;
las rutas permanecen limitadas a desarrollo. No se emitirán comprobantes ni
cobros. La consulta preparada a GTI continúa sin enviar.

Incrementos posteriores a priorizar por utilidad/evidencia: registro explícito
atómico de materiales por trabajo, resumen operativo, abonos/saldos internos auditables, descuentos, combos y
equipo. Los dos últimos requieren diseño de inventario/permisos más amplio.
No se confunde cotización aceptada con ingreso cobrado. Una cita nocturna debe
analizarse para mostrarse en ambos días y los movimientos recientes primero;
no se cerrarán silenciosamente esos hallazgos.

## Evidencia

Cobertura acumulada de27 casos por tres motores (81 combinaciones): WebKit
móvil, Chromium escritorio y Chromium móvil. No hubo una única ronda81 verde:
se reutilizaron seis pases compatibles,64 de la reanudación y repeticiones
focales para resolver los11 fallos. La ronda focal18 terminó15 aprobados y tres
fallos del mismo locator de alerta del test; se corrigió sin quitar aserciones.
Los seis casos finales (agenda y cotizaciones en los tres motores) aprobaron.

Evidencia local:
- `/tmp/pro-autonomy-resume.log`:64 aprobados/11 fallidos investigados.
- `/tmp/pro-autonomy-final-focal.log`:15 aprobados/3 fallos del locator corregido.
- `/tmp/pro-autonomy-final-agenda-quote.log`:6 aprobados, incluido foco/reanudación
  manteniendo Próximas y búsqueda y paginación con503/reintento del mismo cursor.
- `/tmp/pro-autonomy-tsc-final.log`: TypeScript sin errores.
- `/tmp/pro-autonomy-lint-closure.log`: ESLint de componentes Pro, editor, APIs,
  librería y ocho specs afectados sin errores ni avisos.
- Verificadores PostgreSQL aislados de panel y catálogo aprobados; scripts de
  comparación final confirman documento/revisión exactos de las dos cuentas
  conservadas:11 trabajos,10 cotizaciones heredadas,50 disponibilidades,
 46 clientes,45 productos,10 movimientos; sin arrays normalizados en core.
- UTF-8, presupuesto bilingüe427/65 archivos, archivos privados y diffcheck
  aprobados. La página profesional conserva sus errores ESLint preexistentes
  comprobados contra HEAD, fuera del alcance; no se desactivaron reglas.

Revisión visual real en iPhone17Pro/iOS26.5, servidor local3185: cotizaciones con
un selector de estado, aviso de borrador reducido después de observarlo y Agenda
Día/Próximas con citas existentes. Capturas:
`/tmp/contratacr-pro-autonomia-cotizaciones-20261026.png`,
`/tmp/contratacr-pro-autonomia-borrador-20261026.png`,
`/tmp/contratacr-pro-autonomia-agenda-20261026.png`.

Observación pendiente específica: al volver a controlar el simulador mediante
CUA, algunas veces se observó Agenda de nuevo en Día tras haber abierto Próximas.
No se identificó la causa con evidencia suficiente para atribuirla a producto,
HMR o automatización. Revisión independiente no encontró un reset directo por
foco; los tres motores conservan modo/búsqueda tras focus+APP_RESUME_EVENT.
No se modificó seguridad para ocultar la observación. Antes de un lanzamiento
se requiere traza de ciclo nativo/access/MFA y prueba física dirigida; no repetir
los ensayos físicos históricos ni publicar paquetes por este motivo.

## Actividad observada durante implementación

- Los tres agentes auditaron producto, interfaz y confiabilidad. Dos implementaron
  archivos separados; el tercero revisó sin editar. Se corrigieron los hallazgos
  de reintento de selector, preservación de correo/teléfono, bucles del observador
  tras errores y disponibilidad nocturna en el segundo día.
- Se amplió operación diaria: Día/Próximas con búsqueda y páginas, cruces de
  medianoche/mes en Costa Rica, conservación de offsets originales al editar y
  movimientos recientes primero. Se agregaron seis specs (18 casos por motores).
- Focal Chromium móvil inicial: historial API156 pasó, pero compilación fría
  impidió montar ficha; borrador llegó a crear documento y su recuperación quedó
  interrumpida por HMR/chunk. En la repetición estable ambos recorridos pasaron;
  un caso de error de página de cotizaciones encontró un selector de prueba que
  incluía el anunciador global de Next, corregido al mensaje concreto sin quitar
  la aserción.
- Primera ronda amplia81: seis aprobados, tres fallos durante cargas lentas,
  integración interrumpida y71 no ejecutados. Se detuvo porque el servidor dev
  llevaba más de90 minutos y consumía varios GB con pausas de compilación/GC.
  Se reinició solo Pro y se precalentaron rutas sin sesión, conservando base,
  datos, límites de prueba y seguridad. Evidencia: `/tmp/pro-autonomy-regression`.
- Reanudación seleccionada:75 casos, reutilizando únicamente los seis aprobados
  con entradas equivalentes (WebKit business3, import2, historial1). Configuración
  temporal `/tmp/playwright-pro-autonomy-resume.config.ts`; sin cambios a CI.
  El reintento muestra APIs a decenas de ms y ya pasa el recorrido completo
  nuevo de Agenda y la regresión de catálogos. Terminó con64 aprobados y11 fallidos. Los fallos se investigaron: selector de correo opcional incorrecto (3), scroll no soportado por WebKit (1), navegación antes de finalizar redirección (1), locator ambiguo de movimientos (3), y error de registro seleccionado ocultado por carga de lista combinado con StrictMode (3). Este último es un defecto de producto corregido separando errores. Se repiten18 casos de los seis consumidores afectados en los tres motores, incluyendo exportación con revisión de vista obsoleta.
- PostgreSQL aislado de panel y catálogo y comparación exacta contra snapshots
  originales aprobados. TypeScript/ESLint focal y presupuesto bilingüe427
  aprobados antes de la ronda amplia. Se revalidarán archivos posteriores.


## Resultado y límites del candidato

Se completaron los criterios funcionales locales definidos arriba. Se añadieron
Día/Próximas, historial completo de cliente, recuperación de borradores y errores,
selección clara y movimientos recientes. El esquema normalizado conserva datos y
la compatibilidad de documentos heredados. Todo continúa local, sin commit,
push, despliegue, cobros, correos ni notificaciones reales.

El candidato sirve para revisión de operación cotidiana. No equivale a una Pro
comercial terminada: faltan integración fiscal/cobros, validación con
profesionales y los incrementos de negocio priorizados arriba. La observación
nativa queda explícita. GTI se usó como referencia de continuidad operativa y
jerarquía; no se copiaron sus menús ni se inventó capacidad fiscal.


Revisión posterior de facilidad de uso: [decisiones y evidencia](usability-review-local.md).
Calendario reemplaza el rótulo Día; importar/exportar pasan a acciones secundarias
y Por reponer queda dentro de Mostrar productos. No altera la evidencia histórica
de esta ejecución.

## Cola de continuidad: equivalencia funcional GTI con diseño ContrataCR

Actualización 26 octubre 2026 tras detalle editable. El usuario solicita continuar con tareas autónomas y ofrecer las funciones de GTI con diseño propio. La equivalencia es criterio de aceptación por flujo, no una afirmación actual de paridad. Se conserva la prohibición de emisión, cobros/envíos reales y push.

Orden de trabajo:
1. Cerrar interacción nativa del detalle editable y revisar defectos de usabilidad con auditoría independiente: interacción/descartar comprobados; guardado cubierto con cuentas descartables en WebKit y Chromium.
2. Contrastar en sesión GTI los flujos y campos reales de cliente, catálogo, documento directo y edición, incluidos errores/estados. Sesión abierta por el usuario en Safari, consultada sin guardar ni emitir; evidencia en la matriz de brechas. No pedir contraseñas ni alterar documentos reales. Registrar evidencia y límites por flujo.
3. Creación directa de borrador con cliente y líneas implementada localmente el 27 de octubre, sin trabajo/cotización ficticios. SQL y 15 recorridos dependientes aprobados; creación, guardado, búsqueda y reapertura nativa comprobados el 27 de octubre. Dos detalles observados en iOS corregidos y E2E directo3/3 aprobado. Evidencia en `direct-invoice-local.md`.
4. Preparar configuración reutilizable del emisor con copia por borrador, sin modificar documentos históricos al cambiar configuración. Requiere validaciones y pruebas de aislamiento.
5. Abordar catálogo CABYS oficial y reglas de impuestos solo con fuente verificable/actualización definida. No equiparar formato con validez ni inferir exención por un cero.

Cada incremento debe registrar criterio, cambios, pruebas seleccionadas, conservación y revisión visual. Facturación completa (documentos fiscales, proveedor, XML, recepción, notas, pagos aplicados y reportes) sigue abierta según la matriz GTI, sin asignar estados fiscales ficticios. No se activan ejecuciones programadas ni se promete trabajo fuera de una sesión activa.

### Citas solicitadas desde el perfil — 1 noviembre 2026

Se implementó el primer recorrido de cliente que vuelve: solicitud → confirmación o propuesta → aceptación → trabajo enlazado → cancelación/completado con historial. Incluye preferencia sin horario disponible y repetición revisable. La cuenta gratuita muestra Citas; Agenda Pro recibe solicitudes. Es local y no envía avisos reales. Ver alcance, límites y pruebas en [solicitudes de citas](appointment-requests-local.md). No equivale todavía a portal completo, recordatorios ni reprogramación de acuerdos confirmados.

### Ampliación internacional de investigación — 1 noviembre 2026

Se añadieron ServiceTitan, Houzz Pro, HoneyBook, Calendly, SimplyBook.me y Square al contraste previo. Prioridades propuestas: preparar/cerrar una visita, extras y cambios aprobados sobre una versión, y márgenes de agenda. Detalle, fuentes y evidencia/limitaciones en [comparación ampliada](research/2026-11-01/global-platforms-expanded.md). Son propuestas investigadas; no se contabilizan como funciones implementadas ni pruebas de demanda. La exploración nueva de SimplyBook fue un panel público de descripción, no una reserva dentro de una cuenta.

### Seis recorridos internacionales implementados — 1 noviembre 2026

Se añadieron preparación de visitas, márgenes/anticipación, complementos optativos de cotización, cambios comerciales aprobados, constancia con fotos privadas y el recorrido del cliente dentro de Citas. [Contrato, datos y validación](global-recommendations-local.md). Las funciones de la comparación ampliada ajenas a esos seis recorridos siguen como propuestas; esta entrega no certifica emisión fiscal ni paridad total con todas las plataformas.


## Actualización local — 2 noviembre 2026

Se corrigió el error de tipos de Empleos y se incorporó la reprogramación acordada de citas confirmadas. Conserva el mismo trabajo y el horario original hasta que el cliente acepte; no reescribe pagos, materiales ni borradores. El cambio directo de horas sigue protegido: se utiliza el flujo explícito con historial y nueva comprobación de disponibilidad. Alcance, pruebas y límites: [Empleos y reprogramación](reschedule-and-jobs-local.md). La emisión fiscal y los avisos reales siguen fuera de esta entrega.


## Actualización: recorrido manual de Proyectos comprobado

El 2026-11-04 se completó en Safari del simulador iPhone 17 Pro/iOS 26.5 el recorrido EN proyecto → cotización CRC10000 → aceptación por el cliente → cita de 120 minutos → trabajo Completed. Se verificaron una sola cotización y un trabajo vinculados, duración persistida, cero cargos/notificaciones nuevas y conservación exacta de 626 filas originales/78 tablas y tres proyectos anteriores. Se conservaron los fixtures registrados para revisión; no hubo cambios de aplicación ni push/producción. Esta evidencia reemplaza únicamente la limitación manual nativa anterior; no habilita publicación ni reclama validación fiscal. Detalle y capturas en [informe local](panel-state-and-project-simulator-local.md#prueba-manual-nativa-completada--2026-11-04).


## Actualización: claridad y recorrido español cerrados

Cotización aceptada/rechazada de proyecto muestra su estado en la tarjeta. Guardar una cita nueva desde cotización abre el trabajo guardado directamente. Recorrido manual español completo en el simulador y 19 resultados seleccionados aprobados con las entradas finales, conservación de 626 filas originales/78 tablas y tres proyectos anteriores. Los pendientes vigentes y los límites de publicación se consolidan en [el informe de claridad](project-clarity-local.md). Solo Pro local, sin push ni producción.

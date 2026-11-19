# Implementación local de recomendaciones internacionales

1 noviembre 2026. Rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Conservar todos los cambios previos; solo Pro local. Sin push, main/mobile, producción, emisiones fiscales, campañas o envíos reales.

## Contrato de esta entrega

Se implementan los seis recorridos de la última comparación, con los diseños y cuentas de ContrataCR. Las empresas tienen comportamientos distintos; se busca equivalencia de tareas concretas, no una copia idéntica de todas sus plataformas.

| Recorrido | Referencia funcional comprobada documentalmente | Implementación |
|---|---|---|
| Proponer extras/cambios al trabajo y registrar aceptación | Houzz Pro, cambios de alcance y diferencia sobre el acuerdo original | WorkChanges: propuesta inmutable, total anterior/nuevo, aceptación de cliente vinculado o registro explícito de autorización externa, historial y actualización del acuerdo sin duplicar pagos |
| Cotización base con complementos elegibles | Jobber, optional line items | QuoteChoices: snapshot de base, extras sin preselección obligatoria, selección/aceptación por versión y conversión con los elegidos |
| Información antes de la visita | SimplyBook.me, Intake Forms | VisitPreparation: hasta tres preguntas, servicio opcional, snapshot al solicitar, respuestas con historial, requisitos antes de confirmar |
| Márgenes y anticipación | Calendly, buffers/notice | Política de agenda: margen configurado y anticipación de reserva, misma exclusión de horarios y conflictos atómicos; no reescribir citas históricas |
| Constancia compartida del trabajo | Houzz Pro, daily logs/client dashboard | WorkDelivery: resumen/lista/recomendaciones, fotos privadas seleccionadas, vista como cliente, publicación versionada y constancia de recibido |
| Un recorrido del servicio para el cliente | HoneyBook, smart files y portales de servicios | Dentro de Citas se reúnen preparación, cotizaciones compartidas, acuerdo/saldo y constancia; cuenta gratuita y acceso por relación verificada |

Fuentes y límites de observación: [investigación ampliada](research/2026-11-01/global-platforms-expanded.md). No se afirma haber probado nuevas cuentas privadas de esas empresas. Las funciones clínicas, financiación, central telefónica, GPS permanente, lista de espera automática y reservas de recursos compartidos no forman parte de estos seis recorridos.

## Datos

Tablas separadas, consultas limitadas, RLS y funciones de servidor con actor vinculado a sesión. Ningún enlace por coincidencia de nombre/correo. Fotografías en almacenamiento privado; en la base solo metadata. Los documentos internos anteriores se conservan y una aprobación comercial no es emisión fiscal ni firma certificada. Las facturas existentes no se reescriben al aprobar cambios de un trabajo.

## Selección de pruebas

Entradas nuevas: cuatro grupos de SQL/model/API/UI, integración de Agenda/Citas/detalle de trabajo y controles de cotización configurada. Afecta permisos de participantes, concurrencia de agenda, acuerdos, conversión de cotización y almacenamiento privado. Por ello la cobertura se amplía a base aislada, nuevos recorridos E2E y consumidores de agenda/formularios/navegación/cotizaciones/facturación/cuentas.

Se reutiliza la evidencia previa de marca porque los headers, assets y fuentes no cambian en esta entrega. No se ejecuta una suite completa por cada corrección. Las correcciones que invaliden entradas se agrupan y se repite el caso afectado. Los tipos generados de Empleos tienen un error previo conocido; registrar resultado final sin ocultarlo ni borrar tipos para conseguir verde.

## Evidencia al cierre — 2 noviembre 2026

- SQL/modelos en cuatro bases PGlite aisladas: aprobados. Se cubrieron privacidad entre participantes, RLS/grants, concurrencia, requeridos, versiones, reintentos exactos, límites, actualización de acuerdos y preservación.
- Regresión principal: 24/24 aprobados, con Safari móvil emulado, Chrome móvil y Chrome de escritorio. Incluye los cuatro módulos nuevos, reservas anteriores, Citas y dos recorridos de navegación.
- Ajuste visual final de cambios comerciales: 3/3 aprobados en los mismos motores. Una propuesta con acuerdo desactualizado aparece marcada, no permite aceptar y conserva su historial. Se reutilizó la evidencia compatible de los demás recorridos.
- Consumidores financieros/formularios/MFA/costos/sesión: 10/10 aprobados en Chrome móvil. Incluyen factura directa, borradores, ficha integrada/materiales/abonos, agenda, formularios, no-Pro, costos, recuperación de sesión y denegación de los cuatro API nuevos antes de completar MFA.
- ESLint focal, textos UTF-8 y diff-check: aprobados. TypeScript global mantiene el error previo de `JobsPageContent` en el tipo generado de `/empleos`; no se borraron tipos ni se cambió esa sección para ocultarlo.
- SQL aplicado únicamente a Supabase loopback. Comparación inmediata antes/después de seis tablas originales (`pro_workspaces`, `pro_workspace_core`, `pro_clients`, `pro_work`, `pro_client_entries`, `pro_invoice_drafts`): idénticas. Comprobación final tras E2E de los propietarios originales en las seis tablas: idénticas.

Los fallos iniciales revelaron nombres accesibles implícitos que incluían el valor de campos y un selector de sidebar que no existe en móvil. Se corrigieron las etiquetas del producto y la selección del control real según plataforma, conservando las aserciones. Se añadieron protección de navegación, descarte explícito de borrador y recuperación de subida tras ACK perdido; ninguna prueba se convirtió en skip ni se relajaron permisos.

## Límites concretos

El alcance son los seis recorridos de la tabla. No es equivalencia íntegra con todos los productos de esas empresas ni certificación fiscal. Las aceptaciones digitales y constancias compartidas requieren una cuenta vinculada por relación verificada; no se vinculan contactos importados por nombre/correo. Para cambios autorizados fuera de la app existe registro explícito por el profesional, visible como tal.

Máximos de esta entrega: tres preguntas, veinte conceptos por cambio/lista de trabajo y seis fotografías por trabajo (hasta 3 MB de entrada, convertidas a JPEG privado de hasta 2 MB). Los valores originales y las versiones publicadas se conservan. No se envían recordatorios ni avisos push. La disponibilidad actual usa el endpoint nuevo; la lectura del endpoint de compatibilidad anterior no representa los márgenes nuevos, aunque su escritura sí los valida y devuelve conflicto claro.

Capturas de pruebas locales con datos ficticios, revisadas visualmente:

- [Complementos elegibles](research/2026-11-01/pro-quote-options-local.png)
- [Preparación e historial](research/2026-11-01/pro-visit-preparation-local.png)
- [Constancia y foto privada](research/2026-11-01/pro-work-report-local.png)
- [Acuerdo y cambios](research/2026-11-01/pro-work-change-local.png)

La evidencia móvil corresponde a navegador emulado sobre desarrollo local; no se compiló ni publicó un nuevo binario nativo. Esta entrega no modifica main/mobile ni los procesos de tiendas del otro chat.


## Actualización local — 2 noviembre 2026

Se corrigió el error de tipos de Empleos y se incorporó la reprogramación acordada de citas confirmadas. Conserva el mismo trabajo y el horario original hasta que el cliente acepte; no reescribe pagos, materiales ni borradores. El cambio directo de horas sigue protegido: se utiliza el flujo explícito con historial y nueva comprobación de disponibilidad. Alcance, pruebas y límites: [Empleos y reprogramación](reschedule-and-jobs-local.md). La emisión fiscal y los avisos reales siguen fuera de esta entrega.

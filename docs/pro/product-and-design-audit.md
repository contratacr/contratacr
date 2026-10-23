# Auditoría de Pro: diseño y utilidad

Fecha: 23 de octubre de 2026. Alcance: rama local/pro-suite-no-push. Revisión del código local y documentación pública oficial; no se probaron cuentas de pago de los competidores. Las recomendaciones son criterio de producto, no evidencia de que los usuarios ya las prefieran.

## Conclusión

Pro debe ampliar Mi panel con herramientas conectadas, manteniendo la identidad de ContrataCR. La implementación tiene una base funcional, pero aún no cumple por completo con el acabado de las secciones existentes. No debe considerarse lista para cobrar o publicar. Compartir colores y botones no equivale a compartir la misma experiencia.

## Inventario y comparación estética

| Sección nueva o ampliada | Qué existe localmente | Referencia existente en ContrataCR | Resultado y corrección necesaria |
| --- | --- | --- | --- |
| Agenda | Alta, edición, cancelación, finalización, validación de cruces, cliente y vínculo con cotización Pro anterior | Cotizaciones: cabecera, listado, editor y estados; Promociones: acciones y filtros | Parcial. Es una lista, no calendario. Quitar el marco adicional y los mensajes de desarrollo; mostrar Hoy/Próximas/Finalizadas/Canceladas y abrir el detalle al tocar. Acción principal Nueva cita. |
| Clientes | Nombre, correo, teléfono, notas, archivo y restauración | Cotizaciones y formularios del perfil: listas compactas, modal y campos compartidos | Parcial. Falta búsqueda y ficha con historial. Reutilizar entrada de teléfono, modal, estado vacío y menú de acciones. Evitar editar todo desde tarjetas con muchos botones. |
| Cotizaciones | Una entrada en Mi panel y editor existente; selección de cliente guardado y producto; cotizaciones anteriores preservadas | La propia sección Cotizaciones y su PDF/enlace público | Es la más integrada, pero incompleta. Hay dos fuentes de datos y dos formatos de tarjeta; no una lista realmente unificada y ordenada. Las nuevas cotizaciones normales aún no se conectan como las antiguas Pro a la agenda. Resolver esa continuidad antes de sumar funciones. |
| Inventario | Productos, SKU, existencias, mínimo, costo, precio e historial de entradas/salidas | Servicios para catálogo; Cotizaciones para lista y detalle | Parcial. El formulario de movimiento dentro de cada tarjeta recarga la pantalla. Lista compacta con búsqueda, filtro Existencias bajas y acción Registrar movimiento en detalle/modal. Separar Entrada/Salida en vez de exigir signos positivos/negativos. |
| Destaca en nuestras redes | Una solicitud mensual, revisión admin, motivo de rechazo y enlace de publicación registrada | Promociones para contenido/estados; solicitudes del panel para revisión | Parcial. Demasiado texto permanente y formulario aun con cupo utilizado. Mostrar disponibilidad del mes, una acción y el historial. Seleccionar perfil/publicación existente, previsualizar y explicar condiciones al solicitar. No publica automáticamente. |
| Administración Pro | Consultar UUID, activar/suspender membresía, caducidad, motivo y revisión social auditada | Gestión de cuentas y verificación del admin | Base técnica, no acabado final. Buscar por nombre/correo y confirmar cuenta elegida; evitar que el administrador tenga que copiar UUID. Mantenerla separada de las herramientas personales. |
| Exportaciones | Respaldo JSON y agenda CSV | Acciones secundarias de las secciones existentes | No constituyen una sección de reportes. Exportar los registros filtrados de cada sección; llamar CSV compatible con Excel a lo que es CSV. No repetir Agenda para Excel en Clientes/Inventario. |

Defectos transversales observados en el código: texto español fijo y fechas es-CR en los componentes nuevos sin integración completa con el idioma elegido; formularios y estados vacíos propios; encabezados genéricos; capas de tarjetas; acciones secundarias siempre visibles; falta de búsqueda/filtros y carga progresiva en listas del workspace. Deben utilizarse los componentes compartidos SectionHeadline, PanelEmptyState, PanelListSkeleton, StatusFilterTabs y CardActionsMenu donde corresponda. Mantener la política existente: 20 elementos por lote y skeleton completo solo cuando la espera lo amerita; no fingir paginación si se sigue descargando todo el documento.

## Comparación funcional con tres productos

Se eligieron Jobber, Housecall Pro y Workiz porque atienden negocios que prestan servicios. Son referencias de flujos, no plantillas para copiar ni equivalentes fiscales costarricenses.

| Área | Jobber | Housecall Pro | Workiz | Decisión para ContrataCR |
| --- | --- | --- | --- | --- |
| Agenda | Visitas únicas/recurrentes, agenda y asignación | Calendario con trabajos, presupuestos y eventos | Calendario y asignación por disponibilidad | Empezar por agenda diaria/semanal y cita vinculada a cliente. Reprogramar sin volver a digitar. Posponer rutas y cuadrillas hasta validar demanda. |
| Clientes | Perfil con contacto, propiedades e historial de trabajos/comunicaciones | Clientes conectados con trabajos, presupuestos y facturas | Ficha con trabajos, archivos y pagos pendientes | Una ficha que reúna citas, cotizaciones y notas, con Crear cotización/Agendar. Evitar cinco listas aisladas. |
| Cotizaciones | Aprobación y conversión de cotización a trabajo | Presupuestos y propuestas conectados al trabajo | Estimados/propuestas y opciones para el cliente | Mantener el editor existente, una sola lista y un solo detalle. Añadir Agendar desde aceptada, conservando cliente y servicio. Aceptación interna no debe aparentar firma del cliente. |
| Inventario | Catálogo de productos/servicios; no se verificó un inventario nativo equivalente al nuestro | Catálogo de materiales, seguimiento de materiales y una integración con Ply para inventario | Inventario, alertas de existencias bajas y reportes de actividad | Nuestro control básico sí tiene utilidad. Separar material de servicio, explicar unidades y movimientos. Cotizar no debe descontar stock; el consumo se registra al ejecutar el trabajo. |
| Difusión | Herramientas de comunicación/marketing, no se verificó difusión mensual en las redes de Jobber | Marketing por correo, SMS, postales y reseñas | Herramientas de marketing y atribución | Nuestro beneficio es distinto: difusión editorial de ContrataCR con revisión humana. No afirmar que las tres empresas ofrecen lo mismo ni prometer clientes. |
| Reportes | Gestión integrada y seguimiento del negocio | Reporting reúne indicadores y reportes personalizables | Paneles y reportes personalizados | Medir citas realizadas, cotizaciones enviadas/aceptadas y consumo. Separar estimado, aceptado, cobrado: una cotización aceptada no es ingreso cobrado. |
| Pagos/facturación | Herramientas comerciales de su mercado | Herramientas comerciales de su mercado | Herramientas comerciales de su mercado | No son prueba de cumplimiento con Hacienda. Tilopay y GTI siguen como integraciones pendientes; no presentar un documento de cotización como factura electrónica. |

Fuentes oficiales:
- Jobber: [funciones y gestión de clientes](https://www.getjobber.com/features/), [cotizaciones y conversión a trabajos](https://help.getjobber.com/en/articles/quote-basics/).
- Housecall Pro: [navegación y relación entre módulos](https://help.housecallpro.com/en/articles/6934643-navigating-housecall-pro), [programación](https://help.housecallpro.com/en/articles/6758788-scheduling-jobs-and-estimates), [materiales](https://help.housecallpro.com/en/articles/5456326-price-book-materials-guide), [seguimiento de materiales](https://help.housecallpro.com/en/articles/7119757-material-inventory-detail-tracking), [integración Ply](https://help.housecallpro.com/en/articles/10431432-ply-inventory-management-integration-overview).
- Workiz: [funciones oficiales](https://www.workiz.com/features/).

## Orden recomendado

1. Consistencia: estructura visual compartida, traducciones ES/EN, estados de carga/vacío/error, una acción principal y acciones secundarias en menú. Eliminar avisos de desarrollo del cuerpo; conservar las limitaciones explicadas en el entorno local de prueba.
2. Continuidad: una experiencia de cotizaciones; cliente → cotización → cita sin duplicar datos, preservando documentos y referencias. Diseñar la migración de las dos fuentes antes de retirar cualquier registro.
3. Operación diaria: búsqueda de clientes/materiales, filtros de agenda/estado, fechas claras y movimientos de stock comprensibles. No cargar indefinidamente todas las filas en un JSON para simular escalabilidad.
4. Difusión mensual: elegir contenido propio, previsualizar solicitud, ver cupo y resolución. Admin identifica usuario sin UUID y mantiene auditoría.
5. Reportes y exportación por módulo. Después, evaluar recordatorios, recurrencia, pagos y factura electrónica. No bloquear la utilidad inicial con un ERP completo.

## Criterios para dar cada sección por terminada

- Mismos espacios, tipografía, botones, formularios, estados y navegación que su sección de referencia, comprobados en escritorio y móvil.
- Español e inglés completos; nombres largos y texto ampliado sin recortes de información esencial.
- Realizar la tarea principal sin volver a escribir datos ya guardados; mensajes claros al guardar, fallar o recibir un conflicto.
- Sin perder el formulario al volver del bloqueo o de otra sección; probar recuperación y sesión.
- Datos privados aislados entre cuentas; cliente sin perfil profesional no recibe Pro; admin conserva MFA y acceso completo.
- Pruebas de creación, edición, archivo/cancelación, búsquedas, límites, doble envío, aislamiento y recorrido entre módulos.
- Revisión de utilidad con profesionales: encontrar una cita, cotizar a cliente existente, registrar consumo y solicitar difusión sin ayuda. Medir finalización, errores y campos repetidos; no afirmar preferencia de usuarios antes de observarla.

Esta ronda documenta diferencias y prioridades. No cambia la interfaz, no ejecuta una nueva suite, no activa cobros ni publica código o contenido en redes.

## Aplicación local posterior a la auditoría

Se aplicó la estructura compartida a Agenda, Clientes e Inventario, con ventanas de edición/detalle, acciones secundarias en menú, búsqueda, filtros y exportación de la vista. Agenda tiene lista semanal, no una cuadrícula con arrastre. Se quitaron los marcos y mensajes de desarrollo del cuerpo de estas secciones.

Cotizaciones Pro usa una sola lista visual para registros anteriores y documentos normales. Los nuevos documentos conservan el editor/PDF existente y se vinculan mediante IDs al cliente guardado. Desde una aceptada se agenda con ese cliente; el servidor comprueba propietario, vínculo y estado real. Un reintento de vinculación conserva la cotización ya creada. No se borraron ni migraron destructivamente registros anteriores.

La solicitud de difusión muestra disponibilidad mensual y revisión previa; el admin puede buscar cuentas por nombre/correo. No se ha publicado contenido ni activado cobros.

Límites que siguen siendo preparación para una fase posterior: el workspace continúa almacenado como documento JSON con control de revisión; los bloques de 20 reducen elementos renderizados, pero no son paginación de filas en Supabase. Las cotizaciones anteriores siguen en su almacenamiento original. No afirmar que ya se normalizó la base de datos, que existe calendario arrastrable, reportes contables, recordatorios automáticos, pagos o facturación electrónica.

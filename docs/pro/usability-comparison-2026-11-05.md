# Simplificación de Pro y referencias externas

Revisión local, 5 de noviembre de 2026. Investigación documental de fuentes oficiales; no se abrieron cuentas ni se operaron documentos de otras empresas. Esto no certifica equivalencia completa ni rentabilidad comercial.

## Criterio aplicado

Conservar el contenedor, cabecera y controles compartidos del panel existente; no crear secciones para cada función. Acción principal arriba, filtros de vista/estado después, búsqueda debajo, registros al final. Las acciones secundarias usan el menú existente. La flecha resuelve el regreso por el historial de Pro: se elimina el botón «Volver a herramientas» duplicado.

En proveedores, «Mostrar proveedores: Activos / Archivados» expresa dos listas excluyentes. El checkbox anterior sugería incluir archivados junto con activos, pero la API realmente devolvía una sola lista. Se mantienen parámetros, consulta paginada y datos históricos.

Notificaciones: comparación de `landing-navbar.tsx` entre main (solo lectura) y Pro. Ambas versiones usan `NotificationBell`: web muestra campana en las listas, la oculta en pasos internos y menús de ficha; el shell nativo no añade campana a las secciones y usa navegación inferior. Safari del simulador es una superficie web, no una compilación nativa. La prueba de navegación compara las listas originales y nuevas; no certifica entrega push ni un binario de tiendas.

## Qué aprender sin duplicar lo existente

| Referencia oficial | Valor para ContrataCR | Estado local / decisión |
| --- | --- | --- |
| [Jobber: solicitudes](https://help.getjobber.com/en/articles/request-basics/) | Reutilizar la solicitud al preparar cotización y trabajo. | Ya existe el recorrido; se prueba con cliente, cotización y trabajo enlazados, sin crear un nuevo módulo. |
| [Jobber: aprobar y pedir cambios](https://help.getjobber.com/en/articles/quote-approvals/) | Pedir un ajuste sin rechazar toda la cotización. | Candidato para una siguiente implementación delimitada; requiere historial de versiones y confirmación de ambas partes, no basta añadir un botón. No implementado en esta revisión. |
| [Housecall Pro: ficha del cliente](https://help.housecallpro.com/en/articles/9764383-customer-profile-overview) | Acceso a datos y notas en el contexto del cliente. | `client-history`, `client-operations` y notas del cliente ya cubren parte importante. Priorizar claridad de esa ficha antes de otro CRM. |
| [Workiz: historial centralizado](https://www.workiz.com/features/client-crm/) | Un cliente reúne trabajos, presupuestos y documentos. | Ya hay ficha y saldos enlazados; evitar otra sección que repita esos datos. Fotografías por trabajo son una posibilidad pendiente de evaluar frente a Casos de éxito existentes. |
| [Taskrabbit: favoritos](https://www.taskrabbit.com/blog/favoriting-a-tasker/) | Facilitar volver a contratar a alguien conocido. | Ya hay Favoritos y Volver a contratar; revisar ese recorrido antes de añadir otro botón o sistema de fidelidad. |
| [GetNinjas: solicitar servicio](https://www.getninjas.com.br/central-de-ajuda/cliente/pedidos-sou-cliente/como-fazer-um-pedido) | Solicitudes cortas con los detalles necesarios. | Proyectos y preparación de visitas ya existen; reutilizar sus preguntas y datos, sin formularios paralelos. |

Las prioridades anteriores son una inferencia de adecuación a ContrataCR, no una afirmación de que los usuarios locales hayan validado cada idea. No se copian precios, monedas por contacto, financiación ni automatismos de envío.

## Cobertura de esta entrega

Clientes, catálogo, agenda, cotizaciones, gastos/proveedores, pagos y borradores opcionales se revisan con pruebas locales de creación, edición, navegación y conservación, según sus consumidores afectados. Los datos añadidos por los E2E pertenecen a cuentas desechables autorizadas de prueba; la limpieza no elimina los registros originales ni los ejemplos manuales conservados. Evidencia y resultados exactos en `panel-layout-consistency-local.md`.

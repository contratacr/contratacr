# Borradores directos de factura — Pro local

27 octubre 2026. Rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Conservar trabajo local previo, sin ramas/worktrees, push, emisión, cobros, mensajes, producción ni cambios main/mobile.

## Alcance y selección previa de pruebas

Referencia: formulario GTI consultado en la sesión autorizada, documentado en `billing-gti-gap-review-local.md`: elegir receptor y líneas sin obligar cotización/trabajo. Se reutiliza el editor comercial de detalle y el selector paginado de clientes/productos, con diseño ContrataCR; no se declara paridad fiscal.

Cambian creación/persistencia/lectura de borradores y entrada de Facturación. Selección: ampliar verificador SQL aislado por nueva clase de origen, idempotencia, atomicidad, propiedad/RLS, restricciones y compatibilidad; E2E nuevo de creación directa/recarga/edición/búsqueda y preservación; consumidores de Facturación, borradores, preparación y detalle en Chromium escritorio/móvil y WebKit móvil agrupados. ESLint focal, TypeScript de fuentes, UTF-8/diff y snapshots originales. Reutilizar cálculos exactos, almacenamiento operativo y marca sin cambios; sin suite global ni paquetes móviles. Comprobar manualmente simulador con datos descartables o modificaciones no guardadas sobre el ejemplo existente.

## Criterios

- Acción «Nuevo borrador» desde Facturación; cliente guardado con búsqueda/páginas, productos guardados o servicios manuales.
- Guardado explícito y atómico; no crear trabajo/cotización, deuda, pago ni salida de inventario.
- Copiar receptor y detalle para que cambios posteriores del catálogo no reescriban históricos.
- Repetir una petición no duplica; cancelar o fallar no deja cabeceras vacías.
- Recargar y editar el borrador guardado por el editor habitual; conservar rutas, búsqueda, propietario y borradores previos.
- No ofrecer «restaurar origen» ni avisar que falta un origen que nunca existió.

Resultados y límites se anotarán al terminar.

## Implementación

La cabecera admite `source_kind=direct`, con ID de solicitud UUID como ID de borrador y source_id técnico. Una restricción prohíbe trabajo/cotización, acuerdos/abonos/saldos operativos y materiales de origen en esta clase. No se crea ningún registro operativo ficticio. No se reescriben las cabeceras anteriores. El nuevo SQL local es aditivo y reinstalable.

El guardado de servidor bloquea por propietario, exige cliente propio activo y productos propios activos al crear, copia contacto/identificación/dirección desde cliente y delega líneas/totales al cálculo decimal ya existente dentro de la misma transacción. Una línea inválida revierte también la cabecera. El UUID estable y la huella del contenido permiten repetir una creación idéntica sin duplicar ni sobrescribir un borrador editado después; un contenido distinto para esa solicitud se rechaza. Las funciones son solo service_role; las rutas siguen autenticación, permiso Pro y desarrollo local existentes. La lectura por dueño suprime avisos de origen inexistente en directos; refresh/reset de origen se rechazan.

Facturación ofrece «Nuevo borrador». El formulario usa selectores paginados de cliente/productos y el mismo editor de servicios, cantidades, precios, descuentos, IVA y CABYS. Se guardan cliente, concepto y líneas explícitamente; después abre el editor habitual para receptor, condiciones y futuras correcciones. Cerrar regresa a Facturación conservando búsqueda. Búsqueda/listado existentes encuentran el borrador por receptor/cliente/concepto sin descargar workspace.

## Revisión independiente

El agente invoice_usability_review revisó SQL, API y creación. Encontró un P2: tras una respuesta perdida podían introducirse nuevas correcciones y perderse al recuperar la primera versión guardada. Se corrigió reteniendo petición/UUID inmutables, bloqueando campos/salida mientras se desconoce el resultado y ofreciendo comprobar o reintentar la misma solicitud. Un GET404 tras incertidumbre no habilita otra creación: reintentar permite resolver una transacción todavía pendiente sin duplicación. Rechazos explícitos400/401/403 más GET404 permiten corregir. Revisión posterior sin otro defecto concreto por lectura.

## Evidencia inicial

SQL aislado completo ampliado PASS (`/tmp/pro-direct-db.log`): creación, reintento idéntico y distinto, rollback sin cabeceras vacías, cliente archivado/ajeno, producto ajeno, datos copiados, edición/revisión, búsqueda, reinstalación, funciones denegadas, RLS y cascada del propietario, junto a pruebas previas de cálculo/preparación/materiales/saldos. Instalación guardada solo en Supabase loopback PASS (`/tmp/pro-direct-prepare.log`).

E2E directo focal Chromium móvil PASS (15,5s): cliente/producto fuera de la primera página encontrados por búsqueda, producto y servicio en una factura, IVA/cantidades decimales, respuesta perdida después de commit, bloqueo de edición y recuperación, reintento sin duplicar, recarga, edición del receptor/concepto/detalle, búsqueda y salida/cancelación. Workspace/revisión/entradas operativas permanecen iguales; cuenta sin trabajos ni cotizaciones antes y después. Los fixtures se crean y retiran solo en cuentas descartables loopback.

ESLint focal y TypeScript de fuentes PASS; UTF-8/diff PASS. Se mantiene evidencia compatible de cálculo exacto (`/tmp/pro-direct-math.log`). La evidencia no certifica emisión fiscal, catálogo CABYS oficial ni toda la aplicación.

## Cierre de pruebas

Tanda agrupada final: **15/15 aprobadas**, cinco escenarios (factura directa, listado/búsqueda de Facturación, detalle editable, borradores desde origen y preparación) por WebKit móvil y Chromium móvil/escritorio; `/tmp/pro-direct-regression.log`. Sin repeticiones para obtener verde en esta tanda. Focal previo 1/1 aprobado. No suite global.

Los verificadores privados de documentos/revisiones, registros normalizados, entradas operativas y todas las tablas de borradores originales terminaron PASS. Se conservaron los datos y el trabajo previo, y el HEAD/rama permanecen iguales. No se ha hecho push ni emisión real.

Simulador: iPhone 17 Pro/iOS26.5 sigue arrancado con Pro local, pero el control de interacción devolvió `Computer Use server error -10005: noWindowsAvailable` en dos intentos con binding renovado. La captura solo muestra el borrador previo; no prueba el nuevo flujo. Se solicitó dejar el Mac desbloqueado y la ventana visible; pendiente respuesta y recorrido manual de factura directa. No se declara prueba nativa aprobada. La cobertura WebKit móvil automatizada sí ejecutó la creación/recuperación/edición completas.

## Simulador completado — 27 octubre 2026

Tras el aviso del usuario, el control nativo volvió a funcionar. En iPhone17Pro/iOS26.5 y servidor Pro loopback se abrió Facturación→Nuevo borrador, se eligió «María · Cliente de ejemplo», se añadió producto guardado «Pintura blanca · ejemplo», se cambió su cantidad/precio a 2×100 y se añadió servicio manual 2×80. Se guardó explícitamente el borrador de prueba «Prueba simulador directa 20261027»: total CRC360, dos líneas, sin trabajo/cotización, abonos/saldos nulos, sin movimiento operativo. Se volvió al listado, se buscó «Prueba simulador» y se reabrió con el mismo concepto/total. Captura del borrador guardado: `/tmp/contratacr-pro-factura-directa-guardada-20261027.png`. CABYS/IVA quedaron pendientes en este ejemplo comercial, sin afirmación fiscal.

Hallazgos nativos corregidos:
- iOS autocorregía «directa» en el concepto. Se desactivaron autocorrección, capitalización y spellcheck en concepto/notas; se repitió la escritura y quedó exacta. Durante HMR hubo recarga del WebView: se repitió el formulario con código estable antes de guardar.
- El editor principal mostraba «Importe del origen guardado: ₡0» para directos. Se limita ese texto a borradores que sí tienen origen; se comprobó visualmente el resumen corregido y se añadió aserción al E2E directo.

Después de ambos cambios: E2E directo en tres perfiles **3/3 PASS** (`/tmp/pro-direct-native-final.log`,44,9s); ESLint y TypeScript de fuentes PASS (`/tmp/pro-direct-native-lint.log`, `/tmp/pro-direct-native-types.log`). Se reutilizan los otros consumidores de la tanda15 previa: el cambio de texto solo excluye la clase direct y los atributos se limitan al formulario nuevo, sin cambios monetarios, API, SQL, rutas ni marca.

La prueba guardada se identificó por ID nuevo ausente de la baseline privada, propietario/cliente ficticio exactos, título, clase direct y fecha de creación; se verificó antes de retirarla. Se eliminó únicamente ese fixture nuevo, con cascada de sus líneas. Todos los borradores anteriores se compararon exactamente y los cuatro verificadores privados de datos originales terminaron PASS. No se borró ni modificó ningún dato previo. El control volvió a reportar noWindowsAvailable al cerrar el modal después de la reapertura; se reinició solo la app temporal para retirar la vista de ese fixture ya eliminado. No impidió la comprobación anterior de creación/guardado/búsqueda/reapertura.

Se resuelve la prueba nativa pendiente. Sin push, comprobantes reales, mensajes ni cambios main/mobile.

# Panel y disposición coherente de las secciones (local)

Fecha: 4–5 de noviembre de 2026. Checkout exclusivo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo local anterior. Sin cambios en main/mobile, publicación, push, envíos ni emisión fiscal.

## Resultado

- La tarjeta de identidad vuelve a aparecer en el inicio móvil: nombre, verificación cuando corresponde, Ver perfil y Compartir. Se conserva «Mi panel». La cuenta ficticia del simulador tiene verificación pendiente y no muestra una insignia falsa.
- El menú Pro conserva Proyectos, Empleos, Promociones, fotos, servicios y las demás entradas habituales, además de las herramientas nuevas. Facturación sigue fuera del menú principal, como herramienta opcional.
- Las secciones nuevas usan el `Card`/`CardContent` exterior del panel igual que las secciones originales. Gastos elimina el título y padding internos redundantes.
- Orden común: acción principal, filtros de vista/estado, búsqueda y registros. Clientes, Catálogo, Cotizaciones, Gastos/Proveedores y Pagos respetan ese orden; Agenda conserva su calendario y búsqueda en Próximas. No se fuerza un buscador donde no cumple una función.
- «Volver a herramientas» se elimina; la flecha usa el historial existente. En escritorio permanece la navegación lateral. Se prueba el regreso desde cada herramienta.
- Proveedores cambia el checkbox por «Mostrar proveedores: Activos / Archivados», fiel a las dos listas excluyentes que ya devuelve la API. El vacío de archivados dice que no hay archivados, no invita a crear un proveedor como si no existiera ninguno activo.
- Cotizaciones coloca Plantillas y paquetes en el menú de opciones junto a Nueva cotización. Borradores conserva Nuevo borrador y su menú en una sola fila, con la acción principal ancha en móvil.
- Agenda compacta únicamente la bandeja realmente vacía de solicitudes, conservando Actualizar. Con solicitudes, filtros activos, errores o un detalle abierto, mantiene la funcionalidad completa. Cliente no cambia su presentación.
- Se omite el contador de registros cargados en Clientes y las listas compartidas, en español e inglés. La paginación y «Ver más» se conservan.

La referencia es el código de main leído sin modificarlo; no se certifica la aplicación pública desplegada. Las nuevas secciones mantienen sus funciones, datos, paginación, formularios e historial específicos.

## Cabecera y notificaciones

Se comparó `landing-navbar.tsx` en main y Pro: reutilizan `NotificationBell` y las mismas condiciones web/nativas. Las listas web muestran campana; los pasos internos y menús de ficha tienen reglas propias. El shell nativo no añade campana a cada sección: usa la navegación inferior. Safari en el simulador muestra la versión web. No se debe tratar esa captura como prueba de un binario nativo o de entrega push.

La regresión compara cabecera y campana en Proyectos, Empleos, Promociones, Agenda, Clientes, Cotizaciones, Catálogo, Gastos, Pagos y Facturación; verifica también ausencia de desbordamiento. Las capturas esperan acciones habilitadas y registros reales de fixture antes de considerarse evidencia visual de las listas.

## Selección y límites de pruebas

Impacto: presentación del panel, navegación, selector compartido y consumidores de Agenda/Catálogo/Cotizaciones/Gastos/Ventas. Sin cambios de esquema, RLS, permisos o API. Se seleccionan panel/cache/guardas y navegación en los tres perfiles, marca según AGENTS.md, formularios, Gastos ES/EN, Ventas, factura directa y recorrido solicitud→cotización→trabajo. No se ejecuta una suite exhaustiva por cada cambio.

Se reutilizan las pruebas funcionales de formularios, pagos y datos cuyo código no cambió con los últimos ajustes de texto/presentación. Se repiten navegación y los consumidores de la bandeja compacta de Agenda. Tipos, lint focal, contrato de marca y diff completan la revisión.

Los fallos iniciales se conservan en los logs: compilación fría superó los tiempos de navegación/marca; hubo carga de chunk y verificación de sesión interrumpidas durante desarrollo. La fixture de profesional sin Pro de Ventas se completa con su capacidad profesional real, manteniendo la comprobación de acceso denegado a Pro. El test del panel ahora espera la consulta de seguimiento que empieza cuatro segundos después de cargar el documento, antes de navegar de nuevo; conserva todas las aserciones sobre errores y datos. Se corrigió también la espera visual del producto para incluir su SKU real. No se eliminaron aserciones para obtener verde.

Evidencia nativa y hashes: `research/2026-11-05/panel-layout/`. Las capturas iniciales en `/tmp/pro-panel-layout-evidence` anteriores al último cambio de orden son históricas, no el diseño final. La investigación y las funciones candidatas —sin afirmar que ya estén implementadas— están en `usability-comparison-2026-11-05.md`.

## Resultados

Pruebas focales completadas en varias ejecuciones; no es una suite exhaustiva ni una única corrida sin fallos:

| Evidencia | Resultado final compatible |
| --- | --- |
| `/tmp/pro-panel-layout-tests.log` | Gastos ES/EN, formularios y los tres recorridos de servicio: 12 casos funcionales verdes en ambos móviles. Los 2 fallos de Ventas se resolvieron con la fixture profesional completa; la navegación inicial se sustituyó por las repeticiones siguientes. |
| `/tmp/pro-sales-diagnostic.log`, `/tmp/pro-panel-layout-final-chromium.log` | Ventas: 1 WebKit y 1 Chromium móvil verdes; factura directa Chromium y navegación móvil también verdes en esta segunda corrida. |
| `/tmp/pro-panel-layout-final-wk.log` | Factura directa WebKit verde. Los fallos de marca y del panel ES se sustituyen por la evidencia final siguiente. |
| `/tmp/pro-panel-layout-navigation-complete.log` | Navegación, flecha, menús y cabeceras: WebKit móvil y Chromium móvil verdes. El fallo transitorio de carga de escritorio no se oculta: se repitió aisladamente. |
| `/tmp/pro-panel-layout-desktop-recheck.log` | 2/2: navegación y recorrido completo de servicio en Chromium escritorio. |
| `/tmp/pro-panel-layout-ready.log` | Recorrido de servicio con bandeja compacta: WebKit móvil y Chromium móvil verdes. Fallos de las esperas visuales corregidos en la navegación final, no aceptados como verde. |
| `/tmp/pro-panel-layout-header-final.log` | Panel/cache/guardas: español e inglés en WebKit verdes, con espera de seguimiento corregida. Los 4 casos de panel en Chromium de la corrida inicial son compatibles: no se cambió su lógica de caché/guardas después; la presentación nueva se cubre con navegación en ambos perfiles. |
| `/tmp/pro-panel-layout-brand-complete.log` | Marca WebKit verde (1,2 min). Se usa límite CLI de 180 s por compilación local de seis rutas; las aserciones de marca permanecen intactas. Chromium móvil y escritorio ya aprobaron en `/tmp/pro-panel-restore-tests.log`, con los mismos componentes y recursos de marca. |

Tipos y lint focal: salida 0. Contrato estático de wordmark y `git diff --check`: aprobados.

Conservación: 78 tablas y 626 filas originales idénticas; 46 filas operativas registradas de ejemplos previos/manuales conservadas; ningún otro extra operativo. Los proyectos originales se verifican adicionalmente con los comparadores ES/EN: cotizaciones aceptadas, trabajos finalizados, contenidos, saldos y notificaciones intactos. La auditoría local conserva eventos anonimizados de las cuentas desechables, no registros operativos nuevos ajenos a los ejemplos permitidos.

Los logs finales y comparadores se guardan junto a las capturas y hashes en `research/2026-11-05/panel-layout/`. Los fallos iniciales siguen disponibles en `/tmp`; no se afirma validación nativa, despliegue público ni emisión fiscal.

- «Limpiar filtros» se muestra solo con búsqueda no vacía (sin contar espacios) o un filtro distinto del predeterminado. La misma regla se aplica a Cotizaciones.

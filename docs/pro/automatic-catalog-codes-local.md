# Códigos de catálogo sin paso obligatorio

Base/HEAD: local/pro-suite-no-push, 06b70019. Todos los cambios previos permanecen. Solo entorno local, sin push ni producción.

## Cambio y dependencias

El formulario de producto/servicio pide nombre y precio. Código queda opcional dentro de Datos del catálogo. Al crear sin código se deriva P-/S- y 12 caracteres del UUID del registro. Se conserva el requisito interno de código no vacío y el índice de unicidad de la base; una colisión no puede sobrescribir otro registro. Al editar sin código se conserva el código anterior; los códigos introducidos expresamente se respetan. No cambia API, esquema, RLS, migraciones ni CSV.

Consumidores: catálogo paginado, edición y archivo, servicios sin stock, importación, cotizaciones y borradores de factura (compatibilidad, sin emisión). El código no exige descargar el catálogo completo.

## Selección de pruebas

- pro-forms-ux: creación mínima con código automático para producto, fechas/duración y cotización.
- pro-project-card-style ES/EN: jerarquía y campos opcionales, código anterior preservado al cancelar, guardias de cambios y stock.
- pro-catalog-item-types: servicio automático, aislamiento de existencias, copias de catálogo en cotización/factura e historial preservado.
- TypeScript, lint focal y diff-check.

Se reutiliza evidencia de importación CSV de la ronda3: su código/schema/columnas/parser no cambian. No se presenta esta selección como regresión exhaustiva de Pro. Se revisarán resultados antes de cerrar la ronda.

## Ronda conjunta

La creación de proveedor desde gasto se valida junto al catálogo, con pro-expenses ES/EN y sus casos de respuesta perdida; API/esquema sin cambios. La recuperación persistente de operaciones tiene pruebas propias de identidad, permisos y ausencia de envío automático. Para el recorrido crítico se selecciona pro-service-journey y pro-project-journey (solicitud/proyecto, cotización, aceptación y cierre), reutilizando la evidencia compatible previa de citas y disponibilidad. No se inicia otra ejecución equivalente en paralelo. Las ediciones se congelan antes de la corrida final para evitar recargas HMR durante los formularios.

Primera ejecución /tmp/pro-auto-code.log: formulario mínimo y tarjetas EN aprobados; dos fallos de estado durante navegación/búsqueda en una ejecución con recargas completas HMR (catálogo copia en borrador y tarjetas ES). No se debilitan aserciones ni se atribuye causalidad sin reproducir con código congelado. El ajuste inicial de tipado del código conservado ya se corrigió y TypeScript pasó.

## Revisión manual de esta ronda

Simulator iPhone17 Pro/Safari: formulario de producto en ES, nombre temporal→Cancelar→Descartar vuelve a lista vacía sin guardar; no se solicitó código. En EN se abrió New product or service, se desplegó Catalog details, Tab enfocó Code sin asterisco obligatorio y Cancel volvió a lista sin guardar. Idiomas y acciones revisados realmente mediante control visual. Esta prueba no sustituye la de generación de código al guardar con fixtures automatizadas.

Hallazgo adicional visible en EN: categoría reunía campo libre, explicación, selector de guardados, búsqueda y estado vacío en un mismo bloque. Se simplifica OrganizationSelect bajo demanda manteniendo grupos/categorías, nombres históricos y datos actuales. Se añade prueba focal de ambos consumidores y ES/EN; no cambia API ni gestión de archivados.

## Resultado final

- `/tmp/pro-next-round.log`: 14/16 aprobados (9.9 min). Incluye gastos ES/EN, organizaciones con cuatro combinaciones de consumidor/idioma, formularios, tarjetas ES/EN, proyectos ES/EN, solicitudes/cotización/trabajo y menú Herramientas/perfil ES/EN.
- Catálogo: el trace del fallo inicial muestra recuperación de sesión al agotarse su chequeo de 8 s durante recompilación, idioma ES correcto; no se alteró ese chequeo. Fixtures de catálogo/proyecto/servicio se normalizaron a rol profesional coherente en perfil y metadata. `/tmp/pro-next-round-retest.log`: catálogo aprobado, con código automático, código anterior conservado al vaciar, código personalizado y reutilización en cotización/borrador.
- Operaciones: fixture de la segunda cuenta carecía de fila professionals; se completó únicamente la cuenta desechable. La repetición alcanzó recuperación confirmed y falló por preferencia EN retenida al esperar ES. Se fijó NEXT_LOCALE=es en esa transición del test, conservando todas las aserciones. `/tmp/pro-recovery-final.log`: 1/1 aprobado (35.9 s).
- Resultado agregado: los 16 casos seleccionados aprobados. La evidencia conserva los fallos iniciales y las repeticiones; no es una suite exhaustiva de toda la app.
- Persistencia de operaciones en el mismo navegador/dispositivo: cuerpo exacto validado, cuenta/cliente separados, sin POST automático, no se escribe si no puede conservarse la recuperación, fase confirmed solo recupera lectura. Borrar datos del navegador elimina esta recuperación local.
- Proveedores: creación dentro del gasto; validación del gasto antes de crear proveedor; respuestas perdidas no duplican proveedor/gasto; importes, fechas, historial y datos originales conservados.
- Simulador EN de gasto: alternar guardado/nuevo conservó descripción y nombre ficticio. No se pulsó Guardar; lista final sin gastos. Una recarga del entorno interrumpió la primera salida, por lo que no se presenta esa salida como prueba manual del diálogo de descarte. La cobertura automatizada ES/EN sí pasó.

Solo Pro, sin push, commits, ramas nuevas, producción ni emisión/envíos reales. HEAD permanece 06b70019.

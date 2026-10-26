# Selección de pruebas y reutilización de evidencia

Vigente desde el 26 de octubre de 2026. Esta política obliga a justificar las
ejecuciones manuales y el trabajo de agentes. No representa todavía un selector
automático instalado en GitHub Actions ni modifica sus disparadores.

## Investigación y decisión

El patrón documentado por [Nx](https://nx.dev/docs/features/ci-features/affected)
combina cambios de Git, dependencias y consumidores de las tareas afectadas.
La [caché de Nx](https://nx.dev/docs/features/ci-features/remote-cache) permite
reutilizar tareas con entradas equivalentes. Adoptamos el criterio, sin añadir
un gestor de monorepo a esta aplicación solo para obtener esa función.

[Playwright](https://playwright.dev/docs/ci) ofrece `--only-changed`, pero su
selección depende de las importaciones de los tests y puede omitir casos.
Nuestros E2E suelen navegar a URLs sin importar el código de esas páginas:
ese argumento no basta como compuerta de publicación.

[GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
advierte que omitir un workflow completo por filtros o mensaje de commit puede
dejar checks requeridos pendientes. La futura automatización debe emitir un
resumen obligatorio que termine y explicar sus jobs condicionales.

## Regla de decisión

| Cambio real | Validación necesaria |
| --- | --- |
| Documentación, historial de lanzamiento, reglas de agentes | Revisar diff, coherencia y enlaces locales. Sin build/E2E si no son entradas de ejecución o generación. |
| Un test, fixture o mock | Ejecutar los casos afectados y comprobar que conservan su contrato. Una fixture compartida afecta a todos sus consumidores. Reutilizar evidencia del producto sin cambios. |
| Comportamiento de una sección | Regresión de esa sección y consumidores compartidos, más smoke de los recorridos críticos que toca. Incluir los navegadores/plataformas relevantes. |
| Autenticación, sesión, permisos, RLS, migraciones o API compartida | Ampliar a contratos y recorridos dependientes en base aislada; exhaustiva cuando el alcance cruza dominios o no puede delimitarse. |
| Layout raíz, arranque, navegación, estilos globales o marca | Ampliar a superficies y plataformas consumidoras. Respetar además el contrato de marca de AGENTS.md. |
| Dependencias, lockfile, toolchain, configuración de build o CI | Validar los jobs y salidas afectados. Impacto desconocido o general: compuerta amplia/exhaustiva. |
| Entradas nativas Android/iOS o plugins | Compilar y validar la plataforma afectada; firma, asociación de dominios y comportamiento nativo según el cambio. Un cambio web no obliga por sí solo a recompilar ambos binarios. |
| Subida a tiendas o cambio de estado externo sin cambio de código | Consultar procesamiento/revisión/publicación. No repetir E2E ni recompilar por esperar a Apple o Google. |
| Cambio de ejecución sin mapa de impacto confiable | Ampliar la cobertura; no clasificarlo como «sin pruebas». |

Antes de ejecutar, registrar en la tarea o historial: base y HEAD, entradas que
cambiaron, comportamiento/dependencias afectados, checks seleccionados, evidencia
previa reutilizada y límites. Una ejecución pendiente equivalente se sigue; no
se lanza otra copia. Agrupar correcciones coherentes antes de pushear.

## Cuándo reutilizar

No basta con «ya estaba verde» ni hace falta que el SHA completo sea idéntico.
Comparar las entradas relevantes: código y recursos, tests, fixtures/esquema,
configuración, lockfile, toolchain y versión de navegador/plataforma. Cualquier
entrada diferente invalida la evidencia de los checks que dependen de ella.
Conservar enlaces a runs, alcance y resultados exactos, incluidos skips/flaky.
No presentar una prueba focal como exhaustiva ni un job omitido como ejecutado.

Las pruebas web no certifican la firma distribuida por Play, una apertura física
ni el estado de revisión de las tiendas. Tampoco reutilizar una lectura antigua
como prueba de que un despliegue o servicio externo sigue saludable.

## Fallos y repetición

Si falla infraestructura antes de los tests, indicar «tests no ejecutados»,
corregir la causa y reintentar el job fallido cuando la plataforma lo permita.
Si falla una aserción, reproducir y corregir, ejecutar el caso y sus regresiones
afectadas; ampliar si el arreglo cambia comportamiento compartido. Nunca borrar
aserciones, aceptar flakes ni usar datos de producción para obtener verde.

Mantener la exhaustiva periódica como red de cobertura y la opción manual por
riesgo o solicitud explícita. No lanzar otra exhaustiva durante un lanzamiento
si las entradas relevantes ya están certificadas. Si falta evidencia necesaria,
obtenerla antes de publicar: evitar repeticiones no equivale a omitir validación.

## Auditoría de workflows y siguiente automatización

Revisados `regression-tests.yml`, `mobile-native-regression.yml`,
`security-checks.yml` y `cloudflare-compatibility.yml`. Hay specs repetidas entre
preflights y smoke, builds en varias compuertas y deduplicación de la exhaustiva
por SHA. Mobile ya ignora documentación, pero los otros workflows siguen con
disparadores amplios. Cloudflare también despliega: un build suyo no es
intercambiable automáticamente con el build de Next o el nativo.

La implementación futura debe incorporar un planificador ligero con mapa de
dominios y dependencias, selección conservadora ante archivos desconocidos,
huellas de entradas por tarea, y resumen siempre emitido. El inventario estático
de páginas y propietarios sirve de punto de partida, no demuestra cobertura de
comportamiento ni sustituye el grafo. Deduplicar solo checks equivalentes en
test, entorno y plataforma; mantener pruebas específicas de WebKit/WebView.

Validar el selector con casos de documentación pura, documento consumido por
build, fixture compartida, cambio global, migración, lockfile, native y archivo
desconocido. Introducirlo primero en modo informe y comparar su selección con
la cobertura existente antes de permitir omisiones automáticas. No suprimir
deployments, auditorías de seguridad ni checks requeridos incidentalmente.

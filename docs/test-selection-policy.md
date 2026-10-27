# Selección de pruebas y reutilización de evidencia

Vigente desde el 26 de octubre de 2026. Esta política obliga a justificar las
ejecuciones manuales y el trabajo de agentes. La implementación automática inicial se describe al final; los disparadores
se mantienen y los jobs pesados se deciden mediante un plan explícito.

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

La ampliación futura debe incorporar un mapa de
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

## Implementación automática inicial — 26 de octubre de 2026

`ci-test-plan.yml` se ejecuta antes de las compuertas de regresión, seguridad,
WebView y Cloudflare, sin instalar dependencias de la aplicación ni arrancar Supabase. Desde la ampliación por secciones instala únicamente el parser TypeScript fijado por versión e integridad en el lockfile, con scripts de instalación desactivados. Ejecuta
sus propias pruebas y la prohibición de archivos privados, publica un resumen
con la razón y guarda `ci-test-plan.json` como artefacto por workflow.

Para push, la base es el último run **exitoso de ese workflow y esa rama** que
sea ancestro del HEAD, no simplemente el push anterior. Así un push de documentos
no oculta un cambio de aplicación que falló previamente. Si no hay base entre
los últimos 50 runs exitosos, GitHub no responde o faltan permisos, se conserva
la cobertura amplia. En PR se compara contra el merge-base de la rama destino.

La primera versión habilita solo dos reducciones conservadoras:

- Lista cerrada de documentos revisados como no consumidos por la aplicación:
  AGENTS.md, esta política, regression-testing.md, mobile-release-history.md y
  loading-and-native-entry-audit.md. Omite jobs pesados y despliegues, no el
  informe ni las comprobaciones del selector. Cualquier otro Markdown sigue
  por la ruta amplia. Revisar esta lista si se introduce consumo de documentos.
- Cambios exclusivamente en specs E2E **existentes e independientes**: ejecuta
  los archivos completos, en todos los motores configurados correspondientes,
  conservando build, base aislada y verificación estricta de resultados. Las
  specs compartidas web/nativo se validan con ambas configuraciones. No se
  repiten preflights de otros recorridos ni se despliega por cambiar un test.
  Un archivo nuevo, eliminado, renombrado, fixture o spec usada como módulo
  compartido conserva el alcance amplio.

Las ejecuciones manuales y programadas conservan su alcance anterior (incluida
la opción manual focused-release y la comprobación nocturna existente). Cada
workflow tiene un resultado final que falla si el selector falla o un job
seleccionado falla/se omite inesperadamente. No interpretar «omitido por plan»
como «prueba ejecutada». No se modificaron aserciones ni retries.

Los cambios de aplicación, dependencias, migraciones, archivos nativos,
configuración y archivos desconocidos mantienen las compuertas existentes.
En particular, la primera modificación de estos workflows requiere validar sus
jobs integrados; no hay una excepción que deje de probar el propio selector.
La selección por sección se amplía en el apartado siguiente. La caché global por huella de entradas sigue pendiente.

Cloudflare conserva su pipeline de build/deploy para cambios de ejecución o
impacto desconocido y para solicitudes manuales. Solo se evita desplegar cuando
la comparación demuestra documentos revisados o tests independientes. No cambia
el worker, secretos, ambiente ni modo de publicación elegido.

## Validación integrada y comprobación documental — 26 de octubre de 2026

La integración sobre `d72303b3` y mobile `5b3269a7` aprobó antes de esta
comprobación documental:

- [Regresión 40398609286, intento 2](https://github.com/contratacr/contratacr/actions/runs/40398609286/attempts/2): contratos, inventario, tipos, build, verificaciones previas y smoke aprobados. El smoke final reportó 923 aprobadas y 45 omisiones declaradas, cero fallos, flakies u omisiones inesperadas. Los bloques previos reportaron 13, 88, 98 y 94 aprobadas; no sumarlos como casos únicos porque hay solapamiento.
- [WebView móvil 40401365334](https://github.com/contratacr/contratacr/actions/runs/40401365334): 178 aprobadas y 4 omisiones previstas; contratos y resultado final aprobados. Los jobs Android nativo/iOS simulador no se ejecutaron en ese push.
- Seguridad main/test `40398608490` / `40398609313` y Cloudflare main/test/mobile `40398608797` / `40398609351` / `40401365448`: aprobados.

El primer intento de la regresión se canceló antes de E2E por descargas de
paquetes Ubuntu extremadamente lentas. Se reintentó solo ese job en otro runner;
no se repitieron los workflows aprobados ni se cambiaron aserciones.

La regresión también certificó el arreglo de arranque/MFA: el listener de enlaces
permanece fuera del gate de MFA, mientras el gate mantiene protegidos contenido
y APIs. El inventario estático se actualizó sin retirar su compuerta.

Este commit cambia únicamente documentación de la lista revisada y se publica
sin `[skip ci]`. Su objetivo es comprobar que los workflows generan plan e
informe exitosos y omiten los jobs pesados y los despliegues. El resultado de esa
comprobación debe observarse en GitHub; este texto no lo anticipa como aprobado.


## Selección por sección y consumidores — 26 de octubre de 2026

`section-impact.mjs` analiza importaciones y reexportaciones con el AST de
TypeScript, usando dos snapshots de Git: la base validada y el HEAD. Recorre los
consumidores transitivos de cada módulo modificado, incluyendo imports de tipos,
imports dinámicos literales y las dependencias implícitas de layouts y estados
de rutas Next. Retener ambas revisiones evita perder consumidores al quitar una
importación. No depende solo del nombre del archivo ni de `--only-changed`.

El mapa revisado incluye empleos, promociones, proyectos, profesionales/búsqueda,
servicios/categorías, ayuda, legales, soporte, mensajes, notificaciones,
cotizaciones y panel. Cada sección agrega sus specs de comportamiento completas.
Se agregan los tests consumidores por importación, los que contienen URLs de la
sección (también a través de helpers), referencias de harnesses inline y las
specs con cargas calculadas que no pueden descartarse estáticamente. Se conserva
siempre smoke de entrada pública, enlaces/idioma y shell/navegación nativa.
Los tests que construyen URLs dinámicamente dependen del mapa de comportamiento;
una sección nueva o comportamiento nuevo requiere revisar ese mapa.

Una modificación existente de código TS/JS solo obtiene alcance `sections` si
TODOS sus consumidores de rutas pertenecen a secciones conocidas en ambas
revisiones, existe cada suite requerida y afecta como máximo tres secciones.
La selección conserva los motores web configurados y los WebView correspondientes;
un test nativo exclusivo no se pierde en el `testIgnore` de web. Mantiene base
Supabase aislada, contratos, inventario, tipos, lint, build y las compuertas de resultado existentes. Evita repetir preflights de otros recorridos. Seguridad y el
pipeline de build/despliegue Cloudflare siguen activos para cambios de runtime.

Conserva cobertura amplia ante archivos nuevos/eliminados/renombrados, recursos
no analizados, fixtures compartidas, dependencias/lockfile, configuración/CI,
API, autenticación/sesión/permisos, infraestructura nativa o global, módulos sin
consumidor conocido, rutas no mapeadas, más de tres secciones, imports locales
sin resolver o cargas calculadas de código fuente. La excepción finita del
import de traducciones existente se resuelve contra todos los JSON del snapshot;
no habilita imports calculados arbitrarios. Un error al analizar dependencias
conserva el plan amplio. Un fallo del propio selector falla el check obligatorio.
Manual/nocturna y la elección conservadora de base no cambian.

La evidencia JSON incluye secciones, rutas consumidoras y specs exactas. Las
pruebas del selector incluyen snapshots antes/después, dependencias compartidas,
URL sin import, fixtures, globales, ciclos, imports opacos, un CLI real con Git
y una revisión real fijada de la aplicación. Esta fixture versionada no impone una forma fija al grafo del HEAD: un refactor legítimo puede exigir cobertura amplia sin romper las pruebas del selector. Esta modificación de CI selecciona inicialmente
alcance amplio por cambiar sus propias entradas; no se presenta la enumeración
de Playwright ni las pruebas del selector como ejecución E2E del producto.
No hay caché global de tareas ni promesa de que todo cambio pueda reducirse.


Validación local del cierre de la ampliación: 100 pruebas del selector aprobadas, incluida
la integración Git/CLI y fallbacks conservadores; ESLint, actionlint, YAML,
auditorías de archivos privados/almacenamiento/marca e inventario aprobados.
La instalación aislada del parser se comprobó contra el lockfile real.
El plan final para un cambio en el tablero de empleos seleccionó 78 archivos web
y 9 WebView: incluye consumidores opacos que no pueden excluirse con certeza.
La comprobación previa con `--list` validó la separación de configuraciones;
no certifica ejecución de los E2E seleccionados. No se usaron fixtures de producción.


Los cambios exclusivamente en los dos archivos de pruebas del planificador
(`tests/ci/test-plan.test.mjs` y `tests/ci/section-impact.test.mjs`), existentes,
modificados y no usados desde `src` o `scripts`, obtienen alcance `planner-tests`.
El job obligatorio sigue ejecutando TODAS las pruebas del planificador; omite
los jobs de aplicación y despliegue. Las referencias compartidas se comprueban
en ambas revisiones. Archivos nuevos, helpers, eliminaciones, consumidores de
runtime o mezclas con código conservan cobertura amplia. Las modificaciones a
la implementación del selector o sus workflows siguen siendo cambios de CI con
alcance amplio; no se clasifican como cambios de pruebas solamente.

La resolución revisada admite rutas relativas y `@/* -> ./src/*`. Un `extends`,
`baseUrl`, `rootDirs`, sufijos o aliases nuevos, `imports/exports` de paquete,
enlaces simbólicos o submódulos de código/configuración, imports locales con protocolos no resueltos o una configuración Next/Playwright distinta
de las huellas revisadas conservan cobertura amplia, incluso después de un build
verde. Antes de actualizar esa huella, revisar el config y sus plugins para
comprobar que no introducen consumidores invisibles; nunca actualizarla solo
para silenciar el fallback. La instalación de motores del job WebView y del push web tiene un
límite de diez minutos: una demora de infraestructura bloquea el job, no acorta
las pruebas ni permite aprobar sin navegadores. La instalación es común a los
push seleccionados, antes de entrar a la rama amplia o por sección.


Cuando existen varias extensiones locales candidatas, el grafo conserva la
unión de consumidores de todas ellas: no elige una sola por una prioridad
supuesta. Si esa unión llega a rutas globales/no revisadas, amplía la cobertura.


Las dependencias que llegan a consumidores críticos (auth, sesión, UI compartida,
i18n, arranque nativo o infraestructura global) también conservan alcance amplio,
aunque el consumidor sea una entrada implícita de framework sin import desde una
página. Se comprueban ambas revisiones. Un módulo terminal dentro de `src/app`
con una convención de entrada desconocida no se descarta por no llamarse `page`.
Las dependencias de `import.meta`, fábricas de módulos y cargas de código/workers
no modeladas también amplían runtime; en los harnesses de tests se retienen sus
specs como consumidores opacos. No se confunde un wrapper ordinario importado
por una página conocida con una entrada implícita nueva.

La configuración revisada de Playwright aporta las entradas globales de setup y
teardown al grafo. Consumidores de esos fixtures mantienen cobertura amplia.
También se conserva ante paquetes locales/workspaces, código ejecutable fuera
del espacio analizado o comandos/hooks nativos distintos de los revisados.
La selección de specs independientes comprueba este contexto además de su diff.
Estas restricciones siguen vigentes tras un run verde: aprobar un build no
convierte una resolución desconocida en un mapa de impacto confiable.

# Rutas de regreso de Pro

26 de octubre de 2026. Solo Pro en `local/pro-suite-no-push`, mismo HEAD
`06b70019de69bb4e1ee46ead3eda22eedf05f7d0`; conservar cambios anteriores.

Problema: la flecha de sección siempre abría Inicio y los enlaces entre módulos
no guardaban el origen. Las fichas/formularios dependían de estados que solo
leían parámetros al montar. Se centraliza la navegación Pro en un namespace de
history.state, conservando los campos de Next y asociando el origen a la cuenta.
Se aceptan únicamente paths del dashboard propio. Volver consume el historial;
no agrega una nueva navegación inversa. Sin origen, cierra el paso al listado o
usa Inicio para la sección. No se toca la navegación del profesional sin Pro.

La URL representa ficha de cliente/producto/cita, edición, importación,
movimiento y cotización. Preferencias de búsqueda, filtro y calendario reemplazan
la entrada actual; no agregan una entrada por tecla. Se conservan al volver o
recargar. La edición espera datos autorizados antes de montar el formulario y
recupera borrador compatible, para no sobrescribir teléfono/vínculos con vacíos.

Selección: nuevo recorrido de historial (incluye recarga, Avanzar, separación por
cuenta y validación de rutas), consumidores Pro afectados y profesional ordinario,
más contrato de marca porque se toca la flecha del encabezado compartido.
API/SQL/RLS/dependencias sin cambios: se reutiliza evidencia compatible de base,
normalización y permisos; no se repite la suite completa por cada ajuste.
Verificación final: TypeScript, ESLint de componentes/helpers/tests y contrato
de marca aprobados. El dashboard mantiene los 3 errores y 6 avisos ESLint previos
confirmados contra HEAD; no se deshabilitan reglas. UTF-8, archivos privados,
presupuesto bilingüe y diff whitespace aprobados.

La prueba focal de navegación pasó en Chromium móvil (2/2); la selección ampliada
se ejecutó en WebKit móvil y Chromium escritorio/móvil, con repeticiones focales
descritas abajo. La prueba de revisión concurrente de
historial debe esperar a la primera página al volver de Agenda: ahora se desmonta
y recupera el cliente por ruta. Se agrega esa espera sin retirar la aserción de
cambio de revisión ni su recuperación.

Revisión independiente por lectura: sin P1/P2 nuevos concretos. Se resolvieron la
hidratación de formularios antes de editar, el respaldo de registros para el
consumidor local y el aislamiento del JSON de borrador corrupto. Las preferencias
usan replace y las capas usan push/back. Se evita reenviar flags internos de Next
a su wrapper público y se observa la URL nativa: Next 16.4.2 podía restaurar un
renderedSearch cacheado aun con la URL correcta después de varios regresos.

Simulador iPhone 17 Pro, iOS 26.5 contra servidor local: cliente35 → nueva cotización
→ flecha devuelve cliente35 → flecha devuelve listado. Se conserva el borrador
existente sin descartar ni crear cotización. Capturas:
`/tmp/contratacr-pro-path-cotizacion-20261026.png` y
`/tmp/contratacr-pro-path-regreso-cliente-20261026.png`.
Comparaciones exactas de datos/revisión aprobadas: 2 cuentas, 11 citas, 10 cotizaciones
anteriores, 50 disponibilidades, 46 clientes, 45 productos, 10 movimientos; también
coincide el respaldo original de 11 clientes/10 productos. Sin push ni cambios
remotos.


## Cierre de navegación

La selección inicial completó 42/51 casos; las diferencias de contrato se
revisaron sin retirar aserciones: al guardar una cita desde cotización se vuelve
a esa cotización, al guardar desde Calendario se conserva el día de origen y al
guardar movimiento se vuelve al producto. Las comprobaciones exigen además la
cita persistida en Próximas y las existencias dentro de la ficha y tras recarga.
El historial espera su primera página restaurada antes de escribir concurrente.

Se encontró y corrigió un fallo real de escritorio: la redirección de Inicio a
Mis proyectos usaba router.replace sin notificar el estado Pro. Espera resolver
el acceso y usa el helper Pro conservando pathname/idioma. Revisión independiente
sin bucles. La selección focal posterior pasó 13/18, incluyendo navegación real,
helpers, historial y profesional ordinario en los tres perfiles. Los fallos
restantes fueron dos cargas de marca y tres expectativas anteriores de integración.

Marca tiene evidencia compatible aprobada en WebKit móvil (selección inicial),
Chromium escritorio (repetición de 5 casos) y Chromium móvil (selección focal).
Logs conservados en `/tmp/pro-path-selected.log`,
`/tmp/pro-path-recheck-desktop.log` y `/tmp/pro-path-final-focused.log`.

Tras recorrer Empleos, `tsc --noEmit` detecta TS2344 en su tipo generado de Next
por export JobsPageContent, presente también en HEAD. No se cambia ese módulo.
TypeScript estricto de fuentes (misma configuración, excluyendo solamente tipos
generados .next en configuración temporal) aprobado; ESLint del alcance también.
No se presenta el chequeo global generado como aprobado.

La última repetición de integración está en `/tmp/pro-path-integration-final.log`,
con servidor Pro reiniciado tras más de 1h40 de desarrollo: **3/3 aprobados**
(3.3 minutos), con el último test actualizado. Navegación/helpers: 6/6 aprobados;
historial: 3/3 aprobados; profesional ordinario: 3/3 aprobados en la selección
focal final. En conjunto hay evidencia compatible para los 51 casos seleccionados;
no se presenta la primera ejecución como 51/51 verde. Se conservan los logs de
fallos y sus correcciones. Último ESLint del alcance aprobado, sin silencios de
reglas. Datos/revisión exactos y rama/HEAD reconfirmados al cierre. Sin commit,
push, mezcla de ramas ni cambios en main/mobile.

## Botón atrás del navegador con cambios sin guardar en `/dashboard/pro` (N1, 2026-11-12)

Verificación pedida: en «Preparar visitas» con «Tiempo entre visitas» modificado, el botón atrás **del navegador** cerraba el diálogo en la ruta independiente (`pro-tools-profile-menu` en WebKit con `page.goBack()`: diálogo ausente, la URL volvía a la anterior). La guarda de «Volver» del propio diálogo ya funcionaba (corrección N1 anterior en `simple-workspace.tsx`).

Causa: el `popstate` de Next (registrado por el App Router) confirma la URL anterior de forma síncrona (React renderiza en el mismo evento las transiciones iniciadas en `popstate`). Eso desmontaba el editor y su guarda antes de que el oyente de `useProSearchParams` (en fase de burbuja) le preguntara. Una sonda temporal (ya borrada) confirmó que la guarda nunca se ejecutaba: no había ningún `pushState` de restauración.

Corrección (`use-pro-search-params.ts`): un oyente de `popstate` en **fase de captura** decide primero con la guarda registrada (`registerProTraversalGuard`, la misma decisión cacheada por evento). Si la guarda bloquea, su `stopImmediatePropagation` detiene también al oyente de Next, vuelve a poner la URL del paso y muestra «Guarde o cancele la configuración antes de salir». Sin cambios sin guardar no hay guarda registrada y el atrás funciona igual que antes. Afecta a todas las guardas que usan `registerProTraversalGuard` (pagos del borrador, gastos, emisor, etc.), que antes tenían la misma carrera en `/dashboard/pro`.

Prueba: `pro-tools-profile-menu.spec.ts` (WebKit, ES/EN) agrega `page.goBack()` con el cambio sin guardar: el diálogo sigue abierto, la URL conserva `prepararVisita=1`, el valor editado se mantiene y aparece el aviso. Falla 2/2 sin la corrección y pasa 2/2 con ella.

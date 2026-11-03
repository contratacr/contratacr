# Solicitudes de servicios y publicación en el perfil

Una aprobación habilita el servicio en el catálogo; nunca publica automáticamente un servicio en el perfil de quien lo solicitó.

- El solicitante autenticado se obtiene de la sesión, nunca de `userId` enviado por el navegador. Las solicitudes sin cuenta siguen siendo posibles, pero no atribuyen interés a una persona ajena.
- `service_suggestion_requests` conserva cada persona interesada, con unicidad por sugerencia y cuenta. Solo el backend puede leer o escribir esta tabla; la API limita cada consulta y aplazamiento a la sesión actual.
- La migración 259 recupera el autor conservado de cada sugerencia histórica. No reconstruye solicitantes cuyo historial anterior no conservó su identidad, no publica perfiles ni envía notificaciones históricas.
- Aprobar avisa dentro de la app y solicita el push existente a todos los solicitantes registrados. El ID determinista evita repetir el aviso o push al reiterar la misma aprobación. No se agrega correo ni campaña.
- El administrador puede resolver una sugerencia con **Ya existe → ofrecer este servicio**, eligiendo un servicio activo. Se conserva como duplicada en el historial y la invitación apunta al servicio seleccionado.
- Las invitaciones usan el nombre definitivo y abren directamente el editor con `serviceRequest`. Solo se admiten invitaciones de la cuenta y servicios aún activos. El catálogo se actualiza antes de abrir un servicio nuevo.
- El editor conserva el borrador local hasta guardar. Cancelar no agrega profesiones ni servicios. Se utiliza la validación y persistencia del editor existente (precio o consultar precio, experiencia y demás campos).
- **Ahora no** oculta la tarjeta del inicio; la invitación permanece disponible en Servicios. Si ya ofrece el servicio, se oculta y los enlaces repetidos no crean duplicados.
- La atribución histórica disponible sirve para ofrecer completar el servicio, sin asumir autorización para publicarlo.

## Validación

Base: `b6c91e3e`. Pruebas en Supabase local aislado con la migración aplicada, cuentas desechables y MFA real para el administrador. Las credenciales de correo, push y producción se excluyeron del proceso local.

Cobertura: formulario de solicitud y explicación previa, usuario enviado por navegador ignorado, rechazo de acceso anónimo a invitaciones y RLS, dos solicitantes, solicitudes/aprobaciones repetidas, nombre modificado, aplazar sin afectar otra cuenta, editor ES/EN, cancelar/reabrir sin cambios de perfil, guardar y no duplicar, resolver duplicados desde el panel y no reabrirlos al volver a solicitarlos. Chromium escritorio/móvil y WebKit móvil. Se conservan pruebas de enlaces antiguos y de acciones de notificaciones.

También se ejecutan build, TypeScript, ESLint focal, UTF-8, presupuesto bilingüe, inventario y contrato de marca. El presupuesto bilingüe conserva el total permitido: una etiqueta del editor se trasladó a messages y esa unidad se asignó al vocabulario de ubicación ya existente en la base, sin cambiar la búsqueda ni añadir una excepción global.

La evidencia focal no sustituye la suite exhaustiva periódica. El despliegue web y las migraciones remotas se comprueban por separado; sincronizar `mobile` no publica una versión nueva en las tiendas.

Resultado local final: 21/21 pruebas de flujo/enlaces/acciones; 29/29 contratos de administración/notificaciones; 12/12 comprobaciones de marca y cabeceras reutilizadas de la ejecución inmediatamente anterior (sin cambios posteriores de geometría/marca). Build, TypeScript, ESLint focal, UTF-8, i18n e inventario correctos. En los dos componentes grandes modificados se compararon los diagnósticos completos de ESLint con la base: no se introdujeron diagnósticos; no se presenta el lint global preexistente como limpio.

El arranque de CI vuelve a aplicar las revocaciones de la tabla de solicitudes después de sus grants generales. Se comprobó en una transacción local que anon/authenticated no recuperan lectura y que service_role mantiene acceso. Esto conserva el contrato de producción al reconstruir la base de pruebas.

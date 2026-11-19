# Reconciliación de interfaz compartida, solo local

## Problema y alcance

La corrección anterior de campanas no equivalía a actualizar la base de Pro.
HEAD `06b70019` diverge de main desde `ed4a62e7`. Main local de referencia:
`ae2343a0`. Había diferencias en 261 archivos de src, además de los archivos
nuevos sin seguimiento de Pro. Ese número no significa 261 errores ni certifica
qué commit está desplegado: incluye cambios funcionales, administración y APIs.

Se seleccionan pantallas compartidas de portada, búsqueda, perfiles públicos,
Proyectos, Empleos, Promociones, panel y Notificaciones. La reconciliación por
archivo conserva los cambios locales frente al ancestro y recupera los cambios
de main. No se cambia de rama ni se fusionan ramas. Copias previas de cada
archivo intervenido: `/tmp/pro-shared-ui-reconcile/`; inventario y huellas:
`shared-ui-reconciliation-manifest.json`.

## Diferencias conservadas deliberadamente

- Acciones de cotización desde Proyectos e historial de difusión local.
- Citas, Clientes, Herramientas, cotizaciones conectadas y sus datos/historial.
- El calendario compacto de disponibilidad pública acordado con el usuario.
- Las correcciones locales de formularios/teclado en Safari.
- Campana oculta en secciones internas móviles, conservada en las raíces.
- No se traslada el nuevo flujo de invitaciones de servicios de main porque
  requiere un endpoint y almacenamiento que no pertenecen a esta revisión
  visual. Sus componentes se conservan como estaban; no se deja un consumidor
  nuevo llamando a un endpoint inexistente.

No se modifican APIs de negocio, autenticación, permisos/RLS, migraciones ni
bases existentes. Actualizaciones de traducciones respetan las claves editadas
localmente. El módulo Notificaciones recupera el manejo de errores de main sin
emitir avisos reales.

## Desplazamiento

Se conserva el mecanismo de historial de Pro: el estado transitorio de main
no se traslada porque no es compatible con su suscripción síncrona de rutas.
`iniciarSeccionArriba()` distingue una apertura nueva de las repeticiones tardías
que compensan la carga: una navegación nueva reinicia el período de insistencia
incluso si acaba de ocurrir un gesto; las repeticiones respetan los gestos nuevos
del usuario. Se llama al cambiar sección/modo, no al editar un campo o un filtro.

Se prueba desde el panel desplazado hacia abajo, abriendo Herramientas, Empleos,
Promociones, Perfil, Cotizaciones, Clientes y Citas, y regresando con la flecha.
ES/EN en WebKit móvil, tanto web como con runtime nativo simulado. La simulación
de gesto y el desplazamiento programático no certifican la inercia física de un
iphone. La barra nativa compartida también se recupera de main; no se modifica
ningún proyecto nativo ni se sube un binario.

## Criterio de entrega

Localhost/LAN sigue siendo el ambiente correcto; mover esta rama a test no
resuelve divergencia. Esta revisión no autoriza ningún despliegue. La futura
integración debe revisar diferencias contra el main vigente y seleccionar los
cambios nuevos validados; no reemplazar producción con esta rama completa.

Por afectar CSS/navegación compartida se seleccionan marca en tres navegadores,
matriz del panel ES/EN, historial Pro, scroll real de secciones, rutas de empleos
y disponibilidad en búsqueda. Tipos y revisión del diff son obligatorios. Las
capturas web no certifican el binario nativo ni la equivalencia completa de todo
el producto.

## Evidencia y límites

- Marca: 3/3 en WebKit móvil, Chromium móvil y escritorio,
  `/tmp/pro-reconcile-brand-final.log`.
- Empleos: 1/1, rutas de detalle, permisos y regreso al origen,
  `/tmp/pro-reconcile-jobs.log`.
- Disponibilidad compacta ES/EN: 2/2 en `/tmp/pro-reconcile-stable.log`; se
  reutilizan esos casos aprobados, no el resultado completo de esa tanda.
- Notificaciones ES/EN: 2/2 en `/tmp/pro-reconcile-notifications-final.log`,
  incluyendo error simulado al eliminar y conservación del registro local.
- Historial y desplazamiento web/nativo ES/EN: 6/6 en
  `/tmp/pro-reconcile-loopback.log`, tras reiniciar el servidor local.
- TypeScript sin errores en `/tmp/pro-reconcile-types-stable.log`. ESLint
  conserva los cuatro errores y dos avisos previos del navbar; sin reglas
  desactivadas. Diff sin errores de espacios.
- Capturas inspeccionadas en `research/2026-11-07/shared-ui-reconciliation/`.

Los intentos iniciales detectaron dependencias faltantes y conflictos de
historial: se corrigieron o se retiró la integración incompatible. Otros
intentos fallaron durante recargas/RSC del servidor de desarrollo. Se conservan
los registros; no se declaran verdes las tandas fallidas. No se cambiaron
aserciones para aceptar pérdida de historial. El selector de confirmación en
Notificaciones se corrigió a su rol real `alertdialog`.

No se declara equivalencia total con producción ni preparación para publicar.
Quedan cambios de base fuera de esta revisión (autenticación, privacidad,
servicios sugeridos, administración y APIs), y la validación física de ambas
versiones. No se modificaron main, mobile, producción ni datos existentes.

Última comprobación por la URL HTTPS del celular: historial Pro y apertura de
secciones desde el panel desplazado, 2/2 en
`/tmp/pro-reconcile-phone-final.log`. Servidor desacoplado PID 16085, registro
`/tmp/pro-lan-reconciled.log`, mismo puerto 3443. No queda una tanda pendiente.

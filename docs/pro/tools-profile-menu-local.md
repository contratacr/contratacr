# Herramientas como menú de Mi perfil

Trabajo solo en Pro sobre HEAD `06b70019`, rama `local/pro-suite-no-push`.
Referencia: filas cerradas de `Section` en `dashboard/pro/profile-editor.tsx`.

## Criterio de interfaz

Los menús de navegación siguen Mi perfil: fila completa pulsable, título corto,
borde redondeado, separación y flecha a la derecha. Las listas de registros
siguen Mis proyectos: tarjetas con datos y acciones. Una herramienta no necesita
un segundo botón con su mismo nombre ni un formulario abierto dentro del menú.

Herramientas tiene Catálogo, Gastos, Pagos y Preparar visitas. Se conserva el
grupo secundario de borradores.

Actualización 2026-11-12: con Pro activo, «ContrataCR Pro» abre el espacio
independiente `/dashboard/pro`, cuyo hub (`ProTools taskCenter`,
`simple-workspace.tsx`) tiene 14 filas: Empresa 4 (Centro de empresa, Clientes,
Proveedores, Equipo), Biblioteca 2 (Productos y servicios, Servicios
frecuentes) y Gestión 8 (Proyectos, Solicitudes, Tareas, Cotizaciones, Pagos,
Gastos, Estadísticas, Preparar visitas), más la fila secundaria «Borradores de
facturación». Cada sección vuelve con «Volver» del encabezado propio
(`pro-space.tsx`). `pro-tools-profile-menu.spec.ts` exige esos conteos. Se reutiliza la escala de texto/espaciado de
perfil y su contenedor de flecha de 36px; este último mantiene la altura de las
filas también bajo las reglas táctiles nativas, sin excepciones al CSS global.

Preparar visitas abre el formulario existente en un paso con flecha para volver,
mediante `prepararVisita=1`. La URL, recarga y atrás/adelante conservan el paso.
El formulario solo consulta sus datos al abrirse. `VisitPreparationSettings`
conserva su comportamiento anterior por defecto y acepta `embedded` para ese
paso sin un segundo título/acordeón.

El guard de cambios incluye el nuevo parámetro: salir con cambios sucios o un
guardado incierto mantiene el formulario y avisa. Cancelar o guardar permite
volver. No cambian los datos de preguntas, tiempos, citas ni endpoints.

## Validación seleccionada

- Menú y recorridos ES/EN: 2/2, `/tmp/pro-tools-profile-web-verified.log`.
- Runtime nativo simulado: 1/1, `/tmp/pro-tools-profile-native-verified.log`.
- Todos los enlaces, incluido el grupo secundario de facturación: caso ES
  ampliado en `/tmp/pro-tools-profile-all-links.log`.
- Guardado/guard de configuración, copia de preguntas, respuestas, tiempos,
  aislamiento y preservación de clientes/citas/notificaciones, ES/EN: ambos
  casos aprobados en `/tmp/pro-tools-profile-menu.log`.
- Historial Pro: caso puro aprobado en esa tanda; el caso de navegación larga
  falló en la primera ejecución y pasó en `/tmp/pro-tools-navigation-final.log`.
  No se declara verde la tanda inicial completa.
- Tipos y lint sin errores: `/tmp/pro-tools-profile-final-types.log` y
  `/tmp/pro-tools-profile-final-lint.log`. Diff sin errores de espacios.

El intento nativo inicial midió 50px: faltaba el contenedor de flecha del perfil
y el mínimo táctil nativo dominaba el alto. Se corrigió el componente; se
conservó la aserción de al menos 60px. No se debilitó para aprobar.

Se adaptaron los recorridos de preparación para abrir la opción nueva y volver
con la flecha del propio paso. Se mantienen las aserciones de campos sin guardar,
configuración persistida y datos previos. La expectativa antigua de formulario
visible al entrar a Herramientas se sustituye por la fila de acceso y la ausencia
de formulario hasta abrirlo; esa condición la cubre la nueva matriz.

Capturas revisadas en `research/2026-11-07/tools-profile-menu/`. Pruebas locales
con cuentas desechables; no prueba física de un binario ni despliegue. Sin
producción, push, cambios en main/mobile ni migraciones.

# Pendientes y acciones de constancia — 8 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push/commits, producción, migraciones ni eliminación de datos.

- Pendientes del cliente: resumen de cantidades desplegable; lista y acciones individuales siguen visibles. La ayuda para revisar citas se muestra solo cuando hay pendientes, reduciendo texto en el estado vacío.
- Constancia contextual del trabajo: Cancelar antes de Guardar con textos cortos; vista previa y compartir dentro de Opciones de la constancia. Se conservan confirmación de descarte, notas privadas, fotos seleccionadas e historial de versiones.
- Facturación permanece aparte. No se añaden secciones.

Pruebas seleccionadas: contratos existentes de estados de cuenta/pendientes y constancias ES/EN, con aserciones añadidas sobre opciones plegadas y abiertas. Fixtures profesionales completas para las cuentas desechables de constancias; sin cambios de permisos del producto.

Constancias ES/EN: aprobadas en `/tmp/pro-tools-round7.log` (2 casos). Los dos casos de estados de cuenta fallaron inicialmente durante carga/siembra local antes de las aserciones nuevas. Tras cerrar la ejecución se reinició solo el servidor de desarrollo, preservando la base local. La IP privada del Mac cambió de 192.168.40.5 a 192.168.40.59; el lanzador se reabrió con esta IP.

Pendientes/estado de cuenta ES/EN: aprobados en `/tmp/pro-tools-round7-pending.log` (2/2). ESLint, TypeScript y diff-check sin errores. Se conservan las aserciones de datos, saldos, acceso e historial; las publicaciones de constancias usan solo cuentas/fixtures locales y no envían mensajes reales.

Revisión manual en Simulator/Safari tras reiniciar el servidor y centrar la ventana: entrada remota volvió a funcionar. En inglés se agregó una pregunta temporal en Preparar visitas, se inspeccionaron Cancelar/Guardar y se canceló, verificando restauración de 0 minutos entre visitas, 15 minutos de anticipación y ninguna pregunta. Se recorrió Preparar visitas → Herramientas → Mi panel → Herramientas → Clientes → ficha local existente; resumen de pendientes abierto y plegado, con acción de cita visible. No hubo guardado manual, publicaciones ni cambios de datos.

El recorrido manual español no queda certificado: la sesión conserva inglés y el selector del pie del menú no se logró alcanzar con los gestos remotos disponibles. La cobertura ES citada es automatizada. No se declara terminada toda Pro ni se confunde Simulator/Safari con el binario móvil distribuido.

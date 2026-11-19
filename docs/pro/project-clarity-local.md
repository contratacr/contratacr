# Claridad del recorrido y revisión en español — 4 noviembre 2026

Solo checkout Pro, rama local/pro-suite-no-push, HEAD 06b70019de69bb4e1ee46ead3eda22eedf05f7d0. Conservar todos los cambios existentes; sin commits/push, integración, producción, mensajes reales ni emisión fiscal.

## Alcance y selección de pruebas

Hallazgos de la prueba manual EN anterior: la tarjeta del cliente seguía diciendo «Cotización recibida» después de aceptar, y guardar una cita creada desde cotización regresaba al documento en vez de mostrar el trabajo. Ajustes limitados a quote-block y business-panel: estado aceptado/rechazado de proyectos locales visible en la tarjeta; al guardar una cita nueva desde cotización se reemplaza el formulario por el detalle del trabajo guardado. Cancelar y los demás formularios mantienen su regreso previo. Ningún cambio de esquema, permisos, autenticación ni motor financiero.

Se amplía el test existente pro-project-journey para exigir estado aceptado en la tarjeta y navegación automática al trabajo, sin abrirlo por URL para ocultar un fallo. Recarga comprueba persistencia y el resto de sus aserciones de aislamiento, errores de lectura, integridad, vuelta exacta, complementos e invariancia de datos se conservan. Selección: ES/EN en WebKit móvil, Chromium móvil/escritorio; consumidores de formularios, solicitud a trabajo y navegación simplificada; TypeScript global y lint de entradas modificadas. Reutilizar evidencia compatible de otras secciones, no repetir suite completa. Referencia de política main consultada solo en lectura, no fusionada.

El primer comando se detuvo en globalSetup porque busca cuentas de regresión no presentes; no ejecutó tests. Estos casos crean sus propios actores aislados, así que se repite con E2E_FIXTURES_READY=0 para omitir únicamente ese setup ajeno; no se siembra la base ni se retiran aserciones. Guardas de loopback y admin de prueba permanecen activas.

## Revisión manual pendiente de cierre

Preparada otra pareja ficticia local y proyecto «Revisión de red - recorrido español», con registro privado /tmp/pro-project-manual-es-20261104.json (0600). No sustituir el proyecto ni documentos del recorrido EN anterior. El idioma recordado EN redirige enlaces sin prefijo/compatibilidad /es a EN: usar el selector de idioma normal, sin limpiar datos o cambiar middleware por la prueba. El control remoto volvió a noWindowsAvailable al abrir el menú; se pidió mantener la ventana accesible y se continúa con las comprobaciones independientes.

Resultados y pendientes consolidados se completan al finalizar esta ronda.


## Resultado final

**19 resultados distintos por caso/proyecto aprobados: 16 funcionales y tres contratos puros**, sin skips, retries ni aserciones retiradas. [Matriz exacta](research/2026-11-04/project-clarity/coverage.json), [huellas de entradas](research/2026-11-04/project-clarity/inputs.json).

- Proyectos ES/EN en WebKit móvil, Chromium móvil y escritorio: nueve resultados (seis recorridos y tres contratos puros), `/tmp/pro-clarity-tests.log`, 9/9. Comprueba automáticamente el nuevo rótulo de aceptación y que Guardar ya deja la URL del trabajo, sin abrirlo manualmente por dirección, seguido de recarga y finalización.
- Consumidores WebKit/Chromium móvil: formularios mínimos y edición conservada, 120 minutos/cruce de medianoche, solicitud a trabajo con saldo e historial conservados, borrador alternativo, finalización con cotización histórica y navegación simplificada. `/tmp/pro-clarity-consumers.log`, 10/10.
- TypeScript global y lint de ambos componentes + test modificado: aprobados, `/tmp/pro-clarity-types.log` y `/tmp/pro-clarity-lint.log` vacíos. Presupuesto bilingüe 427/65 sin ampliación y diff-check aprobados. No equivale a lint global o suite completa.

Solo tres entradas cambiaron respecto a las huellas anteriores: ambos componentes y pro-project-journey.spec.ts. Se reutiliza evidencia anterior compatible de permisos/SQL/RLS/motor financiero, normalización/paginación, datos fiscales, traducciones y marca; no se repiten tiendas, CI, pruebas físicas o facturación. Las pruebas de consumidores afectadas sí se reejecutaron con el código final.

## Prueba manual española: completada

Safari del simulador iPhone 17 Pro/iOS 26.5, siempre loopback. Se recuperó el control tras dejar el simulador al frente. Se encontró el selector «Español» con la búsqueda de página de Safari y se activó el botón real de la aplicación; no se modificaron cookies por script ni se borró almacenamiento. El menú podía verse parcialmente con Safari expandido; no se atribuye como defecto de código un gesto remoto sin efecto. Las fechas del input datetime-local tienen formato del sistema iOS inglés; los rótulos, mensajes y fechas de detalle de la aplicación son españoles.

Profesional: proyecto → Preparar cotización, mismo cliente/título/línea, introducir 10000 y Enviar cotización. Cliente: Mis proyectos → Cotización recibida → Aceptar cotización → confirmación explícita. La tarjeta cambia inmediatamente a **Cotización · Aceptada · CRC10000**. Profesional: misma cotización → Agendar cita, cliente/servicio/cotización precargados → 120 min, 09:00–11:00 → Guardar. Se abre directamente el detalle **Agendada** del nuevo trabajo, sin navegar por una URL de trabajo. Finalizar trabajo → Sí, finalizar → **Finalizada**, horario y enlaces conservados, Saldo y abonos disponible. Todo escrito mediante UI; comprobaciones de base solo en lectura.

Capturas nativas: [cotización enviada](research/2026-11-04/project-clarity/quote-sent-es.png), [tarjeta aceptada](research/2026-11-04/project-clarity/accepted-card-es.png), [destino al guardar](research/2026-11-04/project-clarity/saved-work-es.png), [trabajo finalizado](research/2026-11-04/project-clarity/completed-work-es.png). El simulador queda en el trabajo finalizado español. No se enviaron mensajes, correos, push ni facturas.

## Conservación

`/tmp/pro-project-manual-es-check.cjs completed` y `/tmp/pro-project-clarity-en-check.cjs completed`: cada pareja ficticia mantiene exactamente una cotización aceptada CRC10000 y un trabajo finalizado del mismo cliente, 120 minutos persistidos, cero cargos, notificaciones idénticas y proyectos íntegros. Los tres proyectos anteriores se comparan completos contra su referencia, junto con el contenido exacto de ambos proyectos manuales nuevos. Se conservan todos los fixtures registrados para revisar, sin eliminar documentos ni cuentas anteriores.

`/tmp/pro-project-clarity-preservation.cjs`: **78 tablas/626 filas originales idénticas**, 46 filas operativas entre las demos registradas, ningún sobrante operativo ajeno. Logs `/tmp/pro-clarity-preservation.log`, `/tmp/pro-clarity-manual-es.log`, `/tmp/pro-clarity-manual-en.log`. El comprobador adicional admite únicamente los cuatro UUID de actores manuales registrados, distintos y ausentes de la referencia; conserva las comparaciones originales y el historial de auditoría anonimizado. Los comprobadores históricos no se debilitaron.

## Pendientes consolidados del alcance actual

| Área | Estado real y siguiente decisión |
| --- | --- |
| Proyectos → cotización → aceptación → trabajo | Recorrido comprobado ES/EN; ambos puntos de claridad corregidos. Sin un bloqueo funcional conocido en los casos revisados. |
| Clientes, catálogo/inventario, agenda, gastos y pagos | Implementaciones y límites descritos en sus informes existentes; conservar evidencia compatible. Esta ronda verifica los consumidores de formularios, agenda, solicitudes y navegación; no certifica todos los escenarios de estas áreas otra vez. |
| Publicación de estas mejoras | Fuera de la autorización actual. Preparar y revisar esquema/migraciones y activación de acceso en un entorno aislado antes de integrar; las guardas de desarrollo permanecen. La base local aprobada no acredita producción. |
| Consulta privada de identificación | Sigue local; revisión del aviso/tratamiento de datos y de condiciones del proveedor antes de ofrecerla públicamente, según identity-lookup-security-local.md. Sin consultas reales para probar. No añadir herramienta pública independiente todavía. |
| Facturación y equivalencia GTI | Fuera del núcleo actual; borradores/historial conservados y herramientas opcionales. Emisión real, proveedor/sandbox y paridad fiscal no están aprobados ni se requieren para este recorrido de servicios. |
| Ideas de equipo, portal fiscal y expansión | Propuestas de investigación, no tareas obligatorias del cierre. No agregar secciones mientras se estabiliza el núcleo. |

**Dictamen:** este incremento local queda probado y revisable; se cierra el pendiente manual español y las dos mejoras de claridad. No representa aprobación para vender Pro, habilitar emisión fiscal o publicar. Rama y HEAD conservados, sin push ni cambios a main/mobile.

# Pro centrado en servicios — simplificación local

3 noviembre 2026. Checkout `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo local previo. Sin branches/worktrees nuevos, commits, push, main/mobile, producción ni envíos/emisiones.

## Contrato

El recorrido principal Pro se centra en Mi día, Trabajos, Cotizaciones y Clientes. Herramientas conserva Catálogo (servicios/materiales/existencias), Gastos y Pagos. Facturación queda en una sección secundaria plegada de Herramientas, con sus borradores/configuración y enlaces históricos intactos. No se retiran tablas, motores ni registros: no hace falta separar la facturación a otra rama para conservarla.

Mi día usa únicamente la consulta acotada de agenda del día de Costa Rica. Muestra hasta cinco trabajos, avisa cuando hay más y permite abrir cada ficha. Trabajos conserva agenda, solicitudes y reprogramaciones. Cotizaciones ya no presenta pestañas de facturas/pagos. Extras, plantillas, fotos y costos siguen asociados a los registros existentes. Los otros destinos previos del profesional se conservan bajo Más opciones de ContrataCR; perfil y soporte siguen en el menú. No se exige Pro a los clientes gratuitos ni se cambia su recorrido.

Los enlaces a facturas, pagos, gastos, catálogo y alias históricos siguen funcionando con títulos propios. Se conserva navegación con guardas y retorno exacto. Facturación permanece en desarrollo: no emisión real.

## Pruebas seleccionadas

Impacto: navegación/arranque del panel profesional, menú móvil/escritorio, títulos, grupo de cotizaciones y acceso a herramientas. Sin cambios de SQL, permisos, cálculos ni API. Cobertura: nueva navegación/snapshots sin escrituras, recorrido ventas completo adaptado a la nueva organización, consumidores de navegación/panel/usabilidad, marca en tres proyectos, TypeScript/ESLint/UTF-8/bilingüe. Se reutiliza evidencia compatible de reglas fiscales, pagos y reprogramación de la revisión del 3 noviembre; no se repite toda la suite Pro ni tiendas.

Pruebas, capturas y límites se registran al cierre abajo.

## Correcciones encontradas al recorrerlo

- El destino inicial de escritorio podía adelantarse a la carga del perfil y abrir Mis proyectos: el destino Pro ya no depende de esa carrera.
- El orden de agrupación antiguo colocaba Cotizaciones antes de las nuevas entradas: Pro conserva ahora el orden Mi día, Trabajos, Cotizaciones, Clientes y Herramientas.
- La tarjeta grande del perfil ya no desplaza las tareas del inicio móvil Pro. Perfil y soporte siguen accesibles; la cabecera de cuentas gratuitas no cambia.
- El enlace de Mi día conserva `volverDia`, validado como ruta local del panel con destino home, para cerrar una ficha tras recarga/pérdida de su estado de historial.
- Volver a herramientas reutiliza la entrada anterior cuando corresponde; en accesos directos sustituye la pantalla actual. Evita el ciclo herramientas → facturación → herramientas → facturación.

## Revisión real del simulador

iPhone 17 Pro/iOS 26.5, Safari, servidor local 3185 y Supabase loopback 54321. Cuenta ficticia nueva, sin contraseñas guardadas. Verificado desde la interfaz:

1. Mi día muestra la visita local Revisión de instalación y los accesos nuevos, sin facturación en el menú principal.
2. Apertura de la visita desde Mi día y regreso mediante la flecha. Se reprodujo el retorno incorrecto a la agenda antes de conservar el origen; después vuelve a Mi día.
3. Herramientas muestra Catálogo, Gastos y Pagos; Borradores de facturación permanece plegado inicialmente.
4. Abrir facturación conserva el borrador de prueba de ₡1.000; regreso a herramientas y de ahí a Mi día.
5. Cotizaciones muestra creación, plantillas, búsqueda y estado, sin pestañas de facturas/pagos.

Capturas: [Mi día](research/2026-11-03/pro-simple-day-ios-simulator.png), [Herramientas](research/2026-11-03/pro-simple-tools-ios-simulator.png), [Cotizaciones](research/2026-11-03/pro-simple-quotes-ios-simulator.png), [borrador conservado](research/2026-11-03/pro-simple-billing-preserved-ios-simulator.png).

Se conserva únicamente la demostración local registrada para que el usuario pueda recorrerla en el simulador. Registro privado `/tmp/pro-simple-simulator-actors.json` (0600), limpieza limitada a esos actores en `/tmp/pro-simple-simulator-cleanup.cjs`. No son cuentas existentes ni datos de producción. No se imprimen sus credenciales. Las demás cuentas E2E se limpian al finalizar.

## Evidencia

- Nueva navegación: **3/3**, WebKit móvil, Chromium escritorio y móvil, sin retries automáticos. Incluye títulos español/inglés, regreso tras perder historial/recargar, cierre y back independientes, accesos históricos, ausencia de descargas del workspace completo y comparación de registros. Log `/tmp/pro-simple-navigation-verified.log`.
- Recorrido conservado de cotizaciones/pagos/borradores: **3/3**, mismos tres proyectos, incluida cuenta gratuita, aislamiento, ediciones sin guardar, exportación e historial. Log `/tmp/pro-simple-core.log`; sus tres fallos iniciales del test nuevo fueron diagnosticados por separado y cerrados en el log anterior. Se reutiliza esta evidencia porque los motores y acciones financieras permanecen iguales; el cambio posterior de retorno a Herramientas está cubierto en la nueva navegación.
- Marca pública sin fuentes web: **3/3**, mismos proyectos, y contrato estático aprobado. No se cambian artwork, tipografías ni componentes de marca.
- Consumidores: analizador de rutas, listas/paginación/idiomas e inventario/filtros/recuperación **3 aprobados** en Chromium móvil. El recorrido de retorno completo se repite tras ajustar la expectativa legítima Catálogo → Herramientas → Mi día, manteniendo aserciones de negocio. Log `/tmp/pro-simple-consumers.log`.
- TypeScript global, ESLint de componentes/test/helpers cambiados, UTF-8, presupuesto bilingüe y whitespace aprobados. El lint completo del panel mantiene sus tres errores y seis advertencias previas (efectos ajenos a esta entrega); no se silencian reglas. Log `/tmp/pro-simple-panel-lint.log`.

Los intentos previos no se cuentan como aprobados: compilación lenta del servidor local, selectores de título que suponían heading en vez del párrafo real del header móvil y un retroceso extra en el test se investigaron; no se quitaron comprobaciones de datos ni se ampliaron tiempos globales. El servidor local se reinició, sin modificar datos.


Cierre de consumidores: retorno completo **1/1 aprobado** en `/tmp/pro-simple-back-final.log`; preserva las verificaciones de formularios, cliente/cotización, recarga/back/forward, movimientos y origen exacto. Resultado compuesto de esta entrega: **13 casos distintos aprobados**, inventario en [pro-simplification-coverage.json](research/2026-11-03/pro-simplification-coverage.json). No se presenta como una sola ejecución inicial verde ni se repite la suite completa por cada ajuste.

Conservación final: **78 tablas, 626 filas originales idénticas**, 16 filas exclusivas de la demo local registrada conservadas para el simulador y cero extras operativos ajenos. Se mantienen los seis eventos previos de auditoría de pruebas anonimizados. Log `/tmp/pro-simple-preservation-final.log`. El comparador verificó la relación owner/client del request de demostración antes de excluir su fila dependiente de preparación; no se borró ni modificó ningún original para obtener este resultado.

# Línea bajo acciones al escribir — Pro local

5 de noviembre de 2026, misma rama y HEAD base que `client-identification-local.md`. El cambio de producto se limita a las reglas móviles de modales en `src/app/globals.css`; no se modifican cabeceras, marca, autenticación ni datos.

La reproducción en Safari del simulador distinguió dos fuentes de pintura: una sombra exterior extendida al viewport y el fondo oscuro del contenedor, que seguía midiendo el viewport de maquetación cuando la barra de accesorios reducía el área visible menos de 80px. El diálogo blanco sí se encogía; el contenedor podía dejar una franja debajo. Una página aislada sin CSS de ContrataCR no mostró la línea; al añadir la sombra extendida se reprodujo.

El contenedor de todos los modales móviles ahora sigue siempre el área visual, también con la barra de accesorios/teclado físico. Se retira la sombra extendida, la sombra exterior de formularios a pantalla completa y la de hojas mientras el teclado está abierto. El fondo oscuro existente sigue dentro del contenedor y conserva su función en ventanas pequeñas. No se elimina la separación fina encima de las acciones.

Se revisaron los consumidores compartidos de Modal, incluidos clientes, inventario, agenda, cotizaciones y los nuevos formularios de Pro. Se prueba la geometría sin bandera de teclado (40px de reducción), con teclado (380px visibles), modo completo, hoja pequeña y centrado; fondo oscuro y límites deben mantenerse. La emulación no proporciona la barra nativa de Safari: la ausencia visual de la línea se comprueba además en el simulador, con teclado físico/accesorios y teclado en pantalla.

Las primeras pruebas de píxeles fuera del área visual simulada encontraron zonas no pintadas del compositor, no colores confiables de la página. Se sustituyó esa medición inválida por límites del contenedor/diálogo, ausencia de sombras exteriores y el color/composición del fondo oscuro, conservando la comprobación visual nativa. También se ajustaron fixtures de profesional completas y selectores de estado/etiqueta sin quitar aserciones de conservación, guardado o acceso. Se registran los resultados finales con sus entradas; las ejecuciones fallidas no se presentan como aprobadas.

## Cierre de validación

4/4 recorridos ES/EN de clientes y 2/2 contratos de teclado en WebKit/Chromium móviles; 2/2 regresiones de formularios (clientes, productos, citas y cotizaciones); 7/7 contratos de acceso/seguridad de identificación. Tipos, lint focal y diff sin errores. Entradas y logs finales en `research/2026-11-05/client-identification/inputs.json`.

Conservación: 78 tablas y 626 filas originales idénticas, 51 filas de ejemplos registrados conservadas, sin nuevos registros operativos ajenos a los ejemplos. Se limpiaron tres cuentas desechables exactas que quedaron tras interrumpir ejecuciones, verificando que no pertenecían a la base original y usando el helper existente. Las cuotas antiabuso nuevas se registran por separado y se dejan expirar por su mantenimiento normal; no se desactivaron ni borraron para superar límites. El comparador previo queda intacto; `/tmp/pro-client-id-preservation.cjs` agrega únicamente esa excepción exacta para cuotas efímeras, sin relajar las comparaciones de datos originales.

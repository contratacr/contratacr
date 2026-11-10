# Dirección presencial y Cómo llegar

Investigación del 9 de noviembre de 2026: `WorkplacesPicker` guarda las zonas
administrativas y, opcionalmente, un punto exacto. El modelo de búsqueda considera
los puntos exactos lugares fijos, incluso si el profesional también se desplaza.
Una zona de país/provincia o un cantón sin punto no representa un local presencial.

El nuevo `showAddress` se guarda en cada elemento del JSON `workplaces`. No requiere
migración, geocodificación adicional ni cambios en los filtros de búsqueda. Los
registros anteriores se consideran desactivados. Cada sede con coordenadas válidas
tiene el interruptor "Mostrar esta dirección en mi perfil"; la misma persona debe
activarlo y guardar sus cambios. No se activa para cuentas reales durante pruebas.

En Información del perfil se muestran las sedes activadas, su dirección guardada y
Cómo llegar. El botón usa el punto exacto, no el centro del cantón, con un enlace
HTTPS de Google Maps. No se envía una ubicación de origen ni se solicita al visitante
permiso de geolocalización desde ContrataCR. Se deduplican puntos idénticos y se
permite mostrar varias sedes. El perfil consulta workplaces en vivo para retirar
la sede de esta sección al desactivar el interruptor, sin esperar la caché de ficha.
Si la lectura falla no se utiliza una lista antigua para esta sección.

[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
documenta el formato `api=1&destination=lat,lng` y que no exige clave de API.
No se añade un mapa interactivo ni peticiones de rutas o Places al cargar el perfil.

Alcance: este interruptor controla la nueva sección de dirección e indicaciones.
Los puntos exactos ya forman parte del modelo público del mapa/buscador existente;
no es una promesa de ocultarlos de todas las APIs o de retirar el marcador del mapa.

Validación focal autorizada: 4 contratos aprobados; 2 recorridos aprobados en
Chromium/WebKit móvil con guardado/recarga simulados, desactivación y traducción
inglesa. Tipos, comillas e inventario aprobados; lint sin errores y con dos
advertencias anteriores en profile-client. Evidencia en `/tmp/ccr-public-workplaces/`.
No se activaron direcciones reales ni se afirma validación física nativa.

## Revisión de jerarquía visual y valor predeterminado

Al crear un punto exacto se activa showAddress. Los lugares anteriores sin esta
propiedad también se muestran; false explícito conserva la ocultación. No se
reescriben registros de otras personas ni se amplían permisos de base de datos.
El selector presenta título, dirección completa, interruptor y acciones de texto
Editar ubicación/Quitar, sin repetir el cantón ni truncar el estado del punto.
Editar conserva el lugar hasta confirmar Actualizar ubicación; Cancelar edición
no elimina la sede anterior. Se conserva una ocultación explícita al editarla.

Cómo llegar aparece en el bloque de contacto (móvil arriba, escritorio lateral).
Una sede abre directamente Maps; varias despliegan destinos por nombre/dirección.
Información conserva el detalle completo. No se agregan mapas o consultas de pago.

Investigación: [Material, cards](https://m1.material.io/components/cards.html)
sobre jerarquía de contenido/acciones y moderación de controles;
[NN/g, progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
sobre mantener acciones frecuentes visibles y revelar opciones secundarias.

Esta revisión se publica por instrucción explícita de Isaac sin ejecutar pruebas
locales. Los recorridos y contratos fueron actualizados pero no ejecutados; los
resultados de la implementación anterior no certifican estos cambios de comportamiento.

## Diseño aprobado, 10 de noviembre de 2026

Se conserva el resumen y edición de lugares, dirección completa, visibilidad,
atención a domicilio/cobertura, videoconsulta y guardado existentes. En el perfil,
debajo de redes sociales, cada sede presenta nombre y dirección seguidos de dos
accesos con texto: Google Maps y Waze. Información conserva las mismas sedes.
Ambos enlaces usan las coordenadas exactas guardadas; Waze utiliza el enlace HTTPS
`https://www.waze.com/ul?ll=lat,lng&navigate=yes`, con comportamiento web/app según
[Waze Deep Links](https://developers.google.com/waze/deeplinks).
No se recrean logos oficiales: se usan los iconos de mapa/navegación del sistema
junto al nombre visible de cada proveedor. Se retira el botón único Cómo llegar.
Isaac autoriza publicación sin pruebas locales; esta revisión no fue ejecutada
localmente ni se presenta evidencia anterior como validación del nuevo diseño.

## Revisión compacta, 10 de noviembre

Se retira la sección repetida Dónde atiende presencialmente del contacto e
Información. Maps/Waze son controles circulares en la misma fila de redes, con
etiqueta accesible y destino exacto. Con varias sedes cada proveedor permite
seleccionarlas por nombre/dirección. Solo se muestran lugares públicos válidos.
El formulario distingue Marcar en el mapa (secundario, una línea), explicación
opcional debajo y Guardar lugar como confirmación principal. Un punto existente
se edita con Cambiar punto. Se conserva dirección, cobertura y visibilidad.
Publicación explícitamente solicitada sin pruebas locales; esta revisión no se
presenta como validada por las ejecuciones anteriores.

Se compacta el control a una sola línea: Marcar en el mapa (opcional). Se retira
la explicación visible repetida y la flecha decorativa para dejar espacio en
móvil, conservando el botón de 44px y el estado expandido accesible. Sin pruebas
locales por preferencia vigente; push solicitado expresamente.

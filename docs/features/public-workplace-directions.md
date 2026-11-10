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

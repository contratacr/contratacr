# Publicar una necesidad y completar la salida del menú — 2 de noviembre de 2026

Base: main/test 9e88294b. Evidencia compatible previa: regresión web
41470304633 (1.031 aprobadas, 45 omisiones previstas), WebView 41470304100
(244 aprobadas, 4 omisiones previstas), seguridad y Cloudflare aprobados.
Esa evidencia no certifica los cambios de comportamiento de esta tarea.

## Alcance y selección

- PublishProjectModal: elección explícita solo para nuevas solicitudes; edición y
  borradores restaurados conservan acceso directo al formulario existente.
- Misma iconografía BrandIconBadge del producto con UserRoundSearch y
  BriefcaseBusiness. «Quiero publicar un servicio que necesito», en ES/EN.
- Ofrecer servicios dirige al perfil profesional, o al registro si no existe.
  La cuenta profesional también puede elegir que necesita un servicio.
- No se añaden banners ni se cambian el nombre/buscador de Proyectos.
- La barra inferior sigue el gesto; tras una bajada corta completa su retirada.
  No debe quedarse a medio ocultar, interferir con el foco ni reabrirse por el
  rebote de iOS. Con el dedo apoyado no se anticipa el fin del gesto.

Validación focal: tipos, ESLint, codificación, vocabulario e idiomas; harness del
componente real en ES/EN y Chromium/WebKit (intención, destinos, edición, borrador,
volver, campos conservados, sin publicar), pruebas de scroll de NativeBottomNav
incluyendo contenido de poco recorrido, inversión, rebote y limpieza al navegar.
Se actualizan los recorridos existentes de publicación para ejercer el nuevo paso,
sin retirar sus aserciones. Las compuertas automáticas mantienen su selección.
No se repiten manualmente suites sin consumidores afectados. No se cambia esquema,
permisos, SDK nativo ni se publica una actualización en tiendas.

## Moderación de contenido

El usuario confirmó específicamente el borrado permanente de las publicaciones
7efe6ee7 (enlace de constructora), e22066cf (reparación de vehículos y motos) y
1436a0da (anuncio de instalaciones de gas). Se revisaron sus descripciones completas
antes de pedir confirmación. La solicitud de limpieza a1ae651d y la app de muestreos
1b93475f se conservan. La eliminación se realiza con el panel autenticado existente;
no mediante pruebas ni acceso SQL directo, ni elimina perfiles profesionales.

## Resultado local

32 casos distintos aprobados en Chromium móvil y WebKit móvil: 20 de intención,
edición, restauración/expiración de borrador y tamaños 320/1440; 12 de navegación
inferior, incluidos gesto corto y cancelación al invertir el movimiento.
Tipos, codificación, presupuesto bilingüe y vocabulario aprobados. ESLint de la
navegación y del nuevo spec aprobado. El modal conserva un diagnóstico previo
`react-hooks/set-state-in-effect` en el reinicio de destinatarios (también presente
en 9e88294b); comprobación focal del resto sin errores, sin cambiar la regla del
repositorio ni ocultar el diagnóstico en CI. No se declara una regresión completa
local. Moderación verificada en el tablero público: quedan dos solicitudes.

# Revisión de referencia: Houzz Pro Overview

Investigación local, 2026-11-09. No se modificó producto, SQL, cuentas ni datos.
No se operó Safari ni el escritorio del usuario. Posteriormente se obtuvo y leyó
la transcripción del candidato mediante el navegador integrado en segundo plano.
No se reprodujo el vídeo completo; esta nota no acredita una revisión visual.

## Identificación y límites de la evidencia

La captura del usuario mostraba un Quick Start Video titulado parcialmente
«Houzz Pro Overview», de **16:07**. Se encontró este candidato oficial:

- [Houzz Pro Overview for Builders & Remodelers](https://www.youtube.com/watch?v=KAOyDOiTOBo).
- Autor observado en `videoDetails` de la página pública: **Houzz Pro**.
- `lengthSeconds` observado: **967**, equivalente exactamente a **16:07**.
- La descripción pública indexada señala publicación el 15 de junio de 2026.
- Coinciden duración y comienzo del título, pero **no se confirmó el ID del
  reproductor dentro del Quick Start de la sesión del usuario**. Es un candidato
  fuerte, no una identidad del embed demostrada.

La página pública declara pistas de subtítulos en inglés e inglés estadounidense.
Las primeras solicitudes públicas a ambas pistas devolvieron contenido vacío.
Después, la exportación de transcripción del navegador integrado sí obtuvo texto
en-US con marcas de 0:05 a 15:56. Se leyó completo y se contrastó con el mapa de
capítulos. Archivo de evidencia temporal: `/var/folders/cm/c1x9cscd6m757st1wwrdh6sh0000gn/T/browser-use/exports/youtube-KAOyDOiTOBo-83b56e96-569f-4a13-85aa-350595b3245f.txt`.
No se eludió autenticación ni se utilizaron servicios terceros de transcripción.
El mapa de capítulos ahora está respaldado por la narración transcrita, pero no
por observación de todas las pantallas.

Existe otro [Overview oficial para diseñadores](https://www.youtube.com/watch?v=RNhb-nQtJ5o),
con autor Houzz Pro y duración observada de 1084 segundos (**18:04**). No coincide
con los 16:07 de la captura. No deben intercambiarse ambos recorridos como si
fueran el mismo vídeo.

## Capítulos del candidato y relación con el inventario inicial de 74 capacidades

| Inicio | Tema anunciado | Relación con el registro local |
|---|---|---|
| 00:25 | Crear un proyecto | 01, 02, 06; no prueba equivalencia del CRM configurable 07. |
| 03:52 | Preparar una cotización | 35, 36, 39; aprobación parcial general sigue diferenciada. |
| 07:00 | Cotización asistida por IA | 46, actualmente externa/no implementada. |
| 08:03 | Allowances | Desglose importante pendiente en 39, 54 y 62; véase abajo. |
| 09:36 | Aprobación del cliente | 35, 39; no confundir aprobación con firma jurídica 41. |
| 10:11 | Gestión del presupuesto | 23, 54, 55; costos registrados no equivalen al presupuesto. |
| 11:08 | Selecciones | 62; no confundir con extras opcionales de una cotización. |
| 11:58 | Product Clipper | 60 y conexión con catálogo 59. |
| 13:11 | Cobros al cliente | 42, 44, 47, 49; registro manual no procesa pagos. |
| 14:27 | Otras herramientas | El encabezado no permite identificar ni certificar más funciones. |

## Brecha concreta: importes provisionales para elecciones posteriores

La documentación oficial [How to Use Allowances](https://pro.houzz.com/pro-help/r/how-to-use-allowances)
explica partidas presupuestarias provisionales para productos todavía no elegidos.
Pueden tener fecha para definirlas y un tablero de selecciones opcional. Al
finalizar, se conserva la comparación con el importe previsto y se pueden generar
cambios, integrar partidas aprobadas o crear órdenes de compra. También hay estados
de apertura, finalización y reapertura e informes de diferencias.

Revisión de código local realizada antes de calificar la brecha:

- Búsqueda de `allowance`, `provisional`, `partida estimada`, `precio estimado` y
  `monto previsto` en `src/lib/pro`, `src/components/pro`, `src/app/api/pro` y
  `docs/pro/sql`. Las coincidencias de «provisional»/«por definir» corresponden
  principalmente a borradores fiscales y su configuración.
- `src/lib/pro/quote-choices.ts` define complementos opcionales con cantidades,
  precios y selección del cliente; no un presupuesto provisional que luego se
  reconcilia con productos elegidos.
- `src/lib/pro/work-changes.ts` conserva propuestas de cambio e importes, con
  aprobación e historial; no modela el ciclo previo de una allowance.
- `src/lib/pro/service-packages.ts` reutiliza líneas de productos/servicios; no
  representa estados, fecha de decisión o conciliación de una partida provisional.
- No se identificó una entidad normalizada ni un recorrido equivalente en esos
  archivos. Esto es evidencia de implementación pendiente dentro de la revisión,
  no una prueba basada únicamente en ausencia de una palabra.

Recomendación para el registro: desglosar esta función dentro de **39/54/62**, sin
marcarla cubierta por extras, anticipos o borradores de factura. Para Costa Rica,
considerar un texto como **«Monto previsto para materiales por elegir»**; evitar
«Asignaciones», que se confundiría con responsables del equipo. No requiere una
sección principal nueva. Su implementación futura necesita reglas de importes,
aprobación, versiones y conciliación antes de reutilizar documentos existentes.

## Otras precisiones útiles del catálogo oficial

Estas observaciones son de documentación complementaria, no del vídeo visto:

- [Convertir cotización en cronograma](https://pro.houzz.com/pro-help/r/how-to-use-ai-to-convert-an-estimate-to-a-schedule):
  Houzz documenta generación desde partidas, opción de agregar o sustituir y una
  variante que usa sólo las partidas sin ampliar mediante IA. Falta hacer explícita
  esa conexión entre 13/35/46; una línea de tiempo manual no la implementa.
- [Notas de reuniones y llamadas](https://pro.houzz.com/pro-help/r/call-recording-on-the-houzz-pro-app):
  audio, transcripción y resumen vinculados al proyecto o interesado son una
  familia distinta de generar documentos con IA (46). El registro de 74 familias
  no la nombra expresamente. Conviene agregar un desglose externo pendiente;
  requiere proveedor, permisos y revisión de consentimiento y tratamiento de datos.
- [IA móvil](https://pro.houzz.com/pro-help/r/how-to-use-ai-in-the-houzz-pro-mobile-app):
  comandos de voz y extracción de datos de comprobantes deben distinguirse de
  horas/gastos manuales (21) y de simplemente subir una foto. No están acreditados
  por los módulos actuales.

La [guía oficial de inicio para contratistas](https://pro.houzz.com/pro-help/r/how-to-get-started-in-houzz-pro-contractors)
conecta proyectos, equipo, cotizaciones, planos, mediciones, cronograma, cobros y
selecciones. Refuerza que las familias deben probarse también como recorridos
conectados; no basta con tener menús con esos nombres.

La matriz principal se amplió por root con 75–77 tras esta investigación. La
transcripción del candidato se obtuvo y contrastó; sigue pendiente confirmar el
ID del embed de Quick Start y revisar su interfaz visual completa.


## Confirmaciones de la transcripción obtenida

- 00:29–03:40: solicitud o trabajo directo, etapas configurables y expediente central.
- 04:06–06:44: categorías/códigos de costo y estructura reutilizable de partidas.
- 08:10–09:59: monto provisional ligado a selecciones, controles de vista del cliente y aprobación.
- 10:25–10:56: presupuesto previsto frente a gastos reales usando los mismos códigos.
- 13:20–14:20: documentos y abonos enlazados; no reconstruir el mismo dato en cada paso.

Estas confirmaciones orientan integración y prioridades. No demuestran que esas funciones estén implementadas en ContrataCR ni acreditan compatibilidad fiscal costarricense.

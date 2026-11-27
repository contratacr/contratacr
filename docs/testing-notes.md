# Notas para el testing manual (directorio estilo Yelp + Pro estilo Houzz)

Lista viva de QA manual de todo lo que NO está en producción todavía. Solo se ve con las banderas del directorio y de Pro encendidas (`DIR_ENABLED`, `PRO_UI_ENABLED`, `PHONE_DIRECTORY_HEADER`, etc.). Regla del dueño: "Todo lo que vamos agregando o quitando hay que ir haciendo notas para el testing de más adelante."

Fuente: `git log --since=2026-11-19` en `~/dl/pro-run` (556 commits). Última revisión de esta lista: 2026-11-27, hasta el commit `9b770fcea`.

## Cómo mantener este archivo

1. Todo cambio visible (agregar, quitar, reordenar, cambiar texto) agrega o edita su línea aquí **en el mismo commit**.
2. Si un commit nuevo cambia algo ya anotado, se edita la línea existente (no se deja la vieja). Si ayuda, se escribe "(reemplaza a …)".
3. Lo quitado va en la lista "Quitado" de su área, para comprobar que ya no aparece.
4. Marcar `[x]` solo cuando se verificó a mano en test; con fecha si es útil. Al subir algo a producción, mover su bloque a "Verificado en producción" al final o borrarlo.
5. Cada área tiene: comportamiento actual, quitado, dispositivos y casos límite. Los chequeos generales están en "Chequeos transversales".
6. No guardar secretos ni datos personales aquí.

## Chequeos transversales (repetir en cada área)

Dispositivos y anchos:
- [ ] iPhone 390x844 (Safari real si se puede; el teclado de iPhone movió la página antes).
- [ ] 360 px (Android pequeño): nada se corta, botones "Maps" abreviado bajo 360 px.
- [ ] Escritorio 1280 px.
- [ ] Modo oscuro/claro si la pantalla lo soporta; "reducir movimiento" apaga las animaciones del menú.

Banderas apagadas (producción debe verse idéntica):
- [ ] Con directorio apagado: portada, navbar, barra inferior, menú, `/servicios`, perfil profesional, `/registro` iguales a producción.
- [ ] Con directorio apagado `/categorias`, `/lugar/...`, `/registro/empresa`, `/herramientas` no existen (404 o redirección).
- [ ] Con Pro apagado no aparece nada de Herramientas/Pro en menú ni enlaces.

Texto:
- [ ] Ningún texto truncado con "…" (nombres largos, direcciones, tarjetas, barra inferior, "Mejor calificados", negocios similares): envuelve en varias líneas.
- [ ] Español de Costa Rica, trato de usted, sin jerga; lo mismo en inglés.

## 1. Portada / Home (directorio encendido)

Nota: el commit `d70c4261d` (2026-11-26) dejó test con la portada y la barra inferior de producción; commits posteriores reintrodujeron bloques del directorio. Confirmar con Isaac cuál es la decisión final antes de probar (ver "Pendiente").

Comportamiento actual:
- [ ] Hero con diapositivas tipo Yelp: una foto por diapositiva, barras de progreso arriba bajo el navbar, alternan un servicio profesional y una sección de negocios (Restaurantes, Parqueos, Farmacias, Hospedaje, Lavacar…).
- [ ] Cada diapositiva: título de una línea que dice qué hay (p. ej. "Mecánicos y talleres", "Precios de gasolina"); frase corta que no repite el botón; botón con verbo ("Buscar …", "Ver …").
- [ ] Botones del hero lado a lado con icono (Buscar, Publicar solicitud).
- [ ] Buscador: en la foto al inicio; al hacer scroll pasa al navbar (en teléfonos el navbar siempre lleva el buscador).
- [ ] "Mejor calificados": título a la izquierda, flechas arriba a la derecha (escritorio y teléfono); tarjetas horizontales (foto, nombre, estrellas con cantidad de reseñas, categoría y zona); flechas solo en escritorio y solo si hay más; en teléfono se desliza; las flechas se recalculan si cambia el tamaño de la fila.
- [ ] "Lo más buscado" (título cabe junto a "Ver todas").
- [ ] "Categorías más buscadas": pestañas Servicios y Negocios, seis fichas cada una, mismas fotos que `/categorias`; "Ver todas" a la derecha. Cafeterías y Bares son dos fichas.
- [ ] Zonas: "Busque en su provincia"; mapa + tarjeta de una provincia; pestañas subrayadas Profesionales / Empresas, cada una con su propia cuenta; chips de empresas iguales a los chips de cantón; sin "Cerca de mí".
- [ ] Fila con los siete nombres de provincia bajo el mapa, sincronizada con la selección (seleccionada = píldora azul rellena); centrada si cabe, con scroll horizontal si no (Heredia y Cartago son blancos pequeños en 390 px).
- [ ] "Así funciona" tiene paso de Empresas (video de búsqueda temporal hasta grabar el del directorio).
- [ ] Bloque de descarga de la app: igual que producción.
- [ ] Pie de página (directorio encendido): Buscar, Para profesionales y empresas, Ayuda y soporte, lema nuevo; enlace "Agregar o reclamar mi negocio" abre `/registro/empresa`.

Quitado:
- [ ] Sin franja de marcas; sin segundo buscador en el feed del teléfono; sin "Cerca de mí" en zonas; sin micrófono en el buscador; sin grupo "Comercios" suelto; sin "Mejor calificados" renombrado a "Las mejores reseñas" (volvió a "Mejor calificados").

Casos límite:
- [ ] Sin foto en una tarjeta de profesional o negocio: tarjeta compacta de texto, nunca una letra gigante.
- [ ] Título largo de diapositiva en 360 px.
- [ ] Producción (bandera apagada): portada sin cambios.

## 2. Navbar y búsqueda

Comportamiento actual:
- [ ] Navbar de teléfono = el de producción; en pantallas de búsqueda y mapas aparece una tarjeta flotante (con márgenes iguales, nunca sticky) detrás de `PHONE_DIRECTORY_HEADER`.
- [ ] Pista del buscador rota: "Encuentre los mejores …" con la palabra final cambiante (profesionales, restaurantes, farmacias, atracciones, tiendas…); nada se mueve a la derecha de la palabra.
- [ ] Pastilla de búsqueda sin sombra; lupa oscura simple.
- [ ] Hoja de búsqueda: "Profesionales" y "Lugares/Negocios", seis de cada uno y enlace "Ver todos los servicios" / "Ver todos los negocios" que abren las dos pestañas de Categorías; ambas visibles sin scroll.
- [ ] Vacío: chips de Profesionales y luego de Empresas; al escribir, sugerencias agrupadas (Profesionales / Empresas, "Ver en el mapa").
- [ ] "Recientes": solo perfiles y negocios abiertos (no búsquedas escritas); la ficha de un lugar registra la visita.
- [ ] Sin nada que buscar y sin lugar: se enfoca el primer campo en vez de buscar.
- [ ] Al abrir la hoja se oculta la fila del encabezado (teclado de iPhone no deja ver la tarjeta flotante).
- [ ] Filtros: solo idiomas y aseguradoras con profesionales publicados; "otro idioma/aseguradora" libre.
- [ ] Tarjeta de lugar en la búsqueda: solo el nombre buscado, con marca corta si cubre país/provincia.

Quitado:
- [ ] Sin botón de voz/micrófono; sin chip "Cerca de mí" como filtro (es la ubicación del buscador); sin chip "24 horas".

Dispositivos/límites:
- [ ] iPhone con teclado abierto: la tarjeta flotante no asoma.
- [ ] Buscar sin permiso de ubicación: "Más cercanos" muestra "Sin ubicación".
- [ ] Bandera apagada: navbar y buscador idénticos a producción.
- [ ] Búsqueda de varias palabras en «Lugares» (migración 544, prefiltro `search_haystack` + puntaje plpgsql): «soda la», «farmacia fischel», «hotel san jose» responden en menos de 300 ms (local: 8,2 s → 78/32/37 ms) y con los mismos resultados que antes; «san jose» ~0,35 s, una sola palabra corta («la») ~1,8 s.

## 3. Menú

- [ ] Menú de marca a pantalla completa desde arriba, se despliega hacia abajo en todas las pantallas (antes entraba por la derecha): cortina con borde redondeado que se aplana, fila de logo con X que gira, opciones que caen una a una.
- [ ] Cerrar: la cortina sube con las opciones puestas (sin hoja blanca vacía); cierre más rápido; sin sombra bajo la fila del logo.
- [ ] Orden con directorio: Buscar, Categorías (segunda fila), luego el resto. Explorar abre las pestañas Servicios y Negocios.
- [ ] Herramientas en el menú: una sola flecha; abre `/herramientas`.
- [ ] En pantallas de mapa el menú cubre todo y trae su propio logo y fila de cierre; la flecha atrás vuelve de donde venía la persona (portada si se abrió directo).
- [ ] Panel Favoritos: fila hacia las empresas guardadas ("Mis listas") con el estilo de fila del panel.
- [ ] Reducir movimiento: instantáneo. Bandera apagada: menú de producción.

## 4. Categorías (`/categorias`, `/servicios` redirige 308 con directorio)

- [ ] Dos pestañas: **Servicios** y **Negocios**, fichas con foto (una foto por grupo, compartida con la portada).
- [ ] Ficha "Profesionales" con la cantidad de profesionales publicados; en teléfono abre los grupos de servicios.
- [ ] Páginas de grupo: iconito del grupo y chevron en cada fila de servicio.
- [ ] Comercios repartido: restaurantes, cafeterías, farmacias, gasolineras, súper, ferreterías, mercados, tiendas salen de Servicios y viven en Negocios; Pastelería/Repostería y Panadería van a Eventos; mascotas y papelería a Mascotas y Educación; grupo "Servicios para empresas".
- [ ] Negocios incluye: Restaurantes, Cafeterías, Bares, Farmacias, Gasolineras, Supermercados, Talleres, Belleza, Hospedaje, Parqueos, Lavacar, Atracciones, Tiendas, Centros comerciales, Mercados y carnicerías, Trámites, Educación, Transporte, Tours y museos.
- [ ] Cafés y bares: dos fichas (Cafeterías, Bares), misma sección filtrada, cada página con su título.
- [ ] Títulos `<sección> | ContrataCR`.
- [ ] Bandera apagada: `/servicios` con su lista de producción.

## 5. Secciones de negocios y mapa

- [ ] Secciones en el teléfono abren mapa primero (hoja plegada); tarjeta del pin con "abierto ahora", Llamar y Cómo llegar.
- [ ] Secciones solo-mapa en teléfono (sin tarjetas): sin hoja inferior; "Abierto ahora" flota sobre el mapa bajo la tarjeta de búsqueda. Restaurantes, Cafés y Belleza mantienen tarjetas.
- [ ] Mapa estilo Yelp: tarjeta flotante con menú de marca, buscador con la sección, botón lista/mapa que sigue la hoja; el mapa acerca/aleja al subir/bajar la hoja; barra más alta sobre el mapa y más delgada sobre la lista; "Buscar en esta zona" compacto.
- [ ] Resultados infinitos: se cargan 20 más al deslizar (esqueleto mientras carga); los pines de lo cargado se suman al mapa sin mover la cámara; nuevo filtro reinicia.
- [ ] Orden: "Mejor calificados" por defecto (el chip muestra el orden actual), "Más cercanos" pide ubicación, precio ordena donde hay precios. Secciones sin reseñas: "Más relevantes" por defecto.
- [ ] Chips: hoja de Ordenar, interruptores y menú de tipo; activos en azul de marca con check; hojas de chips abren desde un portal y siguen clicables; sin botón "Filtros" ni chip de provincia.
- [ ] Tarjeta de resultado: posición antes del nombre ("1. Soda …"), sin insignia; foto bajo el nombre; línea de estado tipo Maps; una fila de acciones (a lo más dos botones) con iconos de color de marca; marcador para guardar (sin sesión: login y vuelve).
- [ ] Orden de acciones: Reservar (si existe), Reseñar, WhatsApp, Llamar, Waze, Maps; profesionales: WhatsApp, Reseñar, Llamar. "Sitio web" solo en tarjetas de Hospedaje y Educación.
- [ ] Fila de acciones se desliza de lado sin pelear con el scroll de la lista; icono de Waze redondo.
- [ ] Sin pantalla de fotos si no hay foto: la tarjeta no usa avatar inventado; sin foto el número de posición va grande.
- [ ] Sin paginación manual; al cambiar filtros vuelve arriba.

Quitado:
- [ ] Sin insignia de rango, sin cita de reseña en la tarjeta, sin chip "24 horas", sin botón de lista en pantallas solo-mapa.

Casos límite:
- [ ] Sin teléfono ni WhatsApp: la tarjeta muestra solo lo que tiene.
- [ ] Reservas activas: Reservar primero.
- [ ] Nombres largos: tarjeta envuelve.
- [ ] Muchas sucursales: lista no ensancha el teléfono.
- [ ] Secciones sin reseñas (Trámites, Centros comerciales, Educación escuelas/colegios, Transporte terminales/aeropuertos): sin Reseñar ni estrellas ni "Mejor calificados".

## 6. Ficha de negocio `/lugar/<slug>` (pronto `/negocios`)

Estado actual (rediseño de producción-profesional, más reciente prevalece):
- [ ] Tarjeta de identidad como el perfil profesional: hero con fotos (teléfono: deslizar "1 / N", "Ver las N fotos"; desde sm mosaico); sin fotos: foto de sección con licencia libre difuminada bajo velo azul marino (nunca icono). Sin avatar si no hay foto real.
- [ ] Nombre, calificación, etiquetas, nivel de precio y estado abierto sobre el hero; línea gris "<nombre> · <dirección>" solo con dirección de calle.
- [ ] Fila de iconos centrada (sitio web, redes, Google Maps, Waze) con el estilo del perfil profesional.
- [ ] Pestañas (orden actual): **Menú/Precios · Reseñas · Fotos · Ubicación · Información**; abre en la primera. Sin pestaña Menú/Precios vacía cuando no hay menú ni ítem con precio.
- [ ] Ubicación: dirección simple (cada nombre una vez), botones iguales Google Maps y Waze en una línea ("Maps" bajo 360 px), mapa grande a pantalla completa (tocar o expandir; atrás/Esc cierra).
- [ ] Información: filas estilo "Mi panel" (bordes redondeados, icono, etiqueta de una línea, valor a la derecha, chevron): Acerca, Contacto (teléfono, WhatsApp, sitio web, cada red social), Horario, Comodidades, Reservas, Marca, Eventos, Sucursales. Al final: «Reclamar esta empresa · Gratis» y «Sugerir un cambio» (el formulario abre en `#reportar` y desde «…»).
- [ ] Reseñas: iguales al perfil profesional: «Reseñas (N)» resumen con barras 5→1; tarjeta «¿Ya visitó este lugar?» con cinco estrellas (media estrella) que abren el formulario; filas planas con separadores, iniciales, estrellas, fecha relativa, respuestas del dueño; «Reportar reseña».
- [ ] Barra inferior en teléfono: dos botones como el perfil profesional (WhatsApp verde, Llamar blanco). Con reservas: Reservar primero y luego WhatsApp/Llamar. Si falta WhatsApp o teléfono: aparece Reseñar en lugar de Cómo llegar. Texto envuelve, no se corta.
- [ ] «…» en teléfono (MenuFicha): Guardar, Compartir, Agregar fotos, Sugerir un cambio, Reportar.
- [ ] Encabezado de teléfono estable al recargar: sin salto "logo + ☰" a "← Restaurantes ···" (CLS = 0, probar con JavaScript apagado).
- [ ] Salir de la ficha (2026-11-27, iPhone): desde /restaurantes tocar una tarjeta → «← Volver» regresa a /restaurantes, también después de tocar enlaces internos (#fotos, #resenas) y de abrir y cerrar el mapa grande (flecha, Esc o atrás). La flecha atrás del navegador y el gesto de iOS también regresan. Abierta directo (enlace compartido): «Volver» va a la portada. Igual en el perfil profesional. (`tests/e2e/directory-back-navigation.spec.ts`)
- [ ] Columna lateral solo en escritorio (contacto y dirección); en teléfono no hay.
- [ ] «Negocios similares cerca»: los 10 más cercanos en carril con flechas, sin tarjeta "Ver más", sin separador.
- [ ] Redes sociales: `attributes.social` solo acepta el dominio propio de cada red; un "sitio web" que es realmente Facebook/Instagram se muestra como red.
- [ ] Sin pie de página del sitio en teléfonos.

Quitado:
- [ ] «No reclamado» (los no reclamados solo tienen la caja de reclamar al final).
- [ ] Apple Maps (tarjeta de mapa y selector de «Cómo llegar»).
- [ ] Pestaña/botón «Preguntar» (y «Más»).
- [ ] «¿Recomienda este lugar?».
- [ ] «Reseñar» en la tarjeta de identidad (vive solo dentro de Reseñas); chips «Waze» y «Maps» como texto; chip «Sitio web» en el hero.
- [ ] Línea de crédito de datos y enlace de reporte al final de la página (crédito ODbL ahora en Términos, "Origen de los datos"; el mapa mantiene su atribución).
- [ ] Pie del sitio en teléfonos; tarjeta «Ver más» en lugares similares; Guardar/Compartir/Agregar fotos sueltos en teléfono.

Casos límite:
- [ ] Sin foto: foto de sección difuminada; Fotos vacía invita a agregar (con confirmación de derechos).
- [ ] Sin teléfono ni WhatsApp: barra inferior Reseñar; sin fila Contacto vacía.
- [ ] Secciones sin reseñas (Trámites, Educación, Transporte, Centros comerciales): sin pestaña Reseñas, sin calificación, la API responde 403 `reviews_off`; caja de reclamar promete solo responder preguntas.
- [ ] Reservas activas, muchas sucursales (no ensanchar el teléfono), nombre y dirección largos (envolver).
- [ ] Lugar creado por el equipo, lugar importado sin horario.
- [ ] Reclamar: `/lugar/<slug>/reclamar` funciona sin sesión → login → vuelve.
- [ ] Bandera apagada: ruta no disponible.

## 7. Perfil profesional

Decisión del dueño 2026-11-26: el perfil es igual al de producción también con directorio encendido (los rediseños Airbnb/Thumbtack quedan apagados en el código).
- [ ] Encabezado: una sola foto, reseñas y años de experiencia, sin franja de portada ni píldora de casos; subtítulo cuenta servicios y zonas cuando son muchos.
- [ ] Contactos como producción: WhatsApp y Llamar; Reseñar solo dentro de Reseñas. Sin subtítulo genérico "Servicios ofrecidos"; cada tarjeta de servicio con foto.
- [ ] Reseñas: resumen con barras mientras el directorio está encendido.
- [ ] Franja de abajo (teléfono), profesional CON agenda: dos mitades iguales de 48 px, WhatsApp (verde) + «Agendar» (azul, icono de calendario); «Agendar» abre el mismo calendario de disponibilidad. (Reemplaza al botón único «Ver disponibilidad», que tapaba WhatsApp.)
- [ ] Franja de abajo (teléfono), SIN agenda: WhatsApp + Llamar como hoy (sin Llamar habilitado: WhatsApp a lo ancho).
- [ ] Mientras se consulta la agenda: se ve WhatsApp + Llamar (ya no "Consultando horarios…"), y al terminar Llamar cambia a «Agendar» sin salto de alto ni de posición. Una sola franja fija en todos los estados.
- [ ] Tarjeta lateral de computadora con agenda: WhatsApp + Llamar arriba y «Agendar» a lo ancho debajo; sin agenda, igual que antes.
- [ ] Perfil propio: «Agendar» aparece deshabilitado.
- [ ] «Profesionales similares cerca»: misma provincia primero, hasta 10, carril con flechas, texto sin cortar.
- [ ] Sin pie de página en teléfonos.
- [ ] Casos límite: sin foto de perfil, sin reseñas, nombre largo (medida de nombre igual bajo 360 px), muchos servicios y zonas.
- [ ] Bandera apagada: igual a producción.

## 8. Reseñas

- [ ] Perfil y lugar usan los mismos componentes (ReviewsSummary, LeaveReviewModal embebido, ReviewCard, ReviewsEmpty).
- [ ] Estrellas abren el formulario; el comentario aparece al elegir calificación; enviar actualiza la página.
- [ ] Respuestas del dueño con regla de marca; «Reportar reseña».
- [ ] Reseñas apagadas por sección/tipo (ver 6): botón, pestaña, estrellas y ruta ausentes/403.
- [ ] Fantasma: sin sesión pide login y vuelve a la reseña.

## 9. Fotos y almacenamiento (R2)

- [ ] Subida de fotos de lugar: el navegador reduce (1600/800/320 px WebP, JPEG si no puede) y manda la miniatura; EXIF se limpia (Safari incluido; HEIC se convierte y reintenta).
- [ ] Nuevas subidas van a Cloudflare R2 (binding `PLACE_PHOTOS`, bucket `contratacr-place-photos`); fotos viejas siguen en Supabase Storage (`photo_store` por foto, migración 538).
- [ ] Quitar foto propia borra los tres objetos del almacén correcto.
- [ ] El uploader pide confirmar que las fotos son propias o con permiso (no de Google Maps ni redes).
- [ ] Moderación igual: cola de fotos, retirada deja de servir (caché corta).
- [ ] Fotos de Commons: pie «Foto: autor · licencia · Wikimedia Commons» con enlaces a licencia y origen al abrir a pantalla completa; sin crédito en fotos subidas por personas. Fotos de Openverse quedan **pendientes** en la cola de moderación.
- [ ] Sin Cloudflare Images (el binding `images` se quitó); `images.unoptimized`.
- [ ] Casos: foto enorme, HEIC, foto vertical con EXIF (orientación 6 sale 1067x1600), sin red a mitad de subida, sin R2 en local (usa bucket `local-uploads`).
- [ ] Bandera apagada: subida de portafolio de profesionales sigue funcionando (1600 px WebP + miniatura 400 px).
- [ ] Vista de la calle (Mapillary, migración 543, `docs/directory-photos.md`): solo en lugares sin ninguna foto propia; rótulo "Vista de la calle" sobre la imagen y crédito "© <creador> · Mapillary · CC BY-SA 4.0" enlazado a la imagen en mapillary.com y a la licencia; nota "No es una foto del negocio". Tocar abre la vista grande (Esc cierra). Un lugar con foto propia nunca la muestra.
- [ ] Vista de la calle en tarjetas de resultados y en "Negocios similares cerca": imagen con rótulo y crédito en texto (sin enlace dentro de la tarjeta).
- [ ] `/api/vista-calle/<placeId>` responde 302 a la miniatura de Mapillary (caché 5 min), 404 para lugares sin vista o no publicados; nunca muestra el token; la URL se renueva después de 1 h.
- [ ] Script `scripts/directory/mapillary-streetview.mjs`: dry run por defecto, `--apply` guarda found/none, relanzarlo omite lo revisado en 90 días; máximo 5 consultas por segundo. En test/prod requiere `wrangler secret put MAPILLARY_CLIENT_TOKEN` y el OK de Isaac.

### Importar desde Instagram (2026-11-27, `docs/instagram-import.md`)

Bandera `INSTAGRAM_IMPORT_ENABLED` / `NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED`; en `next dev` se usa el simulador (sin cuenta real).
- [ ] Dueño de un negocio: ficha → "Agregar fotos" → botón "Importar desde Instagram" (solo administradores del negocio; un cliente no lo ve).
- [ ] Profesional: Casos de éxito → nuevo o editar caso → "Importar desde Instagram" bajo las fotos; "Elija hasta N fotos" con N = espacios libres del caso (un caso nuevo: 5). Sin espacios, el botón no aparece.
- [ ] Simulador: "Conectar Instagram" abre una ventana "Prueba local" → "Permitir" → la ventana se cierra y aparece la cuadrícula (8 fotos; el video no sale). "Cancelar" deja la hoja en "Conectar".
- [ ] Elegir hasta 10 (la undécima queda desactivada); "Importar seleccionadas" exige la casilla de derechos ("Son de mi propia cuenta de Instagram…"); resultado "Se agregaron N fotos." y las fotos aparecen en la ficha publicadas de inmediato.
- [ ] Duplicados: al reabrir, las ya importadas dicen "Ya importada" y no se pueden elegir; repetir la importación de una ya importada se omite ("N fotos ya estaban importadas y se omitieron"). Si se borró la foto del negocio, o el caso no se guardó, se puede volver a importar.
- [ ] "Desconectar Instagram" borra el token y la hoja vuelve a "Conectar su cuenta de Instagram (Empresa o Creador)".
- [ ] Ventana emergente bloqueada: la conexión sigue en la misma pestaña y vuelve a la pantalla de origen.
- [ ] Banderas apagadas: ningún botón de Instagram en la ficha ni en Casos de éxito; `/api/integrations/instagram/*` y `/integraciones/instagram/*` responden 404.
- [ ] Requiere la app real de Meta (pendiente, la crea Isaac): conexión con una cuenta Empresa/Creador real, revisión de `instagram_business_basic`, vencimiento del token a los 60 días (hoy pide reconectar), carrusel (solo se importa la portada).

## 10. Registro

- [ ] `/registro` con directorio encendido: la tarjeta Profesional pregunta «Profesional independiente» (formulario actual) o «Empresa o local».
- [ ] `/registro/empresa`: buscar por nombre un lugar publicado (`/api/negocio/buscar`); reclamar por `/lugar/<slug>/reclamar`; si no está: formulario de solicitud (cuenta primero) que crea un lugar en BORRADOR (no público, fuente owner).
- [ ] `/admin/directorio` pestaña «Lugares nuevos»: Publicar / Rechazar; historial con etiquetas «Lugar agregado / creado» para lugares del equipo.
- [ ] Al Publicar, quien pidió el lugar recibe la notificación «Su negocio ya está en ContrataCR» (abre `/lugar/<slug>/reclamar`) y un correo con «Reclamar mi negocio» (local: buzón simulado); al Rechazar, «Solicitud de negocio no aprobada» sin enlace. Repetir la decisión no avisa dos veces (migración 545).
- [ ] Bandera apagada: `/registro` enlaza directo a `/registro/profesional` y `/registro/empresa` no existe.
- [ ] Con directorio encendido, `/onboarding` (Google/Apple) y la bienvenida de la app («¿Cómo quiere empezar?») también preguntan «Profesional independiente» (→ `/registro/profesional`) o «Empresa o local» (onboarding: cuenta de cliente y luego `/registro/empresa`; app: `/registro/empresa`), con «Volver». Bandera apagada: «Ofrezco servicios» va directo como antes.
- [ ] Casos: nombre con varias palabras (búsqueda simple, la ranqueada daba timeout), nombre ya reclamado, enviar dos veces.
- [ ] «Mi negocio» tiene límite por cuenta.

## 11. Panel Pro / Herramientas

Todo tras `PRO_UI_ENABLED` (Pro lanza gratis primero). Pendiente de pasada completa; marcar por bloque:
- [ ] `/herramientas` (solo Pro): lista plana de herramientas agrupada por lo que la persona quiere hacer ("Consiga más clientes", "Organice sus trabajos", "Controle su plata", "Su negocio", "Consiga brete"), filas estilo "Mi panel" (icono contorno, nombre, chevron); cada sección abre su herramienta (sin sesión: login y vuelve); incluye CV y carta gratis.
- [ ] Barra inferior propia de Pro en teléfono (cabe «Cotizaciones» en 390 px), un solo botón atrás, encabezado de una fila; filtros y hojas quedan encima de la barra.
- [ ] Proyectos: lista con filtro multiestado + Aplicar, columnas ordenables, fijar, administradores, estados Kanban propios; `/proyectos` redirige a `/solicitudes`; enlaces viejos de trabajo (`?vistaTrabajo=`, `/summary`) redirigen de verdad.
- [ ] Finanzas: facturas, cotizaciones y órdenes de compra con vista de tabla, columnas elegibles y orden; tarjetas resumen y filtros; referencias de gastos automáticas; recibos y proveedores por enlace seguro.
- [ ] Prospectos (leads): tabla con tareas y administradores, importación CSV con mapeo, constructor de formulario de contacto público, perspectivas de marketing, fuentes agrupadas.
- [ ] Selecciones, planos y tableros de ideas, calendario con tipos de reunión, informes guardados, listas de correo, centro de ayuda (17 categorías).
- [ ] Teléfono: títulos largos envuelven, los botones de lista/cuadrícula no desbordan, el cuaderno de gastos y calendarios cierran al recargar.
- [ ] Atrás del navegador conserva ediciones sin guardar; sin sesión, enlaces de Pro piden login.
- [ ] Con Pro apagado nada de lo anterior aparece.

## 12. Datos OSM e importación

- [ ] Tras la importación: cada sección nueva muestra resultados correctos (Parqueos, Lavacar, Atracciones, Tiendas, Centros comerciales, Mercados y carnicerías, Trámites, Educación, Transporte, Hospedaje "por días", Tours y museos).
- [ ] Clasificación: parqueos privados o "solo clientes" fuera; lavacar con tipo "Lavado completo"; cabinas siguen como cabinas; `shop=yes/vacant`, iglesias, cementerios, canchas y salones comunales fuera.
- [ ] Teléfono con +506 normalizado y WhatsApp conservados; redes (facebook/instagram/tiktok/…) conservadas; correo, sitio web y horario de OSM.
- [ ] Atracciones reclasificadas desde tours (`dir_import_reclassify`).
- [ ] Admin, Fotos: el origen dice «Sugerida automáticamente (Openverse)» o «Wikimedia Commons» según la foto; «Del negocio» y «De una persona usuaria» solo para fotos subidas.
- [ ] Limpieza de clasificación (2026-11-27, `osm-reclassify-cleanup.mjs`, simulacro por defecto, `--apply`): sin depósitos aduaneros/almacenes fiscales («TICA A…», «A169 - DEPOSITO ADUANERO…») en Supermercados, sin couriers privados (DHL, Jet Box, Aeropost) en Trámites, sin oficentros en Centros comerciales, sin colegios profesionales en Educación; «Bodega de pescaderia» en Mercados, «Bazar …» y mayoristas de muebles en Tiendas. Local: 107 ocultos, 11 movidos; relanzar no cambia nada.
- [ ] Filtro `--inside-only`: nada fuera de las provincias (frontera).
- [ ] Muestreo: nombres genéricos descartados; duplicados; direcciones vacías.
- [ ] Fotos libres (docs/directory-photos.md, migraciones 540 y 541): `commons-photos.mjs` pone foto activa a lugares con etiqueta OSM `wikimedia_commons`/`image` de Commons o `wikidata` (P18), solo CC0, dominio público, CC BY y CC BY-SA, con autor y licencia guardados; `openverse-photos.mjs` solo sugiere: la foto queda **pendiente** en Admin, Fotos (con nota «Sugerida automáticamente (Openverse) — verificar que sea el lugar» y enlace a la fuente), y se publica solo si se aprueba. Probar: aprobar y rechazar una sugerida, ver su crédito, repetir el script (no duplica).
- [ ] Términos 13.1 y `/como-ordenamos` listan las secciones nuevas y explican las sin reseñas; «Origen de los datos» enlaza © OpenStreetMap y la licencia ODbL.

## 13. Cloudflare / infra

- [ ] Worker con binding R2 `PLACE_PHOTOS`: despliegue de test y producción no falla.
- [ ] Regla de caché de Cloudflare y regla de ciclo de vida del bucket: hechas 2026-11-27 (verificar que fotos se sirven con caché y no se rompe la moderación).
- [ ] Sin Cloudflare Images: ninguna imagen depende de él.
- [ ] Cron del Worker (resumen horario de Pro, recordatorios) corre.
- [ ] Previsualizaciones de enlaces: una sola tarjeta de marca, logo único (`og-logos` íntegros).
- [ ] Aviso de cookies compacto (~30 % del iPhone), un botón Continuar, X.

## Pendiente de activar / requiere a Isaac

- [ ] App de Instagram en Meta (para el enlace de redes / campañas).
- [ ] Migraciones 536–541 (y las siguientes) aplicadas en test y luego en producción: 536 parqueos/lavacar/lugares del equipo, 537 secciones nuevas, 538 R2, 539 redes sociales, 540 fotos Commons, 541 Openverse. Orden y sin saltos; aplicarlas antes de desplegar el código.
- [ ] Importación OSM en test (convertidor `osm-pbf-to-json.py` + `stage-import --inside-only`), luego respaldo de contactos (`backfill-contacts.mjs`) y fotos de Commons (`commons-photos.mjs --apply`; Openverse solo a cola pendiente). Siempre local primero.
- [ ] Caso de reembolso Cloudflare #02455540: pendiente de respuesta.
- [ ] Hechos 2026-11-27: regla de caché de Cloudflare y regla de ciclo de vida del bucket.
- [ ] Confirmar la decisión de portada: `d70c4261d` dejó test con la portada de producción; después se reintrodujeron bloques de directorio (hero, categorías, mapa de provincias). Definir cuál queda y reescribir la sección 1.
- [ ] Nada de directorio/Pro/Yelp a `main` ni a producción sin visto bueno de Isaac (en `main` fueron revertidos 2026-11-19).
- [ ] Renombrar `/lugar` a `/negocios` (con redirecciones) cuando se decida.
- [ ] Marca: se queda ContrataCR; después ContrataLatam / Contrata<país>.

## Retirado (no esperar verlo)

- Barra inferior de 5 pestañas estilo Yelp (Buscar, Proyectos, Asistente, Mis listas, Yo) y la pantalla de inicio de app móvil: retiradas en `d70c4261d`; la barra inferior de test es la de producción.
- «Negocios» como nombre único: el directorio dice «Empresas» en unos lugares y «Negocios» en pestañas/botones; revisar consistencia de vocabulario en cada pantalla.

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
- [ ] Con directorio apagado `/categorias`, `/negocios/...`, `/registro/empresa`, `/herramientas` no existen (404 o redirección).
- [ ] Con Pro apagado no aparece nada de Herramientas/Pro en menú ni enlaces.

Pie de página del sitio (regla 2026-11-27, la misma de `FooterSoloWeb` en producción):
- [ ] Páginas de contenido con pie en teléfono y computadora: portada, Cómo funciona, Ayuda, ContrataCR Pro, Mejorar mi perfil, Verificación de identidad, Términos, Privacidad, `/como-ordenamos`.
- [ ] Pantallas de uso sin pie en teléfono y con pie desde lg: `/categorias`, `/precios`, `/resena-google` (solo con directorio; en producción igual que hoy), `/herramientas`, `/solicitudes`, `/promociones`, `/empleos`, `/registro/empresa`, panel profesional, `/listas`, `/mis-reservas`, `/yo`, `/eventos`, `/inmuebles`, `/vehiculos`, `/marca/...`, `/reserva/...`, `/lista/...`, login, registro, soporte, notificaciones.
- [ ] Nunca pie en teléfono: ficha de negocio (y su menú y reclamar), perfil profesional, secciones de negocios y `/buscar` (lista y mapa), mensajes. Sin pie en ninguna medida: `/publicar-solicitud`, `/cotizar`, `/asistente`, paneles. En la app nativa nunca hay pie.

Listas de opciones (regla 2026-11-27):
- [ ] Toda fila de opciones al estilo «Mi panel» lleva ícono de contorno gris (#52627a) a la izquierda y flecha a la derecha: Mi panel, Herramientas (grupos y herramientas), pestaña Información de un negocio (Contacto, Reclamar, Sugerir un cambio). Las listas de contenido (solicitudes, negocios) no llevan ícono de fila: llevan foto, ícono mejorado de la sección o solo texto.
- [ ] `/solicitudes` (hub de Proyectos en teléfono): el título que aparece en la barra al desplazar mide 19px como toda cabecera (`cabeceras.spec.ts`).
- [ ] Sin texto cortado en Herramientas ni en la lista de solicitudes de `/solicitudes` (títulos largos envuelven).

Texto:
- [ ] Ningún texto truncado con "…" (nombres largos, direcciones, tarjetas, barra inferior, "Mejor calificados", negocios similares): envuelve en varias líneas.
- [ ] Español de Costa Rica, trato de usted, sin jerga; lo mismo en inglés.

Pantallas hijas en el teléfono (regla del dueño 2026-11-27, `tests/e2e/pro-child-screen-headers.spec.ts`):
- [ ] Una pantalla hija (detalle, paso, categoría) dice su propio nombre en la barra con flecha, «← Título», sin logo ni ☰; sin «Volver»/«← Sección» dentro de la página ni título repetido debajo. Las raíces (Inicio, Herramientas, Mi panel, Categorías) conservan «[logo] Título». En computadora puede seguir el enlace de volver dentro de la página.
- [ ] La flecha vuelve a la pantalla de la que se vino; abierta directo (enlace compartido, recarga), va a la pantalla madre.
- [ ] `/registro/empresa`: «← Agregar mi empresa» (madre: `/registro?paso=profesional`); sin «Volver» ni el título grande en el teléfono.
- [ ] `/marca/<slug>`: «← Marca» (sin historial: portada); la ruta «Inicio › Marcas › …» solo desde lg.
- [ ] `/precios?categoria=…`: «← Granos» (el nombre de la categoría; madre: `/precios` con los mismos filtros); `/precios?producto=…`: «← Producto» (madre: la lista o la búsqueda de la que vino). Sin «← Todas las categorías» / «← Productos» ni el título «Comparar precios» en el teléfono. `/precios` y la búsqueda (`?q=`) siguen con la barra del sitio.
- [ ] `/registro?paso=profesional` («¿Cómo ofrece sus servicios?»): «← Ofrezco servicios», la flecha vuelve a «¿Cómo quiere empezar?»; el «Volver» de la página solo desde lg.
- [ ] Con directorio apagado, login, `/registro` (elegir tipo) y `/olvide-contrasena` se ven como en producción. Las pantallas de abajo cambian TAMBIÉN en producción (dueño 2026-11-27, «Dale»; sin subir hasta su visto bueno).
- [ ] `/soporte`: «← Soporte» en la barra también en la web (sin parpadeo); con sesión la flecha vuelve, o sin historial a Mi panel › Soporte; sin sesión, a la portada. «Volver al panel» solo desde lg.
- [ ] `/empleos/mis-empleos` y `/promociones/mis-promociones`: «← Mis empleos» / «← Mis promociones» en la web; la flecha y el título de la página solo desde lg; la primera fila ya no queda debajo de la barra (también en computadora).
- [ ] Empleo cerrado `/empleos/<id>`: barra «← Empleo» como un empleo publicado, sin el enlace «← Ver todos los empleos» dentro de la página; la flecha vuelve a la lista de origen.
- [ ] Perfil propio en vista previa (`?preview=1`): «← Vista previa», vuelve a Mi panel; el botón «Volver a mi panel» solo desde lg.
- [ ] `/registro/cliente` y `/registro/profesional` sin sesión: «← Cuenta de cliente» / «← Cuenta profesional» (vuelven a elegir el tipo de cuenta: historial o `/registro`, con directorio `/registro?paso=profesional`), el código de correo «← Verificar correo» (vuelve al formulario); el título grande de la tarjeta y el «Atrás» de abajo solo desde lg. La X queda solo en el login pedido por una sección.
- [ ] `/onboarding` con directorio: «Ofrezco servicios» abre el paso «← Ofrezco servicios» en la barra; «Volver» de la página solo desde lg.
- [ ] Sin cambio (ya cumplían): conversación de Mensajes y caso de Soporte en el panel (su propia cabecera «← nombre/asunto», la barra del sitio se oculta), editor de CV («‹ Mis currículums» ya era solo de computadora; «Atrás» abajo es el paso anterior del asistente).
- [ ] App nativa: sin barra de abajo en `/registro/*`, `/olvide-contrasena` y en `/login?redirect=…` (antes y después de hidratar; `rutas-sin-barra.ts` y el script de arranque de `layout.tsx` iguales, lo vigila `validate-mobile-native-config.mjs`). `/login` abierto desde el menú conserva la barra.

Fotos e íconos de secciones, grupos y servicios (regla de Isaac 2026-11-27, tabla en `docs/section-visuals.md`):
- [ ] Una sección, variante, grupo o servicio muestra SIEMPRE la misma foto y el mismo ícono: hero, "Categorías más buscadas", "Lo más buscado", `/categorias` (Servicios y Negocios), hoja de búsqueda, sugerencias, menú y cajón, "Busque en su provincia", `/precios`, `/solicitudes`, avatar de un negocio sin foto. Revisar al menos Talleres, Restaurantes, Farmacias, Belleza, Salud y Educación (mismo nombre en Servicios y Negocios = misma foto y mismo ícono).
- [ ] Los íconos van en el círculo "mejorado" de producción, el de la fila Profesionales · Negocios · Solicitudes · Promociones · Empleos: degradado celeste suave `.ccr-caja-icono` con dibujo azul marino; el elegido, degradado azul con dibujo blanco. Cambia el tamaño, nunca el dibujo.
- [ ] `node scripts/verify-section-visuals.mjs` pasa: sin URLs de Unsplash ni mapas de íconos por pantalla, y ningún nombre con dos fotos o dos íconos.

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
- [ ] "Mejor calificados" y el feed de la portada sin foto (2026-11-27): un negocio muestra el ícono mejorado de su sección y un profesional el de su servicio (`SectionIcon` / `CategoryIcon`), centrado sobre el fondo celeste; nunca una inicial. Con foto real, igual que antes.
- [ ] Título largo de diapositiva en 360 px.
- [ ] Producción (bandera apagada): portada sin cambios.

## 2. Navbar y búsqueda

Comportamiento actual:
- [ ] Navbar de teléfono = el de producción; en pantallas de búsqueda y mapas aparece una tarjeta flotante (con márgenes iguales, nunca sticky) detrás de `PHONE_DIRECTORY_HEADER`.
- [ ] Pista del buscador rota: "Encuentre los mejores …" con la palabra final cambiante (profesionales, restaurantes, farmacias, atracciones, tiendas…); nada se mueve a la derecha de la palabra.
- [ ] Pastilla de búsqueda sin sombra; lupa oscura simple.
- [ ] Hoja de búsqueda: "Profesionales" y "Lugares/Negocios", seis de cada uno y enlace "Ver todos los servicios" / "Ver todos los negocios" que abren las dos pestañas de Categorías; ambas visibles sin scroll.
- [ ] Vacío: chips de Profesionales y luego de Empresas; al escribir, sugerencias agrupadas (Profesionales / Empresas, "Ver en el mapa").
- [ ] "Recientes": solo perfiles y negocios abiertos (no búsquedas escritas); la ficha de un lugar registra la visita Con la bandera apagada vuelven las búsquedas escritas, como en producción (2026-11-27).
- [ ] Sin nada que buscar y sin lugar: se enfoca el primer campo en vez de buscar (solo con directorio; con la bandera apagada busca todos los profesionales como en producción, 2026-11-27).
- [ ] Al abrir la hoja se oculta la fila del encabezado (teclado de iPhone no deja ver la tarjeta flotante).
- [ ] Filtros: solo idiomas y aseguradoras con profesionales publicados; "otro idioma/aseguradora" libre.
- [ ] Tarjeta de lugar en la búsqueda: solo el nombre buscado, con marca corta si cubre país/provincia.

Quitado:
- [ ] Sin botón de voz/micrófono; sin chip "Cerca de mí" como filtro (es la ubicación del buscador); sin chip "24 horas".

Dispositivos/límites:
- [ ] iPhone con teclado abierto: la tarjeta flotante no asoma.
- [ ] Sin parpadeo al entrar a `/buscar` o a una sección (2026-11-27, iPhone): el mapa, la hoja de resultados y la tarjeta flotante quedan donde salen en el primer cuadro (antes todo subía 124 px al hidratar); con Pro, las tarjetas pintan WhatsApp/Llamar desde el servidor en vez de «Consultando horarios…» (solo un profesional con agenda cambia a «Ver disponibilidad»). Cubierto por `tests/e2e/search-first-paint-stable.spec.ts`. También al llegar desde el buscador de la portada a una búsqueda que abre la hoja extendida (`/profesionales/plomeria/alajuela`): la hoja ya no baja 30 px después de llegar. Pendiente en la app nativa: en `/restaurantes` la hoja todavía se reacomoda (~60 px) justo cuando se quita la portada de carga.
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
- [ ] Reducir movimiento: instantáneo. Bandera apagada: menú de producción (entra deslizando desde la derecha). La cortina solo existe con el directorio encendido (`data-menu-cortina`, 2026-11-27: antes el CSS de la cortina no dependía de la bandera y habría llegado a producción).

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
- [ ] Hojas de los chips de resultados en el teléfono (Ordenar, Precio, Filtros): se abren completas sobre la pantalla (2026-11-27: antes quedaban debajo del borde por el transform de la hoja de resultados y solo se veía el fondo oscuro).
- [ ] Chips: hoja de Ordenar, interruptores y menú de tipo; activos en azul de marca con check; hojas de chips abren desde un portal y siguen clicables; en teléfono sin botón "Filtros" ni chip de provincia (`0bc09b683`): el rango de precio y la provincia solo se aplican desde la dirección (`?priceMax=`, `?province=`) o, en computadora, desde «Filtros».
- [ ] Tarjeta de resultado: posición antes del nombre ("1. Soda …"), sin insignia; foto bajo el nombre; línea de estado tipo Maps; una fila de acciones (a lo más dos botones) con iconos de color de marca; marcador para guardar (sin sesión: login y vuelve).
- [ ] Orden de acciones: Reservar (si existe), Reseñar, WhatsApp, Llamar, Waze, Maps; profesionales: WhatsApp, Reseñar, Llamar. "Sitio web" solo en tarjetas de Hospedaje y Educación.
- [ ] Fila de acciones se desliza de lado sin pelear con el scroll de la lista; icono de Waze redondo.
- [ ] Sin pantalla de fotos si no hay foto: la tarjeta no usa avatar inventado; sin foto el número de posición va grande.
- [ ] Sin paginación manual; al cambiar filtros vuelve arriba.
- [ ] Tarjetas de resultado sin foto propia (2026-11-27): ícono mejorado de su sección a la izquierda del nombre, mismo tamaño en todas; con foto, la foto. Los negocios similares de la ficha siguen como tarjetas de texto.
- [ ] Tarjetas de resultado sin chip de permiso (2026-11-27): «Permiso de funcionamiento verificado» / «Permiso sin verificar» / «Habilitación…» solo en la ficha del negocio (Información).
- [ ] Sin enlace «Ver también profesionales de este rubro» en ninguna sección (2026-11-27).
- [ ] El sello de verificado es del mismo azul #009FD9 en tarjetas, ficha del negocio, marca y perfil profesional (2026-11-27).
- [ ] Hoja «Cómo llegar»: los tres íconos (Ver en el mapa, Waze, Google Maps) en azul marino, mismo tamaño (2026-11-27).
- [ ] Filtros por sección (2026-11-27, migración 546, `src/lib/directory/section-filters.ts`): Restaurantes «Tipo de comida» (`?cuisine=pizza`), «Sodas» (`?soda=1`), «Acepta reservas» (`?reservations=1`, solo negocios reclamados con reservas activas); Bancos «Banco» (`?brand=bcr`) y «Con cajero» (`?atm=1`, incluye cajeros sueltos); Gasolineras «Marca» (`?brand=delta`, sin filtro de precio: ARESEP); Supermercados «Cadena» (`?brand=auto-mercado`); Salud «CCSS» y Educación «Pública (MEP)» (`?public=1`); Hospedaje y las demás conservan «Tipo». Cada filtro devuelve solo lugares que cumplen.
- [ ] Listas de valores (cocinas, bancos, marcas, cadenas) salen de los datos, ordenadas por cantidad, con etiqueta en español (en /en, en inglés); valores con menos de 5 lugares no aparecen (si vienen en la dirección, se muestran igual para poder quitarlos).
- [ ] «Abierto ahora» solo aparece en secciones donde al menos el 30 % de los lugares (y 20 o más) tiene horario (`dir_section_filter_stats`, caché de 10 min). Con los datos locales de hoy ninguna sección llega (máximo Bancos 15,5 %): el chip y la píldora flotante del mapa no se muestran; `?openNow=1` sigue funcionando y entonces el chip aparece activo para quitarlo.
- [ ] Filtro que no corresponde a la sección (`/bancos?cuisine=pizza`) muestra «Revise los filtros e intente de nuevo», sin error de página. Vacío con «Abierto ahora» y otro filtro: botón «Quitar "Abierto ahora"» además de «Limpiar filtros».
- [ ] Filtros nuevos se conservan en la dirección, al recargar, con Atrás, al cargar más resultados (desplazamiento infinito) y al aplicar el formulario «Filtros» de computadora (campos ocultos).
- [ ] Chips en teléfono (390 y 360 px): fila que se desliza de lado, cada etiqueta completa, sin «…».
- [ ] Prueba automática `tests/e2e/pro-dir-filters.spec.ts` (local Pro): cada filtro devuelve solo lo que cumple (API con datos reales y lugares sintéticos), vacío amable, combinaciones con «Abierto ahora» y «Más cercanos», dirección tras recargar y Atrás, chips a 390/360 px (capturas en `~/dl/out-filters`), directorio apagado. 2026-11-27: 12/12 dos veces (computadora y teléfono).

Quitado:
- [ ] Sin insignia de rango, sin cita de reseña en la tarjeta, sin chip "24 horas", sin botón de lista en pantallas solo-mapa.

Casos límite:
- [ ] Sin teléfono ni WhatsApp: la tarjeta muestra solo lo que tiene.
- [ ] Reservas activas: Reservar primero.
- [ ] Nombres largos: tarjeta envuelve.
- [ ] Muchas sucursales: lista no ensancha el teléfono.
- [ ] Secciones sin reseñas (Trámites, Centros comerciales, Educación escuelas/colegios, Transporte terminales/aeropuertos): sin Reseñar ni estrellas ni "Mejor calificados".

## 6. Ficha de negocio `/negocios/<slug>`

Estado actual (rediseño de producción-profesional, más reciente prevalece):
- [ ] Tarjeta de identidad como el perfil profesional (sin hero ni tira de fotos desde `1df672a1f`): avatar redondo con la primera foto aprobada, que lleva a Fotos. Sin foto real: sin avatar (nunca icono, ficha de sección ni foto de stock).
- [ ] El avatar redondo de la ficha usa la misma ruta que la galería (`/api/fotos-lugar/<id>?s=320`): se ve también en local, no solo en producción.
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
- [ ] «Negocios similares cerca» sin foto real: tarjeta solo de texto (sin degradado ni inicial); a menos de 100 m la distancia dice «muy cerca» (`6ac114902`).
- [ ] Teléfono con reservas: Reservar encabeza la barra inferior y no se repite como chip en la tarjeta de identidad (desde lg el chip sí aparece) (`6ac114902`).
- [ ] Redes sociales: `attributes.social` solo acepta el dominio propio de cada red; un "sitio web" que es realmente Facebook/Instagram se muestra como red.
- [ ] Sin pie de página del sitio en teléfonos.
- [ ] Avatar sin foto real (2026-11-27, prevalece sobre «sin avatar»): círculo celeste #EBF5FB con el ícono de la sección en azul de marca, el estilo mejorado de producción y del tamaño del avatar del perfil (`PlaceSectionAvatar`, `src/components/directory/place-section-avatar.tsx`, ícono de `DIRECTORY_SECTION_ICONS`); con foto real, la foto. Siempre exactamente un avatar.
- [ ] Fotos con 2 o más: la pestaña Fotos las muestra como los «Casos de éxito» del perfil profesional de producción (tarjetas redondeadas de a tres fotos: portada 16:10 con marca de ampliar, las otras asomadas en miniatura, leyenda completa debajo; una por fila en teléfono, dos desde sm); cada foto abre la vista grande. Con una sola foto: el avatar y la cuadrícula de siempre.
- [ ] Reclamar `/negocios/<slug>/reclamar` (2026-11-27): sin la línea «No puede pagar para salir primero ni borrar reseñas»; en teléfono sin pie del sitio y con la barra «← Reclamar negocio» del encabezado (pintada por el servidor, sin salto) que vuelve a la ficha; el enlace «Volver a la ficha» solo queda desde lg. Avatar de la tarjeta = ícono mejorado de la sección.
- [ ] Menú `/negocios/<slug>/menu` (2026-11-27): en teléfono sin pie del sitio y con la barra «← Menú» que vuelve a la ficha; el enlace «← <negocio>» solo queda desde lg.

Quitado:
- [ ] «No reclamado» (los no reclamados solo tienen la caja de reclamar al final).
- [ ] Apple Maps (tarjeta de mapa y selector de «Cómo llegar»).
- [ ] Pestaña/botón «Preguntar» (y «Más»). La API `/api/lugar/<slug>/preguntas`, la cola «Preguntas» de `/admin/directorio` y la moderación siguen activas (`tests/e2e/pro-dir-questions.spec.ts` las prueba por API); nada de preguntas se ve en la ficha y la ficha ya no pide los datos de preguntas (2026-11-27).
- [ ] «¿Recomienda este lugar?».
- [ ] «Reseñar» en la tarjeta de identidad (vive solo dentro de Reseñas); chips «Waze» y «Maps» como texto; chip «Sitio web» en el hero.
- [ ] Línea de crédito de datos y enlace de reporte al final de la página (crédito ODbL ahora en Términos, "Origen de los datos"; el mapa mantiene su atribución).
- [ ] Pie del sitio en teléfonos; tarjeta «Ver más» en lugares similares; Guardar/Compartir/Agregar fotos sueltos en teléfono.

Casos límite:
- [ ] Sin foto: sin avatar y sin foto de sección; Fotos vacía invita a agregar (con confirmación de derechos).
- [ ] Sin teléfono ni WhatsApp: barra inferior Reseñar; sin fila Contacto vacía.
- [ ] Secciones sin reseñas (Trámites, Educación, Transporte, Centros comerciales): sin pestaña Reseñas, sin calificación, la API responde 403 `reviews_off`; caja de reclamar promete solo responder preguntas.
- [ ] Reservas activas, muchas sucursales (no ensanchar el teléfono), nombre y dirección largos (envolver).
- [ ] Lugar creado por el equipo, lugar importado sin horario.
- [ ] Reclamar: `/negocios/<slug>/reclamar` funciona sin sesión → login → vuelve.
- [ ] Dirección de la ficha (2026-11-27): `/negocios/<slug>` (y `/menu`, `/reclamar`; en inglés `/en/negocios/...`). Las direcciones viejas `/lugar/...` y `/en/lugar/...` redirigen con 308 a `/negocios/...` conservando parámetros y `#`; con el directorio apagado ambas responden 404. Tarjetas, sitemap, canonical, JSON-LD, compartir y avisos usan `/negocios/`.
- [ ] Bandera apagada: ruta no disponible.
- [ ] Asistente del directorio (`/asistente`, 2026-11-28): el historial de conversaciones queda solo en esta pestaña (se pierde al cerrarla) y se borra al cerrar sesión; una copia vieja del almacenamiento permanente se descarta al abrirlo. «Mis listas»: el número de «He estado» ya no se guarda en el navegador (se lee de la cuenta).

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
- [ ] **Apagada desde `2ab082a33` (dueño 2026-11-27: «fotos de los negocios o nada», `STREET_VIEW_ENABLED=false`):** ninguna tarjeta, negocio similar ni ficha muestra vista de la calle. Lo siguiente queda para si se vuelve a encender. Vista de la calle (Mapillary, migración 543, `docs/directory-photos.md`): solo en lugares sin ninguna foto propia; rótulo "Vista de la calle" sobre la imagen y crédito "© <creador> · Mapillary · CC BY-SA 4.0" enlazado a la imagen en mapillary.com y a la licencia; nota "No es una foto del negocio". Tocar abre la vista grande (Esc cierra). Un lugar con foto propia nunca la muestra.
- [ ] Vista de la calle en tarjetas de resultados y en "Negocios similares cerca": imagen con rótulo y crédito en texto (sin enlace dentro de la tarjeta).
- [ ] `/api/vista-calle/<placeId>` responde 404 siempre mientras `STREET_VIEW_ENABLED` esté apagado (2026-11-27). Si se vuelve a encender: 302 a la miniatura de Mapillary (caché 5 min), 404 para un id inválido, lugares sin vista o no publicados (`pro-dir-photos.spec.ts` prueba los 404); nunca muestra el token; la URL se renueva después de 1 h.
- [ ] Script `scripts/directory/mapillary-streetview.mjs`: dry run por defecto, `--apply` guarda found/none, relanzarlo omite lo revisado en 90 días; máximo 5 consultas por segundo. En test/prod requiere `wrangler secret put MAPILLARY_CLIENT_TOKEN` y el OK de Isaac.

### Fotos y menús de los clientes (2026-11-27, migración 547, modelo Google Maps / Yelp; `tests/e2e/pro-dir-user-photos.spec.ts`)

- [ ] «Agregar fotos» pregunta «¿Qué muestra la foto?»: restaurantes, sodas, cafés, bares, panaderías, heladerías: Menú, Comida y bebida, Interior, Exterior, Otro; otras secciones (bancos, talleres, belleza…): Productos y servicio, Interior, Exterior, Otro (sin Menú). Sin categoría o sin la casilla de derechos, «Subir fotos» queda desactivado. La categoría elegida se mantiene para la siguiente tanda.
- [ ] La foto de un cliente queda pendiente; al aprobarla en la cola aparece en Fotos. Fotos de reseñas y de Instagram pueden no tener categoría (solo salen en «Todas»).
- [ ] Pestaña Fotos siempre presente en un negocio publicado. Vacía: «Sea el primero en agregar fotos» + «Agregar fotos» y, en lugares de comida, «Agregar foto del menú» (abre el panel con Menú elegido). Sin sesión, ambos llevan al login.
- [ ] Con fotos de 2 o más categorías: filtros «Todas (N)», «Menú (n)», «Interior (n)»…; el filtro cambia la galería. Debajo, «Agregar fotos» (y «Agregar foto del menú» si aún no hay fotos del menú).
- [ ] Foto a pantalla completa: «Foto de <nombre del perfil>» (el mismo nombre de sus reseñas) en fotos de clientes, «Foto del negocio» en las del dueño; Commons/Openverse siguen con su crédito. «Reportar foto» sigue igual.
- [ ] Fotos de Menú aprobadas abren la pestaña «Menú» con «Menú (fotos de clientes)» aunque no haya menú escrito; aviso «Los precios pueden haber cambiado». Una foto de menú nunca es la portada, el avatar ni la foto de la tarjeta si hay otra foto.
- [ ] «Ver menú» externo (solo mientras ContrataCR NO tiene menú: sin menú escrito ni fotos de menú aprobadas): pestaña «Menú» con «Este negocio aún no tiene su menú en ContrataCR» y botón «Ver menú en su sitio web | Instagram | Facebook | Google Maps» (orden: enlace al menú de OSM, sitio web, Instagram, Facebook, búsqueda de Google Maps por nombre y zona). Abre otra pestaña, `rel="noopener noreferrer nofollow"`, nada se copia ni se incrusta. Además «Agregar foto del menú» y, para el dueño, «Suba su menú». Al aprobarse una foto de menú o publicarse el menú, el enlace externo desaparece.
- [ ] Otras secciones (belleza, talleres, lavacar…): pestaña «Precios» con «Ver precios en su sitio web» SOLO si el lugar tiene un enlace real a su lista de precios (`attributes.menuUrl`); hoy ninguno lo tiene. Bancos: sin pestaña.
- [ ] Datos locales: `scripts/directory/backfill-menu-links.mjs` (dry run por defecto, `--apply`) guardó 21 enlaces de menú de OSM (14 restaurantes, 7 cafés). Fuente del botón en lugares de comida publicados: menú 21, sitio web 393, Instagram 12, Facebook 36, Google Maps 10 147.
- [ ] Reseña enviada sin fotos: tarjeta «Gracias por su reseña. ¿Tiene fotos? Agréguelas» con el panel de fotos. Reseña con fotos adjuntas: no aparece; las fotos quedan pendientes y ligadas a la reseña.
- [ ] `/yo`: el nombre de la persona y los nombres de negocios (tarjetas de experiencia, Vistos recientemente) se ajustan en varias líneas, sin «…».
- [ ] `/yo` → Impacto → Fotos: lista de sus últimas 12 fotos con el negocio y el estado («Publicada», «Pendiente de revisión», «No publicada»; las pendientes sin miniatura). El contador de fotos cuenta solo las publicadas.
- [ ] Contra copias: `/api/fotos-lugar/<id>` responde 403 (sin caché) si la pide otra web (Referer ajeno); sin Referer (WhatsApp/Facebook al leer og:image, correo, app) o desde nuestro dominio, 200. Las imágenes no se pueden arrastrar (`draggable=false`); el clic derecho y la accesibilidad no cambian. Solo se guardan derivados (1600/800/320 px, sin EXIF/GPS); el original nunca se guarda.
- [ ] Términos §10 (solo con directorio encendido, ES/EN): las fotos y reseñas son de quien las sube y ContrataCR tiene licencia para mostrarlas; prohibido copiar, descargar en masa o hacer scraping; «Reportar uso indebido»: «Reportar foto» o soporte@contratacr.com. Con directorio apagado, Términos igual a producción.
- [ ] 390 y 360 px: el panel, los filtros, el botón «Ver menú en …» y el nombre de archivo largo se ajustan en varias líneas, sin «…».
- [ ] «¿Sabe si este lugar…?» (migración 548): una tarjeta en «Información» y otra tras enviar una reseña, con una pregunta a la vez (Sí / No / No sé); tras responder dice «Gracias…» y pasa a la siguiente. Sin sesión, los botones llevan al login. El administrador del negocio no la ve.
- [ ] Preguntas por sección: restaurantes y cafés (reservas, a domicilio, para llevar, SINPE, parqueo, wifi, terraza, vegetarianas, mascotas, silla de ruedas); hospedaje (wifi, parqueo, piscina, desayuno, mascotas, SINPE, silla de ruedas); belleza (cita previa, SINPE, parqueo, silla de ruedas); tiendas y farmacias (SINPE, a domicilio, parqueo, silla de ruedas); bancos, salud, gobierno, educación (parqueo, silla de ruedas). Nunca pregunta lo que el negocio ya tiene guardado, lo ya confirmado ni lo que la persona ya respondió.
- [ ] Con 3 o más respuestas Sí/No y al menos 75 % de acuerdo («No sé» no cuenta), un «Sí» aparece en «Comodidades y más» con la etiqueta «Según clientes». El valor del negocio o del equipo siempre gana; un «No» confirmado deja de preguntarse pero no se muestra. No afecta los filtros de búsqueda (pendiente: haría falta una columna agregada en la búsqueda).
- [ ] Límites: una respuesta por persona y pregunta (cambiarla la reemplaza), 60 por día, 30 por minuto por IP.

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
- [ ] `/registro/empresa`: buscar por nombre un lugar publicado (`/api/negocio/buscar`); reclamar por `/negocios/<slug>/reclamar`; si no está: formulario de solicitud (cuenta primero) que crea un lugar en BORRADOR (no público, fuente owner).
- [ ] `/admin/directorio` pestaña «Lugares nuevos»: Publicar / Rechazar; historial con etiquetas «Lugar agregado / creado» para lugares del equipo.
- [ ] Al Publicar, quien pidió el lugar recibe la notificación «Su negocio ya está en ContrataCR» (abre `/negocios/<slug>/reclamar`) y un correo con «Reclamar mi negocio» (local: buzón simulado); al Rechazar, «Solicitud de negocio no aprobada» sin enlace. Repetir la decisión no avisa dos veces (migración 545).
- [ ] Bandera apagada: `/registro` enlaza directo a `/registro/profesional` y `/registro/empresa` no existe.
- [ ] Con directorio encendido, `/onboarding` (Google/Apple) y la bienvenida de la app («¿Cómo quiere empezar?») también preguntan «Profesional independiente» (→ `/registro/profesional`) o «Empresa o local» (onboarding: cuenta de cliente y luego `/registro/empresa`; app: `/registro/empresa`), con «Volver». Bandera apagada: «Ofrezco servicios» va directo como antes.
- [ ] Casos: nombre con varias palabras (búsqueda simple, la ranqueada daba timeout), nombre ya reclamado, enviar dos veces.
- [ ] «Mi negocio» tiene límite por cuenta.
- [ ] Iniciar sesión como interrupción (dueño 2026-11-27, solo con directorio): una sección que pide cuenta (p. ej. Guardados `/listas`) lleva a `/login?redirect=…`; en el teléfono la barra es «X Iniciar sesión» (sin logo, ☰ ni buscador) y la tarjeta dice por qué: «Inicie sesión para usar Guardados» (Herramientas, Mis reservas, Mi panel, Mensajes, publicar una solicitud, escribir una reseña…; si no se reconoce, «Inicie sesión para continuar»). Nunca cortado. En computadora, la barra del sitio y la misma línea.
- [ ] La X cierra todo el flujo y vuelve a la pantalla de ANTES de la sección protegida (nunca a la sección: rebotaría al login); abierta desde fuera (sin historial), a la portada. Probar desde un enlace normal y desde el menú.
- [ ] Si el login lo pidió una acción de una página pública (reclamar una marca o un negocio, guardar un lugar), la X vuelve a ESA página, no a la anterior.
- [ ] Dentro del flujo: «Regístrese» → «← Crear cuenta», «¿Olvidó su contraseña?» → «← Recuperar contraseña» (conserva el destino), el código de correo → «← Verificar correo»: la flecha retrocede un paso; la X solo está en la primera pantalla.
- [ ] Al entrar, llega a la sección que quería abrir (cualquier ruta interna segura, también con Google/Apple) y «atrás» del navegador NO vuelve al login (se reemplaza la entrada).
- [ ] `/login` abierto desde el menú («Ingresar»): barra normal del sitio; si hay una pantalla de la app detrás, «← Iniciar sesión» (aparece al hidratar). Lo mismo «← Crear cuenta» y «← Recuperar contraseña».

## 11. Panel Pro / Herramientas

Todo tras `PRO_UI_ENABLED` (Pro lanza gratis primero). Pendiente de pasada completa; marcar por bloque:
- [ ] `/herramientas` sin sesión (solo Pro): página pública con cinco grupos ("Clientes y ventas", "Trabajos y proyectos", "Finanzas", "Mi empresa", "Búsqueda de empleo"), filas estilo "Mi panel" (icono gris de contorno, nombre que envuelve sin "…", chevron); sin pie de página en teléfono. Tocar una herramienta lleva a login con `?redirect=` y vuelve a ella. (reemplaza a la lista con "Consiga más clientes"…)
- [ ] Pantalla de un grupo (`/herramientas?grupo=sales`) en teléfono: la barra de arriba dice "← Clientes y ventas" (pintada por el servidor); NO hay marca + "Herramientas", ni enlace "← Herramientas" dentro de la página, ni el título repetido. La flecha vuelve a la lista de grupos (también abriendo el enlace directo). En computadora sí queda el enlace de volver y el título dentro de la página.
- [ ] Con sesión, "Herramientas" es una sección de "Mi panel": `/dashboard/profesional?tab=tools` muestra los cinco grupos y `?tab=tools&grupo=<id>` abre uno con la barra "← <grupo>". Entrar a `/herramientas` (o `/herramientas?grupo=work`) con sesión redirige (reemplazo, sin entrada en el historial) a esa sección; un `grupo` inválido cae en la lista.
- [ ] En el panel: grupo → herramienta Pro (abre `/dashboard/pro?tab=…`) → atrás del navegador vuelve al grupo; flecha del grupo → lista; flecha de la lista → Mi panel. "Búsqueda de empleo" → Currículum o Carta → flecha → vuelve al grupo (con una cuenta nueva el currículum abre en su editor: la primera flecha cierra el editor).
- [ ] Menú con sesión: "Herramientas" del cajón (teléfono), del menú de cuenta (computadora, ahora también para clientes) y del pie de página llevan a `?tab=tools` del panel; sin sesión, el cajón y el pie llevan a `/herramientas`. Sin parpadeo al abrir el cajón.
- [ ] Profesional con sesión: en "Clientes y ventas", "Cotizaciones" abre la sección Cotizaciones del panel (gratis, como en producción) y su flecha vuelve al grupo. Cuenta de cliente: en "Herramientas" del panel solo ve "Búsqueda de empleo" (Currículum y Carta, como la lista vieja); ningún grupo ni herramienta abre el espacio Pro, y un enlace `?grupo=sales` muestra la lista. En computadora, tocar "Herramientas" (o "Favoritos") en la columna izquierda estando dentro de un grupo (o de Mis listas) vuelve a la lista de esa sección.
- [ ] Directorio encendido, con sesión: "Mis listas" vive en "Mi panel" → Guardados → fila "Negocios guardados (Mis listas)" (`?tab=saved&vista=listas`, barra "← Mis listas", la flecha vuelve a Guardados; el título "Mis listas" de la página no se repite en teléfono). `/listas` con sesión redirige ahí (reemplazo); sin sesión va a login y vuelve. La pestaña "Mis listas" de la barra de abajo del directorio y los enlaces de "Yo" llevan directo al panel.
- [ ] Directorio encendido, con sesión: "Mis reservas" es una fila de "Mi panel" justo después de Guardados (`?tab=mis_reservas`, barra "← Mis reservas", vacío "Todavía no tiene reservas."; cada reserva abre su enlace privado `/reserva/<token>`). `/mis-reservas` con sesión redirige ahí; sin sesión queda la página de invitado con "Iniciar sesión". `GET /api/mis-reservas` no devuelve ids.
- [ ] `/yo` NO se movió: es la pantalla "Yo" estilo Yelp (contador de reseñas/fotos/visitas, compartir/QR, vistos recientemente, contribuciones), distinta de "Mi panel".
- [ ] Menú con sesión (cajón del teléfono): fila de cuenta (nombre → Mi panel), [Ofrecer mis servicios si no es profesional], Buscar profesionales, Categorías, Solicitudes, Promociones, [Empleos], Herramientas (→ panel), [Asistente solo en la app], Mensajes, [Mi negocio], [Panel admin], Ayuda y soporte; abajo Cerrar sesión. Sin sesión: Buscar profesionales, Categorías, Solicitudes, Promociones, [Empleos], Herramientas (→ `/herramientas`), [Asistente en la app], Ayuda y soporte; Iniciar sesión / Registrarse. Ni "Mis listas" ni "Mis reservas" se repiten en el menú (están en Mi panel). Menú de cuenta (computadora): Mi panel, Herramientas, Mensajes, [Mi negocio], Mis favoritos (→ Guardados del panel), Perfil y cuenta, Cerrar sesión.
- [ ] Con directorio apagado (producción): Mi panel no muestra "Mis reservas" ni la fila de Mis listas, `?tab=mis_reservas` cae en el inicio del panel, `/listas` y `/mis-reservas` dan 404.
- [ ] Directorio encendido: los nombres de las filas de Mi panel, el título de la barra de arriba (también "← <sección>") y el nombre de un currículum o carta en su lista envuelven a otra línea, nunca "…". Con el directorio apagado siguen como en producción.
- [ ] Directorio encendido, con sesión: "Ver mis listas" (hoja de guardar un lugar) y "Mis reservas" (confirmación de reserva y página `/reserva/<token>`) abren directo la sección del panel; sin sesión, "Mis reservas" lleva a `/mis-reservas`. Barra de abajo del directorio: en Mis listas del panel se enciende "Mis listas"; en Mis reservas y el resto del panel, "Yo". (La barra de la app nativa enciende "Panel" en todo `/dashboard/profesional`.)
- [ ] Con Pro apagado (producción): "Herramientas" del panel sigue con sus tres filas de siempre (Cotizaciones solo profesional, Currículum, Carta), `?grupo=` se ignora y `/herramientas` da 404. Spec: `tests/e2e/pro-tools-panel.spec.ts`.
- [ ] Barra inferior propia de Pro en teléfono (cabe «Cotizaciones» en 390 px), un solo botón atrás, encabezado de una fila; filtros y hojas quedan encima de la barra.
- [ ] Proyectos: lista con filtro multiestado + Aplicar, columnas ordenables, fijar, administradores, estados Kanban propios; `/proyectos` redirige a `/solicitudes`; enlaces viejos de trabajo (`?vistaTrabajo=`, `/summary`) redirigen de verdad.
- [ ] Finanzas: facturas, cotizaciones y órdenes de compra con vista de tabla, columnas elegibles y orden; tarjetas resumen y filtros; referencias de gastos automáticas; recibos y proveedores por enlace seguro.
- [ ] Prospectos (leads): tabla con tareas y administradores, importación CSV con mapeo, constructor de formulario de contacto público, perspectivas de marketing, fuentes agrupadas.
- [ ] Selecciones, planos y tableros de ideas, calendario con tipos de reunión, informes guardados, listas de correo, centro de ayuda (17 categorías).
- [ ] Teléfono: títulos largos envuelven, los botones de lista/cuadrícula no desbordan, el cuaderno de gastos y calendarios cierran al recargar.
- [ ] Atrás del navegador conserva ediciones sin guardar; sin sesión, enlaces de Pro piden login.
- [ ] Con Pro apagado nada de lo anterior aparece.
- [ ] Vista previa de horarios en la tarjeta de búsqueda (2026-11-28): a fin de mes (quedan menos de 6 días con horario en el mes) los días del mes siguiente siguen en la vista previa; el 28/29/30 se ven 3 días y «Días siguientes» avanza al mes nuevo. El calendario del modal no cambia.

## 12. Datos OSM e importación

- [ ] Tras la importación: cada sección nueva muestra resultados correctos (Parqueos, Lavacar, Atracciones, Tiendas, Centros comerciales, Mercados y carnicerías, Trámites, Educación, Transporte, Hospedaje "por días", Tours y museos).
- [ ] Clasificación: parqueos privados o "solo clientes" fuera; lavacar con tipo "Lavado completo"; cabinas siguen como cabinas; `shop=yes/vacant`, iglesias, cementerios, canchas y salones comunales fuera.
- [ ] Teléfono con +506 normalizado y WhatsApp conservados; redes (facebook/instagram/tiktok/…) conservadas; correo, sitio web y horario de OSM.
- [ ] Atracciones reclasificadas desde tours (`dir_import_reclassify`).
- [ ] Admin, Fotos: el origen dice «Sugerida automáticamente (Openverse)» o «Wikimedia Commons» según la foto; «Del negocio» y «De una persona usuaria» solo para fotos subidas.
- [ ] Limpieza de clasificación (2026-11-27, `osm-reclassify-cleanup.mjs`, simulacro por defecto, `--apply`): sin depósitos aduaneros/almacenes fiscales («TICA A…», «A169 - DEPOSITO ADUANERO…») en Supermercados, sin couriers privados (DHL, Jet Box, Aeropost) en Trámites, sin oficentros en Centros comerciales, sin colegios profesionales en Educación; «Bodega de pescaderia» en Mercados, «Bazar …» y mayoristas de muebles en Tiendas. Local: 107 ocultos, 11 movidos; relanzar no cambia nada.
- [ ] Filtro `--inside-only`: nada fuera de las provincias (frontera).
- [ ] Atributos para filtros (2026-11-27, `scripts/directory/osm-filter-attributes.mjs`, simulacro por defecto, `--apply`, solo base local): cocina de OSM en restaurantes (`cuisines`, slugs en español), «soda» por nombre, banco/marca/cadena (`brand`/`chain`) por etiqueta brand/operator o nombre, CCSS (`publicService`, ya existía) y MEP (`publicService` en educación, solo operador MEP/Ministerio de Educación Pública), y «Cabinas» como tipo en hospedaje (nombres «Cabina(s) …» que no dicen hotel/hostal/motel). Solo lugares sin reclamar, sin administrador y sin cambios de personal/dueño; claves nuevas solo si estaban vacías. Local: 9 246 lugares; relanzar no cambia nada. Pendiente: aplicarlo en test (y en `stage-import.mjs` para importaciones nuevas).
- [ ] Muestreo: nombres genéricos descartados; duplicados; direcciones vacías.
- [ ] Fotos libres (docs/directory-photos.md, migraciones 540 y 541): `commons-photos.mjs` pone foto activa a lugares con etiqueta OSM `wikimedia_commons`/`image` de Commons o `wikidata` (P18), solo CC0, dominio público, CC BY y CC BY-SA, con autor y licencia guardados; `openverse-photos.mjs` solo sugiere: la foto queda **pendiente** en Admin, Fotos (con nota «Sugerida automáticamente (Openverse) — verificar que sea el lugar» y enlace a la fuente), y se publica solo si se aprueba. Probar: aprobar y rechazar una sugerida, ver su crédito, repetir el script (no duplica).
- [ ] Términos 13.1 y `/como-ordenamos` listan las secciones nuevas y explican las sin reseñas; «Origen de los datos» enlaza © OpenStreetMap y la licencia ODbL.
- [ ] Datos del directorio en test (2026-11-28, workflow «Supabase migrations» con `directory_data=true` y `target=test`, `scripts/directory/run-test-data.mjs`): solo destino test (rechaza otra opción, otra rama, una URL que no sea del proyecto oqheayqqprpciqdvdaqo o que nombre el de producción); reconstruye `osm-pois.json` desde el extracto público de Geofabrik y corre `osm-filter-attributes.mjs` y `backfill-menu-links.mjs` (simulacro por defecto, `dry_run=false` escribe; relanzarlo no cambia nada). Comprobar en test.contratacr.com: chips «Tipo de comida»/«Sodas» en Restaurantes, «Banco»/«Con cajero» en Bancos, «Marca» en Gasolineras, cadena en Supermercados, «Cabinas» en Hospedaje y «Ver menú» en lugares de comida con enlace de OSM.

## 13. Cloudflare / infra

- [ ] Worker con binding R2 `PLACE_PHOTOS`: despliegue de test y producción no falla.
- [ ] Regla de caché de Cloudflare y regla de ciclo de vida del bucket: hechas 2026-11-27 (verificar que fotos se sirven con caché y no se rompe la moderación).
- [ ] Sin Cloudflare Images: ninguna imagen depende de él.
- [ ] Cron del Worker (resumen horario de Pro, recordatorios) corre.
- [ ] Previsualizaciones de enlaces: una sola tarjeta de marca, logo único (`og-logos` íntegros).
- [ ] Aviso de cookies compacto (~30 % del iPhone), un botón Continuar, X. (2026-11-28: la prueba automática lo mide solo en los proyectos móviles; la ventana de escritorio angosta no cuenta como teléfono.)

## Pendiente de activar / requiere a Isaac

- [ ] App de Instagram en Meta (para el enlace de redes / campañas).
- [ ] Migraciones 536–541 (y las siguientes) aplicadas en test y luego en producción: 536 parqueos/lavacar/lugares del equipo, 537 secciones nuevas, 538 R2, 539 redes sociales, 540 fotos Commons, 541 Openverse. Orden y sin saltos; aplicarlas antes de desplegar el código.
- [ ] Importación OSM en test (convertidor `osm-pbf-to-json.py` + `stage-import --inside-only`), luego respaldo de contactos (`backfill-contacts.mjs`) y fotos de Commons (`commons-photos.mjs --apply`; Openverse solo a cola pendiente). Siempre local primero.
- [ ] Caso de reembolso Cloudflare #02455540: pendiente de respuesta.
- [ ] Hechos 2026-11-27: regla de caché de Cloudflare y regla de ciclo de vida del bucket.
- [ ] Confirmar la decisión de portada: `d70c4261d` dejó test con la portada de producción; después se reintrodujeron bloques de directorio (hero, categorías, mapa de provincias). Definir cuál queda y reescribir la sección 1.
- [ ] Nada de directorio/Pro/Yelp a `main` ni a producción sin visto bueno de Isaac (en `main` fueron revertidos 2026-11-19).
- [ ] Marca: se queda ContrataCR; después ContrataLatam / Contrata<país>.

## Retirado (no esperar verlo)

- Barra inferior de 5 pestañas estilo Yelp (Buscar, Proyectos, Asistente, Mis listas, Yo) y la pantalla de inicio de app móvil: retiradas en `d70c4261d`; la barra inferior de test es la de producción.
- «Negocios» como nombre único: el directorio dice «Empresas» en unos lugares y «Negocios» en pestañas/botones; revisar consistencia de vocabulario en cada pantalla.

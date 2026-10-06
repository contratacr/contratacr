# Qué certifica la regresión de ContrataCR (y qué no)

Actualizado el 30 de septiembre de 2026. Este documento es la lista completa de
lo que hay que probar, ambiente por ambiente, y dice con honestidad qué revisa
la máquina, qué se revisa a mano y qué no revisa nadie todavía.

## Lo primero: qué significa «certeza»

Ninguna suite de pruebas puede garantizar que **no exista un solo bug** en toda
la app. Lo que sí puede garantizar es que **nada de lo que ya pasó vuelva a
pasar** y que **lo que un cliente hace todos los días siga funcionando**. Cada
bug real que se arregla se convierte en una prueba permanente (ver la tabla del
final), así que la certeza crece con cada arreglo. Lo que ninguna prueba cubre
es lo que nunca se ha visto: para eso están el smoke diario y la revisión
manual de cada bloque antes de publicar (la vigilancia cada 3 horas se retiró
el 6-oct-2026: producción la revisa Isaac).

## Qué corre, cuándo y contra qué

| Cuándo | Qué | Contra qué | Motores | Aviso si falla |
| --- | --- | --- | --- | --- |
| Cada push a `test` | Compuerta rápida: esquema de la base desde las migraciones, contratos, seguridad, traducciones, vocabulario, build | Base local en GitHub | — | Correo de GitHub al que hizo el push |
| Cada push a `mobile` | Contratos nativos + shell de la app y chat en WebView | Base de test alojada | Chrome (390) | Correo |
| **Cada madrugada 3:00 CR** | **Regresión exhaustiva** (los 228 casos, en 4 tandas) | Base local en GitHub, app como en producción (`next start`) | Chrome PC (1366) y Chrome teléfono (390) | **Correo** a soporte |
| Lunes 3:00 CR | Lo mismo + las pantallas públicas en Safari (WebKit, el motor del iPhone) | Ídem | + WebKit (390) | Correo |
| **Cada mañana 6:00 CR** | **Smoke diario**: smoke con sesión en test.contratacr.com; smoke de solo lectura en www.contratacr.com; todas las pantallas en 6 anchos; reanudar la app | Los dominios reales, con Cloudflare y las bases alojadas | Chrome PC y teléfono | **Correo** |
| Cada mañana 6:30 CR | Las dos bases coinciden con `supabase/migrations` | test y producción | — | Correo |
| A mano | Regresión de la app nativa: Android (emulador) e iOS (simulador, build y arranque) | Base de test alojada | Chrome + emuladores | Correo |
| A mano, antes de publicar diseño o gestos | Safari (WebKit) sobre todo lo público | — | WebKit | — |

Correo: `scripts/ci/avisar-por-correo.mjs` manda a `soporte@contratacr.com`
(cámbialo con la variable `ALERTAS_CORREO` en GitHub → Settings → Variables).
GitHub además manda su correo a quien disparó la corrida: activa
**Settings → Notifications → Actions → «Failed workflows only»** en tu cuenta.

## Ambientes y tamaños

| Ambiente | Cómo se prueba | Cobertura |
| --- | --- | --- |
| Web PC (Chrome 1366×900) | Toda la suite | Automática |
| Web PC (1440 y más ancho) | `pantallas-en-todos-los-anchos` (todas las pantallas principales) | Automática (visual y carga) |
| Web teléfono (390×844, Pixel) | Toda la suite | Automática |
| Web teléfono angosto (320) y tablet (768, 1024) | `pantallas-en-todos-los-anchos` + filtros del panel a 320 | Automática (visual y carga) |
| Safari / iPhone (WebKit) | Pantallas públicas, los lunes y a mano | Parcial: hoy en rojo (2 casos), pendiente |
| App iOS (WebView + shell nativo) | `mobile-native-shell` y `direct-chat` con la cookie nativa; build y arranque en el simulador | Automática (a mano) + revisión visual en el simulador |
| App Android | Emulador: lint, unitarias, arranque | Automática (a mano); todavía no publicada |
| test.contratacr.com | Smoke diario con sesión | Automática |
| www.contratacr.com | Smoke diario de solo lectura | Automática (sin sesión ni escrituras) |
| Firefox | — | **Sin cobertura** (menos del 3 % de las visitas) |

## Lista completa por sección

Leyenda: **UI** = el navegador hace lo que haría la persona · **API** = se
llama al servidor directo · **BD** = se comprueba lo guardado · **Contrato** =
traducciones, destinos o límites de acceso · **Visual** = anchos, desbordes,
parpadeos, saltos · **Manual** = se revisa a mano antes de publicar.

### Cuenta (cliente y profesional)

| Qué | Cómo | Estado |
| --- | --- | --- |
| Registro cliente y profesional, con correo, Google y Apple (app) | UI + Contrato; Google/Apple reales: Manual | Automática (salvo el proveedor externo) |
| Iniciar y cerrar sesión, recordar sesión, un solo panel para el profesional | UI + API | Automática |
| Olvidé mi contraseña de punta a punta (pantalla, correo, enlace, nueva clave) | UI + API | Automática |
| Cambio de contraseña y de correo, protección de escrituras sin sesión | UI + API + BD | Automática |
| Desactivar cuenta, reactivación, eliminación permanente y aislamiento de datos | UI + API + BD | Automática |
| Verificación de identidad (cédula contra el padrón, repesca, insignia) | API + BD + Contrato | Automática |
| Privacidad: confirmaciones de lectura recíprocas | UI | Automática |
| Google Identity real (web) y Sign in with Apple real (app) | Manual en test | Manual |

### Buscar profesionales

| Qué | Cómo | Estado |
| --- | --- | --- |
| Servicio + provincia/cantón/dirección, «cerca de mí», videoconsulta nacional | UI + BD | Automática |
| Direcciones `/profesionales/<servicio>/<provincia>/<cantón>` y redirecciones viejas | Contrato | Automática |
| Panel de resultados: arrastre, alturas, mapa a pantalla completa, sin franja | UI + Visual (app y web) | Automática |
| Tarjetas: servicio, precio, unidad e impuesto sin cortarse | Visual | Automática |
| Filtros (calificación, precio, idioma) | UI | Automática |
| Buscador de la app (Servicio + ubicación, recientes, más buscados) | UI (cookie nativa) | Automática |
| Mapa de Google: pines, tiles, permiso de ubicación | Manual | Manual |

### Perfil profesional

| Qué | Cómo | Estado |
| --- | --- | --- |
| Ficha pública: nombre, métricas en una línea, precio y zona, redes, pestañas | UI + Visual | Automática |
| Reseñas: crear, editar, una por trabajo, la propia sin parpadeo, volver sin congelarse | UI + API + BD | Automática |
| Casos de éxito: crear con fotos, ver en la ficha | UI + BD | Automática |
| Compartir (imagen PNG), guardar en favoritos | API + UI | Automática |
| Botones de contacto: WhatsApp / llamada / Mensajes según la cuenta y la plataforma | UI + Contrato (el destino pertenece a ese profesional) | Automática; abrir WhatsApp real: Manual |
| Reportar y bloquear desde la ficha y desde el chat | UI + API | Automática |

### Mi panel (profesional)

| Qué | Cómo | Estado |
| --- | --- | --- |
| Cada sección carga con esqueleto y sin cuerpo en blanco | UI + Visual | Automática |
| Mis servicios: agregar, editar descripción y precio, foto, menús contenidos | UI + BD | Automática |
| Mi perfil: bio, zonas, teléfonos, foto, redes | UI + BD | Automática |
| Casos de éxito, favoritos, guías | UI + BD | Automática |
| Cotizaciones: listado, crear, PDF, enlace público `/cotizacion/<código>` y `/c/<código>` | `cotizaciones.spec.ts` (montos con IVA, panel, PDF real, enlace sin sesión y noindex, borrar) | **Cubierto** (1-oct-2026) |
| Agenda y citas | — | Apagadas en el producto (`src/lib/citas.ts`); sus pruebas están en pausa |
| Filtros de cada sección sin cortarse a 320, 390 y PC | Visual | Automática |

### Proyectos, empleos y promociones

| Qué | Cómo | Estado |
| --- | --- | --- |
| Publicar, editar, cerrar, eliminar desde la pantalla real | UI + BD | Automática |
| Propiedad (solo el dueño edita), publicaciones cerradas no se ven | API + Contrato | Automática |
| Aviso a todos los profesionales de la categoría al publicar un proyecto | API + BD | Automática |
| Tableros: filtros, buscador, tarjetas, acciones del dueño iguales en PC y teléfono | UI + Visual | Automática |
| Contacto desde una publicación (WhatsApp / Mensajes) | UI + Contrato | Automática |
| Moderación en el panel admin (pausar, publicar, ocultar) | UI + BD | Automática |

### Mensajes (chat)

| Qué | Cómo | Estado |
| --- | --- | --- |
| Una conversación por contexto, ambos participantes, no leídos, entrega en vivo | UI + API + BD | Automática |
| Archivar, restaurar, leído/no leído, deslizar filas | UI + BD | Automática |
| Editar y anular (15 min), eliminar para mí, Enviado/Recibido/Visto | API + BD | Automática (API); gestos largos: Manual |
| Adjuntos (fotos y PDF) | API + BD | Automática |
| Bloqueo: el hilo se cierra para los dos, los de afuera no entran | API | Automática |
| Teclado sobre la caja de escribir (app) | UI (cookie nativa) | Automática |

### Soporte

| Qué | Cómo | Estado |
| --- | --- | --- |
| Crear caso con y sin sesión, conversación, reabrir, resolver/confirmar | API + BD | Automática |
| Adjuntos en el hilo (persona y equipo) | API + BD | Automática |
| Cierre automático por silencio | API + BD | Automática |
| Diseño igual a Mensajes en la app | Visual | Manual en el simulador |

### Notificaciones y avisos

| Qué | Cómo | Estado |
| --- | --- | --- |
| Cada tipo de aviso: texto en ES/EN, destino al tocarlo, leído al entrar | API + BD + Contrato | Automática |
| Deslizar para eliminar con Deshacer, sin deslizar a la derecha | UI (app) | Automática |
| Cola de push: aislamiento, esquema, vaciado cada 10 min | API + BD | Automática |
| Que el push LLEGUE al teléfono | Manual en un iPhone real | Manual |
| Correos (Brevo): plantillas, baja de un clic, remitente | Contrato + Manual | Parcial |

### Asistente

| Qué | Cómo | Estado |
| --- | --- | --- |
| 24 casos: búsqueda por servicio y zona, publicar proyecto, empleos, calidad y garantía, cuenta, soporte, emergencias, inyecciones | API + Contrato | Automática |
| Menú según la cuenta, botones sin recargar, volver al chat | UI (app) | Automática (parcial) + Manual |
| Solo responde a la app (web → 404) | Contrato | Automática |

### Servicios, ayuda y legales

| Qué | Cómo | Estado |
| --- | --- | --- |
| Catálogo, secciones, sugerir servicio, etiquetas canónicas | UI + API + BD | Automática |
| Páginas por servicio/provincia/cantón y mapa del sitio | UI | Automática |
| Ayuda, cómo funciona, términos, privacidad en ES/EN | UI + Visual | Automática |

### Admin

| Qué | Cómo | Estado |
| --- | --- | --- |
| Límite sin sesión, cada sección abre con datos reales: verificación, usuarios, publicaciones, reportes, servicios, cuentas, soporte, analítica, actividad, cobertura, costos, campañas | UI + API | Automática |
| «Por dónde entraron» con las direcciones actuales | Contrato | Automática |

### Transversales

| Qué | Cómo | Estado |
| --- | --- | --- |
| Traducciones: mismas llaves en ES y EN (3 794), sin llaves crudas en pantalla, sin textos bilingües en código | Contrato (`lint:i18n` + `expectNoRawI18nKeys`) | Automática |
| Parpadeos: ficha, buscador, imágenes; hidratación sin fallos; sin saltos de diseño | Visual | Automática |
| Tiempo de carga: cada pantalla principal en ≤ 6 s (DOM listo) contra un servidor de producción y contra los dominios reales | Visual/rendimiento (`pantallas-en-todos-los-anchos`) | Automática |
| Reanudar la app: corte de red y volver del segundo plano sin quedarse pegada | UI (web y cookie nativa) + vigilante en la app (recarga sola si el servidor no contesta en 8 s tras 5 min dormida) | Automática + producto |
| Errores de consola, peticiones fallidas y 5xx en cualquier pantalla probada | Contrato (`expectHealthyPage`) | Automática |
| Seguridad: dependencias con avisos altos/críticos, archivos privados, límites de escritura de invitados | CI + Contrato | Automática |
| Rendimiento de scroll, gestos con el dedo, desenfoque de la barra | Manual en el simulador y en un iPhone real | Manual |

## Lo que sigue sin prueba automática (pendientes, en orden)

1. **Proveedores externos** (Google/Apple login, WhatsApp real, push real,
   Cloudinary, Maps): siempre a mano, en test, cuando cambie algo de eso.
2. **Firefox**: sin cobertura; no vale el costo hoy.
3. **Android en la tienda**: la regresión del emulador pasa, pero la app no
   está publicada.

## Contratos permanentes por bug reportado

| Bug reportado | Prueba permanente |
| --- | --- |
| Un profesional de toda la provincia desaparecía al buscar por cantón/dirección | `search-results` — whole-province coverage survives canton and resolved-address searches |
| La búsqueda en teléfono perdía servicio y ubicación | `search-results` — completed searches keep the selected service and location |
| Tarjetas cortaban servicio/precio | `search-results` — mobile cards keep service, price and price detail |
| Secciones del panel con cabecera y cuerpo vacío | `dashboard-surfaces` — never expose a blank body while their first request is pending |
| Vista previa de imagen y menús rotos en el editor de servicios | `extended-lifecycle` — profile and service edits persist through their real UI |
| Salir de Reseñas congelaba la ficha | `professional-profile` — reviews never freeze navigation |
| Empleos/Promociones en teléfono perdían cabecera y acciones | `seeded-regression` — mobile offers and jobs keep compact owner actions |
| Formatos de imagen aceptados vs. bytes reales | `product-contract` — image upload formats are synchronized |
| Menú móvil perdía clics antes de hidratar | `recent-visual-regression` / `public-smoke` |
| Eliminar cuenta fallaba con un seguimiento de WhatsApp | `account-lifecycle` — permanent deletion removes only the populated target |
| La app no reaccionaba al retomarla tras unos minutos | `reanudar-la-app` — sigue respondiendo tras un corte de red y volver del segundo plano |
| Filas desbordadas o llaves crudas en anchos intermedios | `pantallas-en-todos-los-anchos` — cada pantalla se ve bien y carga a 320/390/768/1024/1366/1440 |
| El servidor de pruebas no arrancaba (bucle de idioma con `next start`) | Compuerta rápida en cada push (`next start` + contratos) |

## Revisión manual antes de publicar (lista corta)

En el simulador con la app apuntando a localhost, y en test.contratacr.com:

1. Un cliente: buscar, abrir un perfil, escribir por Mensajes, publicar un proyecto.
2. Un profesional: entrar, ver el proyecto, responder, publicar una promoción.
3. El asistente: una pregunta de búsqueda y una de calidad.
4. Notificaciones: llega el aviso, se abre en el sitio correcto.
5. Soporte: abrir un caso con una foto.
6. Cambiar a inglés en dos pantallas cualesquiera.
7. Dejar la app en segundo plano cinco minutos y retomarla.

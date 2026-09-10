# Pendientes antes y después de publicar en producción

Bitácora viva del bloque de trabajo de septiembre 2026 (captación de clientes,
cotizaciones y precios). Cada punto dice qué falta y quién lo hace.

## 1. Migraciones de base de datos

| Migración | Qué agrega | test | producción |
|---|---|---|---|
| 189 · recordatorios de inactividad | tipos de aviso + índices | **aplicada 8-sep** | pendiente |
| 190 · retiros de propuesta | `proposals.withdrawn_at`, `withdraw_reason` | **aplicada 8-sep** | pendiente |
| 191 · cotizaciones | tabla `quotes` con RLS, tipos `quote_sent` / `quote_accepted` / `quote_declined` / `pricing_request` | **aplicada 8-sep** | pendiente |
| 192 · cotizaciones a cualquiera | `quotes.client_id` opcional, `client_name`, `client_phone`, `public_code` (enlace público) | **aplicada 9-sep** | pendiente |
| 193 · cédula en la cotización | `quotes.client_cedula` | **aplicada 9-sep** | pendiente |
| 194 · número de cotización | `quotes.quote_number` (consecutivo por profesional, índice único) | **aplicada 9-sep** | pendiente |
| 195 · correo en la cotización | `quotes.client_email` | **aplicada 9-sep** | pendiente |
| 196 · errores del cliente | tabla `client_errors` (diagnóstico de "Algo salió mal") | **aplicada 9-sep** | pendiente |
| 197 · cotización eliminada | `quotes.deleted_at` (borrado suave; el número no se reusa) | **aplicada 9-sep** | pendiente |
| 198 · oportunidades descartadas | tabla `dismissed_opportunities` ("No me interesa" por cuenta, no por teléfono) | **aplicada 10-sep** | pendiente |
| 199 · columnas públicas del profesional | permiso de lectura sobre `social_links` (y `contact_email` para quien tiene sesión): sin esto NINGUNA ficha mostraba las redes | **aplicada 10-sep** | pendiente |

Se aplican **solo** con el workflow `Supabase migrations` (dispatch), nunca en local:
`test` desde la rama `test`, `production` desde `main`; siempre en seco primero.
El 8-sep se aplicaron 189, 190 y 191 a **test** (producción quedó al día con lo
suyo: el dispatch en seco desde `main` dijo «Remote database is up to date»).
Al publicar en producción hay que repetir el par seco → aplicar desde `main`.
Hasta que la 191 esté aplicada, las cotizaciones responden «no habilitado» y el
bloque no se muestra: no rompe nada, simplemente no aparece.

## 2. Acciones manuales del dueño (después de publicar)

- [ ] **Cambiar el destino de los anuncios de Meta** de `/es/buscar?categoria=…`
      a `/es/servicios/<oficio>/<provincia>` (con los mismos utm). Ahí está el
      91% que hoy rebota.
- [ ] **Enviar la primera campaña de temporada** (Admin → Campañas): probarla
      antes con «Enviarme una prueba» y revisar el texto.
- [ ] **Pedir reseñas a los profesionales activos**: el kit «Compartir mi perfil»
      del panel ya trae el mensaje listo; conviene escribirle a los 20-30
      profesionales más activos para que lo usen (13 reseñas en 283 perfiles).
- [ ] **Google Search Console**: enviar `https://contratacr.com/sitemap.xml`
      (antes devolvía la página de inicio, ahora son 558 URLs reales).

## 3. Para revisar en 3-4 semanas

- **Asistente**: 0 preguntas registradas teniendo un lugar en la barra inferior.
  Si sigue en cero, bajarlo al menú y liberar ese espacio.
- **Embudo**: hoy 11% abre un perfil y 1,3% intenta contactar. Medir si las
  páginas por oficio lo mueven.
- **Cotizaciones**: cuántas se envían y cuántas se aceptan.

## 4. Decisiones tomadas (para no repetirlas)

- **No** habrá buscador público de cédulas tipo TSE: trae tráfico sin intención
  de contratar y mete al app en la Ley 8968 / PRODHAB. En su lugar se destaca
  «Identidad verificada» en el perfil y en la tarjeta con QR.
- **Fuera la «Garantía ContrataCR»**: prometía «mismo día» y «sin costo» en
  público sin un proceso detrás. Se puede volver a poner cuando exista, y sin
  esas dos palabras.
- **No se empuja al profesional a publicar precio** (revertido el 8-sep): el
  «precio de entrada», el orden que lo premiaba en /buscar y el aviso desde
  Admin quedaron fuera. Quien quiera pone precio en sus servicios y quien no,
  no; el filtro de precio de /buscar ya deja al cliente elegir. La 191 dejó
  permitido el tipo de aviso `pricing_request`, que no usa nadie.

## 5. Enlace público de cada profesional

Desde el 8-sep el enlace que se comparte es **`contratacr.com/nombre-apellido`**
(sin `/es/profesionales/` y sin el sufijo aleatorio del slug). Lo resuelve
`src/middleware.ts` con la lista `RUTAS_DEL_SITIO` (`src/lib/site-routes.ts`) y,
en la base, `getProfessionalBySlug`, que acepta el nombre sin sufijo mientras
solo haya un profesional con ese nombre. En producción los 283 perfiles dan 283
nombres distintos: no hay choques hoy.

- Los enlaces viejos (`/es/profesionales/nombre-apellido-977u5iku` y `/@slug`)
  siguen funcionando, y la etiqueta canónica sigue siendo la larga: no se pierde
  nada de lo que Google ya tenga indexado.
- **Al agregar una sección nueva** hay que ponerla en `src/lib/site-routes.ts`.
  No es un pendiente que se pueda olvidar: `verify-app-surface-ownership.mjs`
  (gate de CI) falla si una carpeta de `src/app` no está en la lista.
- La tarjeta con QR ahora imprime el enlace escrito debajo del código, y en
  vistas previas de Vercel el kit comparte igual `contratacr.com` (antes salía
  el dominio `…vercel.app`, que era la queja).

## 6. Sección "Cotizaciones" (9-sep)

En producción había 0 citas y 1 proyecto, y la cotización solo existía dentro
de una cita o un proyecto: nadie podía hacer una. Ahora el profesional tiene la
sección **Cotizaciones** en su panel (y en la app, en la barra de abajo, donde
estaba el Asistente; el Asistente pasa al menú lateral para profesionales; el
cliente conserva el Asistente):

- Cotiza a **cualquier cliente** (nombre y WhatsApp), sin que tenga cuenta.
- La cotización se **reparte** como el perfil (enlace, WhatsApp, Instagram,
  Facebook, correo, PDF) y se **envía a una cita o a un proyecto del app**, que
  es donde el cliente la acepta desde su panel. El enlace público
  (`contratacr.com/cotizacion/sg-solutions-0004-k7m2xq9a`) es solo para verla y
  guardarla: ahí no se acepta, se sigue por WhatsApp.
- Se manda por WhatsApp (directo al número si lo puso), se copia el enlace o se
  baja/comparte como **PDF** (`src/lib/quote-image.ts` dibuja la hoja y jsPDF la
  empaqueta; la librería se carga solo al usarla).
- La **cédula del cliente trae el nombre** del padrón (`/api/cedula/<id>`), el
  teléfono lleva código de país, el IVA es una fila de tres pastillas y los
  servicios del profesional se agregan de un toque como líneas.
- **En test la cédula NO trae el nombre**: el padrón D1 de ese entorno está
  vacío o apunta a otra base (la bitácora `provider_verification_log` de test no
  registra hallazgos desde agosto; la de producción sí, con
  `cloudflare_d1_padron`). Es configuración del entorno, no código: en
  producción va a funcionar. Si se quiere probar en test, hay que cargarle el
  padrón al D1 de test en Cloudflare.
- El bloque dentro de citas y proyectos sigue igual (mismo editor).
- Necesita las **migraciones 192, 193 y 194** en producción; sin ellas, crear una
  cotización falla con error de columna.
- Cotizaciones también está en el menú de cuenta de la web y en el cajón del
  teléfono, no solo en la barra de la app.
- Al publicar: avisar a los profesionales activos que ya pueden cotizar desde
  el app (campaña + mensaje del kit).

## 7. Pendiente a futuro: empresa, marca y facturación electrónica

Decidido el 9-sep: **se deja para después**, no se trabaja ahora. El objetivo
del momento es traer clientes, y esto retiene profesionales. Queda aquí para no
volver a discutirlo desde cero.

**Por qué tendría sentido algún día.** En Costa Rica no existe el "proveedor
autorizado": Hacienda no certifica sistemas. Cualquier software puede armar el
XML, firmarlo con la llave del profesional y mandarlo al API. GTI y los demás
no tienen licencia especial; tienen producto y soporte. Nuestra ventaja sería
que la factura sale de donde ya ocurre el trabajo: cotización aceptada → un
toque → factura con los mismos datos. Sería la primera razón real para cobrar
una suscripción Pro.

**Lo que exige Hacienda (v4.4).** Llave `.p12` y credenciales del ATV de cada
profesional; XML con clave de 50 dígitos y consecutivo de 20; **CABYS en cada
línea** (la fricción más grande); firma XAdES-EPES; envío, consulta de estado y
reintentos; recepción y aceptación de comprobantes de terceros; guardar XML y
respuestas 5 años; correo con XML y PDF al receptor.

**Costo real de operarlo**: por documento es casi nada; lo caro es el
mantenimiento (cada versión de Hacienda, catálogo CABYS, tipo de cambio del
BCCR) y el **soporte humano** cuando Hacienda rechaza. Nuestro costo marginal
sería bajo porque la infraestructura ya está.

**Riesgo, que es lo que manda el orden.** Custodiar la llave de otro cambia la
categoría del riesgo: si se filtra y alguien factura a su nombre, el reclamo va
contra quien la guardaba. Hoy todo está a nombre personal de Isaac, sin
separación de patrimonio. Ya existe además el riesgo de datos personales
(Ley 8968 / PRODHAB) por las cédulas y el padrón.

**Orden cuando se retome** (confirmar con abogado y contador):
1. *Spike* de 2-3 días: cuenta de pruebas del ATV, firmar y mandar **un** XML.
   No necesita sociedad, marca ni permisos.
2. **SRL** (no asociación: una asociación es sin fines de lucro) **antes** de
   cobrar o de guardar la primera llave ajena. Cuenta bancaria aparte, sin
   mezclar plata.
3. Inscribir la SRL en el ATV y sacar su propia llave (para facturar lo que
   ContrataCR cobre).
4. **Marca** "ContrataCR" en el Registro Nacional (clases 42 y 35). Es aparte y
   conviene aunque nunca se haga la facturación.
5. Términos de servicio a nombre de la empresa, con límite de responsabilidad,
   y póliza de responsabilidad civil / cyber.

**Alternativa más corta** si algún día urge: conectarse al API de un proveedor
existente (GTI, Alanube, Facturele…) y que ellos firmen y envíen. 2-4 semanas en
vez de 3-4 meses, con costo por documento.


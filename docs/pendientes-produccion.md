# Pendientes antes y después de publicar en producción

Bitácora viva del bloque de trabajo de septiembre 2026 (captación de clientes,
cotizaciones y precios). Cada punto dice qué falta y quién lo hace.

## 1. Migraciones de base de datos

| Migración | Qué agrega | test | producción |
|---|---|---|---|
| 189 · recordatorios de inactividad | tipos de aviso + índices | **aplicada 8-sep** | pendiente |
| 190 · retiros de propuesta | `proposals.withdrawn_at`, `withdraw_reason` | **aplicada 8-sep** | pendiente |
| 191 · cotizaciones | tabla `quotes` con RLS, tipos `quote_sent` / `quote_accepted` / `quote_declined` / `pricing_request` | **aplicada 8-sep** | pendiente |

Se aplican **solo** con el workflow `Supabase migrations` (dispatch), nunca en local:
`test` desde la rama `test`, `production` desde `main`; siempre en seco primero.
El 8-sep se aplicaron 189, 190 y 191 a **test** (producción quedó al día con lo
suyo: el dispatch en seco desde `main` dijo «Remote database is up to date»).
Al publicar en producción hay que repetir el par seco → aplicar desde `main`.
Hasta que la 191 esté aplicada, las cotizaciones responden «no habilitado» y el
bloque no se muestra: no rompe nada, simplemente no aparece.

## 2. Acciones manuales del dueño (después de publicar)

- [ ] **Avisar a los profesionales sin precio.** Admin → Campañas → «Avisar a N
      profesionales»: manda un aviso en el app y push que los lleva a poner su
      precio de entrada. No repite a quien ya se le avisó en 30 días.
      Requiere la 191 (tipo `pricing_request`).
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
- **Precio de entrada**: si la mayoría no lo pone pese al checklist, al orden en
  /buscar y al aviso, volverlo obligatorio solo para cuentas nuevas.
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
- **El precio no se pide por servicio** (muchos trabajos varían): se pide un solo
  dato de entrada — visita, hora o trabajo mínimo — y las tarjetas lo muestran
  como «Desde ₡X».

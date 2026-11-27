# Importar fotos desde Instagram

Estado (2026-11-27): hecho y probado de punta a punta **solo con el simulador local** (sandbox). Todavía no existe la aplicación de Meta. Con las variables sin configurar, producción no muestra nada nuevo.

## Qué hace

- **Dueños de un negocio del directorio.** En la ficha del negocio, el panel "Agregar fotos" (solo para quien administra el negocio, o para un miembro del equipo Pro con permiso `listing.publish`) muestra un segundo botón: "Importar desde Instagram".
- **Profesionales.** En "Casos de éxito", la ventana para crear o editar un caso tiene el mismo botón debajo de las fotos. Ahí el máximo baja a los espacios libres del caso (un caso admite 5 fotos).
- **Pasos:**
  1. "Conectar su cuenta de Instagram (Empresa o Creador)". Se abre una ventana de Instagram.
  2. Aparece una cuadrícula con las fotos recientes de la cuenta: imágenes y la portada de cada carrusel. Los videos no se muestran.
  3. "Elija hasta 10 fotos" y marque la casilla de derechos.
  4. "Importar seleccionadas". El resultado dice "Se agregaron N fotos".
- **Derechos.** La persona confirma: "Confirmo que tomé estas fotos o tengo permiso para publicarlas. Son de mi propia cuenta de Instagram, no de otras personas ni de otros sitios." La primera frase es la misma del cargador de fotos de lugares. La segunda cambia porque allá se lee "No son de … redes sociales", que aquí sería contradictorio.
- **Mismo proceso que las subidas normales.**
  - *Negocio:* `src/lib/directory/place-photo-add.ts` es el mismo código de `/api/lugar/[slug]/fotos`. Revisa los bytes mágicos, el tope de 20 MiB y 24 MP, las variantes 1600/800/320 sin metadatos, el sha256 y los duplicados en el mismo lugar, y luego guarda en R2 o en Supabase. Se publica de inmediato, como cualquier foto del dueño. El navegador hace las variantes a partir de la foto que entrega `/api/integrations/instagram/media/<id>` (plan de almacenamiento del 2026-11-26), así que también funciona en el Worker, que no tiene códec de servidor. Si el navegador no puede hacerlas, el servidor usa su propio códec, que es sharp en `next dev`.
  - *Caso de éxito:* son las mismas revisiones de `/api/upload/photo` (bytes mágicos, 4 MB, análisis antimalware, quitar metadatos y verificarlo) y el mismo almacenamiento: R2 `contratacr/portfolio/…`, o en local el bucket `local-uploads`. La URL se agrega al caso que se está editando y se guarda al tocar "Guardar".
- **Procedencia.** `instagram_media_imports` guarda `{source: instagram, permalink, mediaId}` y lo que se creó (el id de la foto del lugar o la URL).
- **Duplicados.** Una foto ya importada al mismo destino aparece como "Ya importada" y, si se vuelve a pedir, se omite: "N fotos ya estaban importadas y se omitieron". Si la foto se borró del lugar, o el caso no se guardó, se puede volver a importar.
- **Token.** Solo vive en el servidor, en la tabla `instagram_connections`, con RLS y sin políticas: solo la lee el rol de servicio. "Desconectar Instagram" borra la fila.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Adaptador (interfaz `authorizeUrl`, `exchangeCode`, `listMedia`, `fetchMedia`) | `src/lib/integrations/instagram/types.ts` |
| Implementación real (Graph API de Instagram, `v27.0`) | `src/lib/integrations/instagram/meta.ts` |
| Simulador (pantalla falsa de conexión y 8 fotos generadas, más 1 video que se descarta) | `src/lib/integrations/instagram/sandbox.ts`, `src/app/[locale]/integraciones/instagram/sandbox/page.tsx` |
| Selección del adaptador | `src/lib/integrations/instagram/adapter.ts` |
| Rutas | `src/app/api/integrations/instagram/{connect,callback,connection,media,media/[id],import}` |
| Hoja de importación | `src/components/integrations/instagram-import.tsx` |
| Migración | `supabase/migrations/542_instagram_import.sql` (aplicada solo en local) |
| Pruebas | `node --test scripts/integrations/instagram.test.mjs`, `tests/e2e/pro-instagram-import.spec.ts` |

**Banderas.**

- `INSTAGRAM_IMPORT_ENABLED` es la del servidor y `NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED` la del navegador. Sin definir, quedan encendidas en `next dev` y apagadas en cualquier build de producción.
- **Adaptador.** Se usa `meta` cuando están las tres variables de Meta. Sin ellas se usa `sandbox`, pero solo en `next dev`. En producción, sin ellas, no hay ninguno y las rutas responden 404. Nunca se sirven fotos falsas en producción. `INSTAGRAM_ADAPTER=sandbox` obliga a usar el simulador en local.

## Qué debe hacer Isaac para activarlo (nosotros no creamos la aplicación)

1. **Crear la aplicación.** Entre a <https://developers.facebook.com/apps> con la cuenta comercial (Business Manager) de ContrataCR y elija Crear aplicación. Tipo: Empresa (Business). Asóciela al portafolio comercial de ContrataCR.
2. **Agregar el producto Instagram.** Elija "Instagram API with Instagram Login" (API de Instagram con inicio de sesión de Instagram). Ahí aparecen el **Instagram App ID** y el **Instagram App Secret**, que son distintos de los de la aplicación de Facebook.
3. **Redirect URI.** En la configuración de inicio de sesión de la empresa, agregue exactamente:
   - `https://contratacr.com/api/integrations/instagram/callback`
   - `https://test.contratacr.com/api/integrations/instagram/callback`, si se quiere probar en test.
4. **Permiso.** Solo `instagram_business_basic`: ver el perfil y las publicaciones. No pida permisos de publicar, mensajes ni comentarios.
5. **Probar antes de la revisión.**
   - En Roles, agregue como Instagram Tester una cuenta de Empresa o Creador propia y acepte la invitación desde Instagram: Configuración, Apps y sitios web.
   - Con eso funciona sin revisión para esa cuenta.
6. **Revisión de la aplicación (App Review) para `instagram_business_basic`.** Necesita:
   - URL de la política de privacidad: `https://contratacr.com/privacidad`, que debe mencionar esta importación.
   - Instrucciones de eliminación de datos: "Desconectar Instagram" borra el token, y quitar la foto la borra.
   - Un video corto del flujo: botón, conexión, cuadrícula, importar y resultado.
   - Verificación del negocio en Meta, si la piden.
   - Después ponga la aplicación en modo Live.
7. **Variables en Cloudflare** (Workers → contratacr → Settings → Variables and secrets):
   - `INSTAGRAM_APP_ID` (texto)
   - `INSTAGRAM_APP_SECRET` (secreto)
   - `INSTAGRAM_REDIRECT_URI`: la URL exacta del paso 3
   - Además, para encender la función: `INSTAGRAM_IMPORT_ENABLED=true` (servidor) y `NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED=true`. Esta última es de compilación, así que hay que volver a desplegar.
8. **Migración `542_instagram_import.sql`.** Aplicarla en la base del entorno al desplegar, con el flujo normal de migraciones.

## Límites conocidos

- **El adaptador `meta` no se ha probado contra Meta**, porque no existe la aplicación. Se escribió con la documentación oficial (autorizar, token corto, token largo de unos 60 días, `me/media`). Tras el paso 5, pruébelo con la cuenta de prueba.
- **Renovación del token.** El token largo vence a los 60 días y todavía no se renueva solo. Al vencer, la hoja vuelve a pedir "Conectar". Renovarlo con `refresh_access_token` sería un trabajo aparte.
- **Carruseles.** De un carrusel se importa solo la portada (`media_url`). Las demás fotos del carrusel no se ofrecen.
- **Variantes del navegador.** Las variantes que hace el navegador se validan tal como llegan. Igual que en las subidas normales, no se compara su contenido con la foto original de Instagram (ver `docs/storage-plan.md`).
- **Cantidad de fotos.** Se listan las 50 publicaciones más recientes, sin paginar.
- **Costo de la cuadrícula con Meta.** Cada miniatura pasa por `/api/integrations/instagram/media/<id>`, que vuelve a leer la lista (`me/media`) y descarga la foto completa. Con una cuenta real, abrir la cuadrícula puede hacer hasta unas 50 llamadas a la API y 50 descargas a través del Worker. Antes de activarlo conviene guardar la lista unos minutos o usar miniaturas más pequeñas.
- **Tope de 10 fotos.** Lo aplica la pantalla. El servidor importa una foto por pedido, con un límite de 40 pedidos cada 10 minutos por cuenta, y en negocios se suma el tope de 20 fotos por persona al día.

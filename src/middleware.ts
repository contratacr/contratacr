import { createServerClient } from "@supabase/ssr";
import { categorySlug, idDesdeDireccion } from "@/lib/data/category-slug";
import { getProvinceById } from "@/lib/data/cr-geography";
import { RAIZ_DE_BUSQUEDA, SIN_SERVICIO, esProvinciaDeRuta, filtrosDeRuta, rutaDeBusqueda } from "@/lib/buscar-url";
import { RUTAS_DEL_SITIO } from "@/lib/site-routes";
import { idiomaDeRuta, rutaConIdioma, sinPrefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { isUnsafeLocalProductionWrite, unsafeLocalProductionWriteResponse } from "./lib/security/write-guard";
import { PromiseTimeoutError, withPromiseTimeout } from "./lib/promise-timeout";

const handleI18n = createIntlMiddleware(routing);

// Paths that require a logged-in + onboarding-complete session
const PROTECTED_PREFIXES = ["/dashboard"];

// Paths that are always public (never redirected to onboarding)
const PUBLIC_PREFIXES = [
  "/onboarding",
  "/login",
  "/registro",
  "/olvide-contrasena",
  "/reset-password",
  "/auth",
  "/buscar",
  "/profesionales",
  "/categorias",
  "/servicios",
  "/como-funciona",
  "/terminos",
  "/privacidad",
];

// Cloudflare's OpenNext adapter does not yet support the Node.js-only `proxy.ts`
// convention introduced by Next.js 16. Keep this request boundary in the legacy
// Edge Middleware convention until the adapter supports Node Proxy. It still runs
// before every matched route: i18n locale routing + the Supabase auth gate.
// UNA REESCRITURA NUESTRA SALTA EL MIDDLEWARE DE next-intl, que es el que le
// dice a la página en qué idioma está (encabezado X-NEXT-INTL-LOCALE). Sin él la
// página cae al español: /en/profesionales/… salía con «3 profesionales en
// Santa Bárbara», los filtros y hasta el menú de abajo en español. El idioma
// sale de la ruta de destino (/es/… o /en/…).
function reescribirConIdioma(request: NextRequest, destino: URL) {
  const idioma = /^\/(en|es)(?=\/|$)/.exec(destino.pathname)?.[1] ?? "es";
  const encabezados = new Headers(request.headers);
  encabezados.set("X-NEXT-INTL-LOCALE", idioma);
  return NextResponse.rewrite(destino, { request: { headers: encabezados } });
}

// ¿/profesionales/<x> es un servicio? El catálogo real vive en la tabla
// `categories` —incluye los servicios creados desde el panel, que el código no
// conoce—. Se lee sin sesión (es público) y se guarda cinco minutos por
// instancia: un perfil no paga una consulta por visita. Si la base no contesta,
// decide la forma: todo perfil termina en un sufijo aleatorio de 8 caracteres.
let serviciosPublicados: { ids: Set<string>; hasta: number } | null = null;
async function esServicioPublicado(id: string): Promise<boolean> {
  if (!serviciosPublicados || serviciosPublicados.hasta < Date.now()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      if (!url || !llave) throw new Error("sin supabase");
      const respuesta = await withPromiseTimeout(
        fetch(`${url}/rest/v1/categories?select=id`, { headers: { apikey: llave, Authorization: `Bearer ${llave}` } }),
        1500,
        "catálogo de servicios: tiempo agotado",
      );
      if (!respuesta.ok) throw new Error(`catálogo ${respuesta.status}`);
      const filas = await respuesta.json() as Array<{ id: string }>;
      // Un catálogo VACÍO no es «no hay servicios»: es que la base no dejó
      // leerlo (1-oct-2026: la seguridad por filas de producción devolvía cero
      // filas y todo /profesionales/<servicio> abría «Perfil no encontrado»).
      // Se trata como una falla: decide la forma y se reintenta en la próxima.
      if (!Array.isArray(filas) || filas.length === 0) throw new Error("catálogo vacío");
      serviciosPublicados = { ids: new Set(filas.map((f) => f.id)), hasta: Date.now() + 5 * 60_000 };
    } catch {
      return !/-[a-z0-9]{8}$/.test(categorySlug(id));
    }
  }
  return serviciosPublicados.ids.has(id);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (isUnsafeLocalProductionWrite(request)) return unsafeLocalProductionWriteResponse();
    return conCabecerasDeSeguridad(NextResponse.next());
  }

  // www.contratacr.com NO SE REDIRIGE (probado y deshecho el 1-oct-2026).
  // Quien agregó la app web a la pantalla de inicio desde www la tiene atada a
  // ese dominio: con www → contratacr.com, iOS la ve salir de su sitio y le pone
  // la barra de Safari arriba y abajo. No hay forma de distinguir desde aquí a
  // quien la abre desde el ícono. Para Google basta la canónica, que en todas
  // las páginas apunta a contratacr.com.

  // UNA REESCRITURA INTERNA YA PROCESADA PASA TAL CUAL. Con `next start` (el
  // servidor del CI) el middleware vuelve a correr sobre la dirección a la que
  // él mismo reescribió (/ → /es/…): las reglas de idioma la veían como una
  // visita con /es y la devolvían a /, en bucle —toda página en español
  // respondía 307/308 a sí misma y la regresión no podía ni arrancar desde el
  // 28-sep—. En Cloudflare no se vuelve a correr, por eso el sitio andaba. La
  // reescritura trae el idioma en X-NEXT-INTL-LOCALE y la ruta interna con su
  // prefijo; una visita real a /es/… no trae ese encabezado.
  if (request.headers.has("x-next-intl-locale") && /^\/(?:es|en)(?=\/|$)/.test(pathname)) {
    return conCabecerasDeSeguridad(NextResponse.next());
  }

  // El español vive en la raíz. Toda dirección con /es delante —años de enlaces
  // compartidos, sitemap viejo, avisos guardados— salta con 308 PERMANENTE a la
  // misma sin prefijo, con su consulta intacta, para que Google traslade lo
  // ganado en vez de tratarlas como dos páginas. Va antes de cualquier otra
  // regla: así ninguna reconstruye una dirección con /es.
  const conEs = /^\/es(?=\/|$)/i.exec(pathname);
  if (conEs) {
    const destino = request.nextUrl.clone();
    // Y de paso el nombre viejo de la sección, para que sea UN salto.
    destino.pathname = (pathname.slice(3) || "/").replace(/^\/ofertas(?=\/|$)/i, "/promociones").replace(/^\/promociones\/mis-ofertas(?=\/|$)/i, "/promociones/mis-promociones").replace(/^\/buscar(?=\/|$)/i, RAIZ_DE_BUSQUEDA);
    // /es/buscar?categoria=…: la búsqueda con parámetros va directo a la bonita.
    if (/^\/profesionales\/?$/.test(destino.pathname) && (destino.searchParams.has("categoria") || destino.searchParams.has("provincia"))) {
      return NextResponse.redirect(new URL(rutaDeBusqueda(destino.searchParams), request.url), 308);
    }
    return NextResponse.redirect(destino, 308);
  }
  // La sección del panel admin también se llamaba «ofertas».
  const adminViejo = /^(?:\/en)?\/admin\/ofertas\/?$/i.exec(pathname);
  if (adminViejo) {
    const destino = request.nextUrl.clone();
    destino.pathname = pathname.replace(/ofertas\/?$/i, "promociones");
    return NextResponse.redirect(destino, 308);
  }

  // Idioma del dispositivo, SOLO para quien nunca ha elegido uno a mano.
  // Costa Rica es el mercado, así que el español es el punto de partida: solo
  // se abre en inglés cuando el navegador dice preferir inglés POR ENCIMA del
  // español. Un `Accept-Language: es-CR,en;q=0.8` sigue siendo español. En
  // cuanto alguien toca el selector, su elección manda y esto no vuelve a
  // opinar (cookie `ccr_locale_elegido`).
  const idiomaPreferido = (): "es" | "en" => {
    if (request.cookies.get("ccr_locale_elegido")?.value === "1") {
      return request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "es";
    }
    const guardado = request.cookies.get("NEXT_LOCALE")?.value;
    if (guardado === "en" || guardado === "es") return guardado;
    const cabecera = request.headers.get("accept-language") ?? "";
    let mejorEs = 0;
    let mejorEn = 0;
    for (const parte of cabecera.split(",")) {
      const [etiqueta, ...resto] = parte.trim().split(";");
      const q = Number.parseFloat(resto.find((r) => r.trim().startsWith("q="))?.split("=")[1] ?? "1");
      const peso = Number.isFinite(q) ? q : 1;
      const base = etiqueta.trim().toLowerCase().split("-")[0];
      if (base === "es") mejorEs = Math.max(mejorEs, peso);
      if (base === "en") mejorEn = Math.max(mejorEn, peso);
    }
    return mejorEn > mejorEs ? "en" : "es";
  };

  const VANITY: Record<string, string> = {
    "/ig": "/?utm_source=instagram&utm_medium=organic&utm_campaign=bio",
    "/tt": "/?utm_source=tiktok&utm_medium=organic&utm_campaign=bio",
    "/fb": "/?utm_source=facebook&utm_medium=organic&utm_campaign=bio",
    "/wa": "/?utm_source=whatsapp&utm_medium=referral&utm_campaign=bio",
    // Professional recruiting by hand (WhatsApp outreach) — lands on the signup.
    "/pro": "/registro/profesional?utm_source=whatsapp&utm_medium=outreach&utm_campaign=pro-invitacion",
  };
  if (VANITY[pathname]) {
    return NextResponse.redirect(new URL(VANITY[pathname], request.url), 307);
  }

  // Enlaces cortos de una ficha: contratacr.com/o/b1baacf7 (oferta),
  // /e/… (empleo) y /c/… (cotización). Se REESCRIBEN, no se redirigen: la
  // dirección se queda corta en la barra, que es de lo que se trata. La forma
  // larga de siempre sigue abriendo lo mismo.
  const FICHAS: Record<string, string> = { o: "promociones", e: "empleos", c: "cotizacion", p: "proyectos" };
  const fichaCorta = /^\/([oecp])\/([a-z0-9][a-z0-9-]{3,80})$/i.exec(pathname);
  if (fichaCorta) {
    const locale = idiomaPreferido();
    const destino = new URL(`/${locale}/${FICHAS[fichaCorta[1].toLowerCase()]}/${fichaCorta[2].toLowerCase()}`, request.url);
    destino.search = request.nextUrl.search;
    return reescribirConIdioma(request, destino);
  }

  // Enlace público de cada profesional: contratacr.com/nombre-apellido (y la
  // forma con @ que se compartió antes). Solo entra aquí lo que no es una
  // sección del sitio (RUTAS_DEL_SITIO, verificada en CI).
  const perfilCorto = /^\/@?([a-z0-9][a-z0-9-]{2,80})$/.exec(pathname.toLowerCase());
  if (perfilCorto && !RUTAS_DEL_SITIO.has(perfilCorto[1])) {
    const locale = idiomaPreferido();
    const destino = new URL(rutaConIdioma(locale, `/profesionales/${perfilCorto[1]}`), request.url);
    destino.search = request.nextUrl.search;
    return NextResponse.redirect(destino, 307);
  }

  // Direcciones que se renombraron. Los `redirect()` que vivían en la propia
  // página NUNCA redirigieron de verdad: `/es/categorias` y `/es/contacto`
  // devolvían 200 con el título de la portada y sin canonical, en producción
  // incluida. En este app —middleware de next-intl + OpenNext— el redirect de
  // un componente no llega a la respuesta; el del middleware sí. Los archivos
  // de página se dejan como respaldo para la navegación interna.
  const RENOMBRADAS: Record<string, string> = {
    "/categorias": "/servicios",
    "/contacto": "/soporte",
    // Dos direcciones con nombre de otra época. La página se llama «¿Qué es la
    // verificación de identidad?» y el enlace del pie «Mejorar mi perfil»; las
    // rutas decían «proveedores autorizados» y «atraer clientes».
    "/proveedores-autorizados": "/verificacion-de-identidad",
    "/atraer-clientes": "/mejorar-mi-perfil",
  };
  // /ofertas → /promociones, con todo lo que cuelga: la ficha, publicar y
  // «mis ofertas» → «mis promociones». La sección se llama Promociones en
  // TODA la pantalla desde hace tiempo; solo la dirección conservaba el nombre
  // viejo. Es 308 permanente: hay 20 direcciones en el sitemap y enlaces
  // compartidos por WhatsApp, y Google tiene que trasladar lo ganado, no
  // tratarlas como dos páginas. Va antes del perfil corto y del prefijo de
  // idioma, así que `/ofertas` a secas también llega bien.
  const promociones = /^(?:\/(es|en))?\/ofertas(\/.*)?$/i.exec(pathname);
  if (promociones) {
    const idioma = promociones[1] ?? (request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "es");
    const cola = (promociones[2] ?? "").replace(/^\/mis-ofertas(?=\/|$)/i, "/mis-promociones");
    const destino = new URL(rutaConIdioma(idioma, `/promociones${cola}`), request.url);
    destino.search = request.nextUrl.search;
    return NextResponse.redirect(destino, 308);
  }

  const renombrada = /^(?:\/(en))?(\/[a-z-]+)\/?$/i.exec(pathname);
  if (renombrada && RENOMBRADAS[renombrada[2].toLowerCase()]) {
    const destino = new URL(rutaConIdioma(renombrada[1], RENOMBRADAS[renombrada[2].toLowerCase()]), request.url);
    destino.search = request.nextUrl.search;
    return NextResponse.redirect(destino, 308);
  }

  // Las páginas de oficio + provincia se nombraban con el código de dos letras
  // (`/servicios/electricidad/sj`). Son las direcciones con más intención de
  // compra del sitio —alguien que busca «electricista en San José» ya sabe lo
  // que quiere— y no decían el lugar: ni Google las lee, ni se entienden al
  // compartirlas. Ahora la canónica es `/san-jose` y el código viejo trae aquí
  // con un 308 permanente, para que Google traslade a la nueva lo que la vieja
  // hubiera ganado en vez de tratarlas como dos páginas distintas.
  //
  // Va en el middleware y no en la página por dos razones: la página se genera
  // estáticamente, así que un redirect en el componente no se ejecuta; y en
  // OpenNext/Cloudflare el middleware corre primero y se traga lo que devuelva
  // la página (ver el comentario de `next.config`).
  //
  // La misma regla arregla las DOS mitades de la dirección de un oficio, y en
  // un solo salto: el servicio con guiones en vez de guion bajo (Google separa
  // palabras por guion; el guion bajo las pega, así que leía
  // «aireacondicionado») y la provincia por su nombre en vez de su código. En
  // dos reglas encadenadas habría dos 308 seguidos para la misma dirección.
  // LA BÚSQUEDA DE PROFESIONALES VIVE EN /profesionales (ver lib/buscar-url.ts
  // para cómo se distingue de un perfil). Tres pasos, cada uno de un salto:
  //  1. /buscar/… (la dirección hasta el 29-sep-2026) → 308 a /profesionales/…
  //  2. la forma con parámetros (?categoria=…&provincia=al) → 308 a la bonita
  //  3. la bonita se REESCRIBE por dentro a /[locale]/buscar con parámetros,
  //     que es la página que busca. La reescritura no vuelve a pasar por aquí.
  const conFiltrosEnParametros = request.nextUrl.searchParams.has("categoria") || request.nextUrl.searchParams.has("provincia");
  const buscarViejo = /^(?:\/(en))?\/buscar(\/[^?#]*)?$/.exec(pathname);
  if (buscarViejo) {
    const cola = (buscarViejo[2] ?? "").replace(/\/$/, "");
    const destino = !cola && conFiltrosEnParametros
      ? rutaDeBusqueda(request.nextUrl.searchParams)
      : `${RAIZ_DE_BUSQUEDA}${cola}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(rutaConIdioma(buscarViejo[1], destino), request.url), 308);
  }
  const busqueda = /^(?:\/(en))?\/profesionales(?:\/([^/?#]+))?(?:\/([^/?#]+))?(?:\/([^/?#]+))?\/?$/.exec(pathname);
  if (busqueda) {
    // EL IDIOMA ELEGIDO MANDA, como en el resto del sitio. Esto armaba la
    // búsqueda en español siempre que la dirección no trajera /en (ya pasaba
    // con /buscar): con la app en inglés salía «3 profesionales en Santa
    // Bárbara». Una página pedida sin /en por quien eligió inglés salta a /en;
    // las cargas internas del router se arman en su idioma sin saltar.
    const eligioIngles = request.cookies.get("NEXT_LOCALE")?.value === "en";
    if (!busqueda[1] && eligioIngles) {
      const destinoDePagina = request.headers.get("sec-fetch-dest");
      const esCargaInterna = (destinoDePagina !== null && destinoDePagina !== "document")
        || (request.headers.get("accept") ?? "").includes("text/x-component");
      if (!esCargaInterna) {
        const url = request.nextUrl.clone();
        url.pathname = rutaConIdioma("en", pathname);
        return NextResponse.redirect(url, 307);
      }
    }
    const idioma = busqueda[1] ?? (eligioIngles ? "en" : "es");
    const [, , primero, segundo] = busqueda;
    if (!primero && conFiltrosEnParametros) {
      const bonita = rutaDeBusqueda(request.nextUrl.searchParams);
      if (bonita.split("?")[0] !== RAIZ_DE_BUSQUEDA) return NextResponse.redirect(new URL(rutaConIdioma(busqueda[1], bonita), request.url), 308);
    }
    const esBusqueda = !primero
      || primero.toLowerCase() === SIN_SERVICIO
      || (segundo ? esProvinciaDeRuta(segundo) : await esServicioPublicado(idDesdeDireccion(primero.toLowerCase())));
    if (esBusqueda) {
      const destino = new URL(`/${idioma}/buscar`, request.url);
      destino.search = request.nextUrl.search;
      // Ya se sabe que es búsqueda: el servicio del primer tramo está confirmado.
      for (const [clave, valor] of Object.entries(filtrosDeRuta(pathname, () => true) ?? {})) if (valor) destino.searchParams.set(clave, valor);
      return reescribirConIdioma(request, destino);
    }
  }

  const oficio = /^(?:\/(en))?\/servicios\/([a-z0-9_-]+)(?:\/([a-z-]{2,}))?\/?$/i.exec(pathname);
  if (oficio) {
    const servicioPedido = oficio[2];
    const provinciaPedida = oficio[3];
    const servicioBueno = categorySlug(idDesdeDireccion(servicioPedido));
    const provincia = provinciaPedida ? getProvinceById(provinciaPedida.toLowerCase()) : null;
    const provinciaBuena = provincia ? provincia.slug : provinciaPedida;
    if (servicioBueno !== servicioPedido || provinciaBuena !== provinciaPedida) {
      const cola = provinciaBuena ? `/${provinciaBuena}` : "";
      const destino = new URL(rutaConIdioma(oficio[1], `/servicios/${servicioBueno}${cola}`), request.url);
      destino.search = request.nextUrl.search;
      return NextResponse.redirect(destino, 308);
    }
  }

  // Sin prefijo = español. Solo quien ya está leyendo en inglés (cookie de esta
  // visita o elección guardada) salta a /en/…; a propósito NO se mira el
  // Accept-Language aquí: un rastreador que dice preferir inglés se llevaría un
  // redirect en vez de la página española, que es la canónica.
  // Una PRECARGA no es una lectura: el selector de idioma precarga /en/… para
  // que el cambio sea instantáneo, y el navegador precarga cada enlace del
  // menú. Si esas peticiones contaran como «está leyendo en inglés», la cookie
  // quedaba en inglés después de precargar /en y desde ahí TODO enlace español
  // saltaba a inglés (pasó en producción el 28-sep-2026). Solo la navegación
  // de verdad —el documento— escribe la cookie o se redirige por ella.
  // Next le quita al middleware la cabecera RSC y el `_rsc`, así que la señal
  // es la del navegador: una navegación pide un documento; una precarga o una
  // carga de datos del router piden «text/x-component» o un destino vacío.
  const destino = request.headers.get("sec-fetch-dest");
  const esPrecarga = (destino !== null && destino !== "document")
    || (request.headers.get("accept") ?? "").includes("text/x-component");
  const locale = idiomaDeRuta(pathname);
  if (locale === "es" && !esPrecarga) {
    const guardado = request.cookies.get("NEXT_LOCALE")?.value;
    if (guardado === "en") {
      const url = request.nextUrl.clone();
      url.pathname = rutaConIdioma("en", pathname);
      return NextResponse.redirect(url, 307);
    }
  }

  // Sin el prefijo de idioma, para comparar con las listas de rutas
  const withoutLocale = sinPrefijoDeIdioma(pathname);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );
  const needsAuthGate = isProtected && !isPublic;

  // Base response carries i18n rewrites/headers; we attach any cookie changes.
  // El idioma que se está leyendo viaja como cabecera de la PETICIÓN para que
  // el armazón raíz —que está por encima de `[locale]` y no recibe params—
  // pueda escribir `<html lang>` bien desde el servidor. Antes el HTML siempre
  // decía español y un efecto lo corregía después de hidratar: un buscador que
  // lee /en recibía la página marcada como española.
  request.headers.set("x-ccr-locale", locale);
  const response = conCabecerasDeSeguridad(handleI18n(request));
  // La cookie recuerda el idioma que se está LEYENDO, no solo el que se eligió
  // con el botón. Sin esto, quien llega en inglés por un enlace y luego abre
  // una dirección sin prefijo (el perfil corto, /o/, /e/, /c/) volvía al
  // español de golpe. Solo se escribe cuando cambia, para no ponerle
  // Set-Cookie a cada respuesta y romper la caché de las páginas públicas.
  //
  // ES COOKIE DE SESIÓN, sin fecha de vencimiento: el inglés dura lo que dura
  // la visita —dentro de ella todo sigue en inglés— y al cerrar la app o el
  // navegador se borra, así que la próxima vez vuelve a abrir en español, que
  // es el idioma del país. Antes duraba un año y quien probaba el inglés una
  // vez se quedaba en inglés para siempre.
  if (!esPrecarga && request.cookies.get("NEXT_LOCALE")?.value !== locale) {
    response.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      sameSite: "lax",
    });
  }

  // Anonymous visitors (incognito or simply logged out) have NO Supabase cookie
  // — skip all auth work (same fast path as before). Protected routes still go
  // to login.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookie) {
    if (needsAuthGate) return redirectToLogin(locale, request, response);
    return response;
  }

  // A session cookie exists → validate / silently refresh it. If the token is
  // stale/invalid we recover gracefully: clear the bad cookie so the browser is
  // cleanly logged out (instead of crashing SSR with an AuthApiError on every
  // visit — the reason a normal browser failed where incognito worked).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Local visual/mobile checks may run without Supabase env vars. Do not let
    // stale auth cookies crash the whole app before the page can render.
    clearAuthCookies(request, response);
    if (needsAuthGate) {
      return redirectToLogin(locale, request, response);
    }
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  // "No se pudo comprobar" no es "no hay sesión". Un corte de red o un 5xx de
  // Supabase no debe borrar las cookies: eso deslogueaba de verdad a alguien con
  // sesión válida (y en Mensajes lo mandaba al login). Solo un rechazo definitivo
  // —token inválido/expirado— limpia la sesión.
  let sesionSinComprobar = false;
  // Solo un RECHAZO del servidor de sesiones (401/403: token inválido, refresco
  // vencido, cuenta borrada) autoriza a limpiar las cookies. Antes bastaba con
  // que la comprobación fallara de una forma que la librería no clasificara como
  // "reintentable" —un 5xx, un fetch que no salió, el arranque en frío del worker
  // justo después de publicar— para borrarlas: eso deslogueaba de verdad, y por
  // eso cada publicación sacaba a la gente de la app.
  const rechazoDefinitivo = (error: unknown) => {
    const e = error as { status?: number } | null;
    return typeof e?.status === "number" && (e.status === 401 || e.status === 403);
  };
  try {
    const { data, error } = await withPromiseTimeout(supabase.auth.getUser(), 6_000, "proxy-auth-timeout");
    if (error) sesionSinComprobar = !rechazoDefinitivo(error);
    else user = data.user ?? null;
  } catch (error) {
    // A temporary Supabase/network stall must not leave the previous page behind
    // an endless route loader or erase a potentially valid session. Let the page
    // render; its browser auth guard will reconcile the cookie once connectivity
    // returns. Definite invalid-session responses still follow the cleanup below.
    if (error instanceof PromiseTimeoutError) return response;
    sesionSinComprobar = !rechazoDefinitivo(error);
    user = null;
  }

  // Igual que el timeout: se pinta la página con las cookies intactas y el
  // guardia del navegador reconcilia cuando vuelve la conexión.
  if (sesionSinComprobar) return response;

  if (!user) {
    clearAuthCookies(request, response);
    if (needsAuthGate) return redirectToLogin(locale, request, response);
    return response;
  }

  // Logged in but hasn't chosen a role yet → onboarding (protected routes only).
  if (needsAuthGate) {
    const onboardingDone = user.user_metadata?.onboarding_completed === true;
    if (!onboardingDone) return redirectKeepingCookies(rutaConIdioma(locale, "/onboarding"), request, response);

    // Antes, una cuenta que había EMPEZADO el registro profesional sin
    // terminarlo no podía entrar al panel: cada visita la devolvía al
    // formulario. La bandera se pone al enviar el primer paso, así que alguien
    // que lo intentó y se arrepintió quedaba obligado a completarlo para volver
    // a su propia cuenta. El panel sabe atender a quien no es profesional
    // —es el panel de cliente— y ofrece continuar el registro desde un botón,
    // así que el desvío sobra y encerraba.
  }

  return response;
}

// Expire the Supabase auth cookies on the response so a stale/invalid session
// stops re-triggering errors on every visit. NEVER touch the PKCE
// `…-code-verifier` cookie — clearing it mid-OAuth would make the /auth/callback
// exchange fail (the auth=error a user hit when arriving from a deep-link).
function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token") && !c.name.includes("code-verifier")) {
      response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }
}

// Redirect to login, preserving the original gated destination (path + query) as
// `?redirect=` so login can return the user there — carried through Google OAuth
// (login → ?next= → /auth/callback). Used by both auth-gate branches.
function redirectToLogin(locale: string, request: NextRequest, response: NextResponse) {
  const url = new URL(rutaConIdioma(locale, "/login"), request.url);
  url.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
  const redirectRes = NextResponse.redirect(url);
  response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
  return redirectRes;
}

// Redirect while preserving any cookie changes already staged on `response`
// (refreshed or cleared session cookies).
function redirectKeepingCookies(path: string, request: NextRequest, response: NextResponse) {
  const redirectRes = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
  return redirectRes;
}

export const config = {
  // Skip API routes, Next internals, static files, and /auth/* (OAuth callbacks must
  // reach the route handler directly — the i18n proxy would redirect /auth/callback
  // to /es/auth/callback, losing the PKCE code before it can be exchanged).
  matcher: ["/api/:path*", "/((?!_next|_vercel|auth|.*\\..*).*)"],
};

// Las cabeceras de seguridad viven aquí, no solo en next.config: el adaptador
// de Cloudflare (OpenNext) NO aplica `headers()` de next.config, y ni test ni
// producción las estaban mandando (comprobado con curl -I). El middleware
// sí corre en cada respuesta de página y de API, así que este es el único
// lugar donde de verdad llegan al navegador.
const CABECERAS_DE_SEGURIDAD: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // `Permissions-Policy` estaba solo en next.config, que en Cloudflare no se
  // aplica: nunca llegaba al navegador. Se apagan las capacidades que el app no
  // usa; la cámara y el micrófono los pide la propia página cuando toca.
  "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()",
  // Aísla la ventana de cualquier pestaña que la abra: sin esto, una página que
  // nos abra por `window.open` conserva una referencia a nuestra ventana.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  // La política de contenido de verdad va primero en modo AVISO: recoge lo que
  // rompería sin bloquear nada. Cuando los informes estén limpios se convierte
  // en `Content-Security-Policy`. Las fuentes son las que el app usa hoy:
  // Supabase (datos y realtime), Cloudinary y R2 (imágenes), Google Maps e
  // Identity, y el píxel de Meta.
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://assets.contratacr.com https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com https://www.facebook.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://accounts.google.com https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://translation.googleapis.com https://api.cloudinary.com https://www.facebook.com",
    "frame-src 'self' https://accounts.google.com https://www.facebook.com",
    "worker-src 'self' blob:",
  ].join("; "),
};

function conCabecerasDeSeguridad<T extends NextResponse>(response: T): T {
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_SEGURIDAD)) {
    if (!response.headers.has(nombre)) response.headers.set(nombre, valor);
  }
  return response;
}

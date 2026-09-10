import { createServerClient } from "@supabase/ssr";
import { RUTAS_DEL_SITIO } from "@/lib/site-routes";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
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
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (isUnsafeLocalProductionWrite(request)) return unsafeLocalProductionWriteResponse();
    return NextResponse.next();
  }

  // EVERY unprefixed path redirects to its locale-prefixed canonical URL. This
  // single redirect makes the `[locale]` routes the source of truth, so old
  // non-localized bookmarks/links (/buscar, /login, /registro, /profesionales/…,
  // and any other path) never 404 — they land on the real localized page.
  // Locale = the stored preference (NEXT_LOCALE cookie) when it's "en", else the
  // default "es". First-time visitors (no cookie) still get Spanish — we
  // deliberately do NOT use Accept-Language, so an English browser does not
  // silently flip the site to English. Temporary (307) because the target
  // depends on the cookie (a user can switch locale anytime); SEO canonical-
  // ization is handled by the page metadata, not the redirect status.
  // Vanity bio links (see next.config redirects — this middleware runs first on
  // OpenNext, so they must be resolved here or the locale redirect swallows them).
  const VANITY: Record<string, string> = {
    "/ig": "/es?utm_source=instagram&utm_medium=organic&utm_campaign=bio",
    "/tt": "/es?utm_source=tiktok&utm_medium=organic&utm_campaign=bio",
    "/fb": "/es?utm_source=facebook&utm_medium=organic&utm_campaign=bio",
    "/wa": "/es?utm_source=whatsapp&utm_medium=referral&utm_campaign=bio",
    // Professional recruiting by hand (WhatsApp outreach) — lands on the signup.
    "/pro": "/es/registro/profesional?utm_source=whatsapp&utm_medium=outreach&utm_campaign=pro-invitacion",
  };
  if (VANITY[pathname]) {
    return NextResponse.redirect(new URL(VANITY[pathname], request.url), 307);
  }

  // Enlaces cortos de una ficha: contratacr.com/o/b1baacf7 (oferta),
  // /e/… (empleo) y /c/… (cotización). Se REESCRIBEN, no se redirigen: la
  // dirección se queda corta en la barra, que es de lo que se trata. La forma
  // larga de siempre sigue abriendo lo mismo.
  const FICHAS: Record<string, string> = { o: "ofertas", e: "empleos", c: "cotizacion" };
  const fichaCorta = /^\/([oec])\/([a-z0-9][a-z0-9-]{3,80})$/i.exec(pathname);
  if (fichaCorta) {
    const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "es";
    const destino = new URL(`/${locale}/${FICHAS[fichaCorta[1].toLowerCase()]}/${fichaCorta[2].toLowerCase()}`, request.url);
    destino.search = request.nextUrl.search;
    return NextResponse.rewrite(destino);
  }

  // Enlace público de cada profesional: contratacr.com/nombre-apellido (y la
  // forma con @ que se compartió antes). Solo entra aquí lo que no es una
  // sección del sitio (RUTAS_DEL_SITIO, verificada en CI).
  const perfilCorto = /^\/@?([a-z0-9][a-z0-9-]{2,80})$/.exec(pathname.toLowerCase());
  if (perfilCorto && !RUTAS_DEL_SITIO.has(perfilCorto[1])) {
    const locale = request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "es";
    const destino = new URL(`/${locale}/profesionales/${perfilCorto[1]}`, request.url);
    destino.search = request.nextUrl.search;
    return NextResponse.redirect(destino, 307);
  }

  const hasLocalePrefix = /^\/(?:es|en)(?:\/|$)/.test(pathname);
  if (!hasLocalePrefix) {
    const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
    const target = cookieLocale === "en" ? "en" : "es";
    const url = request.nextUrl.clone();
    url.pathname = `/${target}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // Strip locale prefix to get the base path for matching
  const withoutLocale = pathname.replace(/^\/(?:es|en)/, "") || "/";

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );
  const needsAuthGate = isProtected && !isPublic;

  // Base response carries i18n rewrites/headers; we attach any cookie changes.
  const response = handleI18n(request);
  const locale = pathname.split("/")[1] || "es";
  // La cookie recuerda el idioma que se está LEYENDO, no solo el que se eligió
  // con el botón. Sin esto, quien llega en inglés por un enlace y luego abre
  // una dirección sin prefijo (el perfil corto, /o/, /e/, /c/) volvía al
  // español de golpe. Solo se escribe cuando cambia, para no ponerle
  // Set-Cookie a cada respuesta y romper la caché de las páginas públicas.
  if (request.cookies.get("NEXT_LOCALE")?.value !== locale) {
    response.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 31536000,
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
  try {
    const { data, error } = await withPromiseTimeout(supabase.auth.getUser(), 6_000, "proxy-auth-timeout");
    if (error) sesionSinComprobar = isAuthRetryableFetchError(error);
    else user = data.user ?? null;
  } catch (error) {
    // A temporary Supabase/network stall must not leave the previous page behind
    // an endless route loader or erase a potentially valid session. Let the page
    // render; its browser auth guard will reconcile the cookie once connectivity
    // returns. Definite invalid-session responses still follow the cleanup below.
    if (error instanceof PromiseTimeoutError) return response;
    sesionSinComprobar = isAuthRetryableFetchError(error);
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
    if (!onboardingDone) return redirectKeepingCookies(`/${locale}/onboarding`, request, response);

    // A professional registration that was started but not completed must never
    // render the unified dashboard first. Redirect at the request boundary so
    // there is no panel flash while client-side professional data is loading.
    const professionalSignupIncomplete =
      user.user_metadata?.professional_signup_started === true &&
      user.user_metadata?.is_provider !== true;
    if (professionalSignupIncomplete && withoutLocale.startsWith("/dashboard/profesional")) {
      return redirectKeepingCookies(`/${locale}/registro/profesional`, request, response);
    }
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
  const url = new URL(`/${locale}/login`, request.url);
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

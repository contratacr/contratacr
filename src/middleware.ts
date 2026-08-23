import { createServerClient } from "@supabase/ssr";
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
  };
  if (VANITY[pathname]) {
    return NextResponse.redirect(new URL(VANITY[pathname], request.url), 307);
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
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  try {
    const { data, error } = await withPromiseTimeout(supabase.auth.getUser(), 6_000, "proxy-auth-timeout");
    if (!error) user = data.user ?? null;
  } catch (error) {
    // A temporary Supabase/network stall must not leave the previous page behind
    // an endless route loader or erase a potentially valid session. Let the page
    // render; its browser auth guard will reconcile the cookie once connectivity
    // returns. Definite invalid-session responses still follow the cleanup below.
    if (error instanceof PromiseTimeoutError) return response;
    user = null;
  }

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

import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./src/i18n/routing";

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
  "/como-funciona",
  "/terminos",
  "/privacidad",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Honor a stored language preference (NEXT_LOCALE cookie set by the toggle)
  // for unprefixed URLs only. First-time visitors (no cookie) still default to
  // Spanish — we deliberately do NOT use Accept-Language, so an English browser
  // does not silently flip the site to English.
  const hasLocalePrefix = /^\/(?:es|en)(?:\/|$)/.test(pathname);
  if (!hasLocalePrefix) {
    const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
    if (cookieLocale === "en") {
      const url = request.nextUrl.clone();
      url.pathname = `/en${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
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
    if (needsAuthGate) return redirectKeepingCookies(`/${locale}/login`, request, response);
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
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user ?? null;
  } catch {
    user = null;
  }

  if (!user) {
    clearAuthCookies(request, response);
    if (needsAuthGate) return redirectKeepingCookies(`/${locale}/login`, request, response);
    return response;
  }

  // Logged in but hasn't chosen a role yet → onboarding (protected routes only).
  if (needsAuthGate) {
    const onboardingDone = user.user_metadata?.onboarding_completed === true;
    if (!onboardingDone) return redirectKeepingCookies(`/${locale}/onboarding`, request, response);
  }

  return response;
}

// Expire the Supabase auth cookies on the response so a stale/invalid session
// stops re-triggering errors on every visit.
function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) {
      response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }
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
  // reach the route handler directly — the i18n middleware would redirect /auth/callback
  // to /es/auth/callback, losing the PKCE code before it can be exchanged).
  matcher: ["/((?!api|_next|_vercel|auth|.*\\..*).*)"],
};

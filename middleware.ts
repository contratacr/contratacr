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

  // Strip locale prefix to get the base path for matching
  const withoutLocale = pathname.replace(/^\/(?:es|en)/, "") || "/";

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => withoutLocale === p || withoutLocale.startsWith(p + "/")
  );

  // Only run Supabase checks on protected routes
  if (!isProtected || isPublic) {
    return handleI18n(request);
  }

  // For protected routes: validate session and onboarding status
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = pathname.split("/")[1] || "es";

  // Not logged in → login page
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // Logged in but hasn't chosen a role yet → onboarding
  const onboardingDone = user.user_metadata?.onboarding_completed === true;
  if (!onboardingDone) {
    return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
  }

  return response;
}

export const config = {
  // Skip API routes, Next internals, and static files
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

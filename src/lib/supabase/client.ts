import { createBrowserClient } from "@supabase/ssr";
import { PROD_SUPABASE_REF, supabaseProjectRefFromUrl } from "@/lib/security/supabase-target";

function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

export function hasSupabaseBrowserConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createClient() {
  if (!hasSupabaseBrowserConfig()) {
    throw new Error("Supabase browser env vars are not configured.");
  }

  if (
    isLocalBrowser() &&
    supabaseProjectRefFromUrl() === PROD_SUPABASE_REF
  ) {
    throw new Error("Localhost esta bloqueado contra Supabase produccion. Use .env.test para desarrollo local.");
  }

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Only the opt-in local HTTPS gateway rewrites browser requests. Server-side
  // clients keep loopback, and cookies keep the same name on both sides.
  const lanOrigin = process.env.NODE_ENV === "development" ? process.env.NEXT_PUBLIC_PRO_LAN_ORIGIN : undefined;
  const useLocalGateway = typeof window !== "undefined" && lanOrigin === window.location.origin
    && new URL(configuredUrl).hostname === "127.0.0.1";
  return createBrowserClient(
    useLocalGateway ? `${lanOrigin}/__local_supabase` : configuredUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    useLocalGateway ? { cookieOptions: { name: "sb-127-auth-token" } } : undefined
  );
}

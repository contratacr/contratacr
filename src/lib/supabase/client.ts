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
    throw new Error("Localhost esta bloqueado contra Supabase produccion. Usa .env.test para desarrollo local.");
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

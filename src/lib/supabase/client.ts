import { createBrowserClient } from "@supabase/ssr";

const PROD_SUPABASE_REF = "kskueodxaksxvjrysouw";

function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
}

function supabaseRef() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
  } catch {
    return "";
  }
}

export function createClient() {
  if (
    isLocalBrowser() &&
    supabaseRef() === PROD_SUPABASE_REF
  ) {
    throw new Error("Localhost esta bloqueado contra Supabase produccion. Usa .env.test para desarrollo local.");
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

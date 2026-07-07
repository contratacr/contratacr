export const PROD_SUPABASE_REF = "kskueodxaksxvjrysouw";

export function supabaseProjectRefFromUrl(url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

export function getSupabaseProjectRef() {
  return supabaseProjectRefFromUrl();
}

export function isProductionSupabaseTarget() {
  return getSupabaseProjectRef() === PROD_SUPABASE_REF;
}

export function isUnsafeProductionSupabaseRuntime() {
  if (!isProductionSupabaseTarget()) return false;

  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv !== "production";

  return process.env.NODE_ENV !== "production";
}

export function assertSafeSupabaseRuntime(clientName = "Supabase") {
  if (!isUnsafeProductionSupabaseRuntime()) return;
  throw new Error(
    `${clientName} bloqueado: este runtime no puede apuntar a Supabase produccion. Usa .env.test para desarrollo/test.`
  );
}

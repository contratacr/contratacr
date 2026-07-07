import { createClient } from "@supabase/supabase-js";
import { assertSafeSupabaseRuntime } from "@/lib/security/supabase-target";

export function createAdminClient() {
  assertSafeSupabaseRuntime("Supabase admin");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

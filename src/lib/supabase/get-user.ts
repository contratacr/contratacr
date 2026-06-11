import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * getUser() that NEVER throws on a stale/expired/invalid session.
 *
 * A returning user with an old refresh token would otherwise make
 * `supabase.auth.getUser()` throw an AuthApiError during the silent refresh,
 * which (in a Server Component) bubbles up to the error boundary and shows the
 * generic "Algo salió mal" screen. Here we treat any auth failure as
 * "logged out" (return null) so the page renders normally for that user.
 */
export async function safeGetUser(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

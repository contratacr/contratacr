import { createClient } from "@supabase/supabase-js";

/** Check a password in an isolated, memory-only session. Reauthenticating the
 * shared client would replace its AAL2 session with AAL1 during a password change. */
export async function verifyCurrentPassword(email: string, password: string, userId: string): Promise<boolean> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storageKey: `ccr-password-validation-${crypto.randomUUID()}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return !error && data.user?.id === userId;
  } catch { return false; }
  finally { await client.auth.signOut({ scope: "local" }).catch(() => {}); }
}

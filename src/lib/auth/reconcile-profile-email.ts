import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Free a STALE email reservation in `profiles` so a genuinely-available email can be reused.
 *
 * The partial unique index `idx_profiles_email_unique` (migration 007) mirrors Auth's email
 * uniqueness. But a `profiles` row can hold an OLD email after that account CHANGED its email
 * (if the sync trigger/mirror didn't run), or be an ORPHAN whose auth user was deleted. A new
 * signup reusing that — now free in Auth — email then collides with the stale row and is
 * wrongly rejected as "ya registrado". (Auth is the source of truth; `profiles.email` only
 * exists to power fast lookups + this index.)
 *
 * Given an email that just collided, reconcile EVERY profiles row holding it against
 * `auth.users`:
 *  - auth user GONE (confirmed not-found) → delete the profile row (frees the email).
 *  - auth email DIFFERS (stale)           → re-sync the profile row to the real auth email.
 *  - auth email STILL equals it           → a GENUINE duplicate (the email is truly taken).
 *  - transient/unknown lookup             → leave it untouched, treat as taken (never corrupt).
 *
 * Returns true when the email is now FREE (all holders were stale/healed), false when a
 * genuine duplicate remains. Idempotent; safe to call right before a retry of the upsert.
 */
export async function reconcileProfileEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  email: string,
): Promise<boolean> {
  const target = (email ?? "").trim().toLowerCase();
  if (!target) return true;

  const { data: rows } = await admin.from("profiles").select("id").ilike("email", target);
  if (!rows || rows.length === 0) return true;

  let free = true;
  for (const row of rows as { id: string }[]) {
    let authEmail: string | null = null;
    let authExists = false;
    let lookupOk = false;
    try {
      const { data, error } = await admin.auth.admin.getUserById(row.id);
      lookupOk = true;
      authExists = !!data?.user;
      authEmail = data?.user?.email ?? null;
      // A definite "not found" still surfaces as an error with no user — that's an orphan.
      if (error && data?.user) authExists = true;
    } catch {
      lookupOk = false; // transient — be conservative below
    }

    if (authExists && authEmail && authEmail.toLowerCase() === target) {
      free = false; // the holder's auth user STILL uses this email → genuine duplicate
    } else if (authExists && authEmail) {
      await admin.from("profiles").update({ email: authEmail }).eq("id", row.id); // stale → re-sync
    } else if (lookupOk && !authExists) {
      await admin.from("profiles").delete().eq("id", row.id); // confirmed orphan → free it
    } else {
      free = false; // unknown (auth user without email, or transient error) → don't touch
    }
  }
  return free;
}

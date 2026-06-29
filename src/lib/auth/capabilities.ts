// ONE account, two capabilities (Airbnb model)
// ---------------------------------------------------------------------------
// Every account can SEEK (search / hire) from the start — that's always-on and
// needs no flag. OFFERING services is a capability UNLOCKED by completing the
// professional profile. `is_provider` is the canonical signal (a `profiles`
// column kept in sync by a DB trigger and mirrored into auth metadata for
// instant client reads). The legacy `role === "professional"` is still honored
// for back-compat. There is no permanent "client vs professional" identity —
// just an account that may or may not have unlocked offering yet.

type WithMeta = { user_metadata?: Record<string, unknown> | null } | null | undefined;

/** True when the account can OFFER services (has completed the professional profile). */
export function canOffer(user: WithMeta): boolean {
  const m = user?.user_metadata;
  if (!m) return false;
  return m.is_provider === true;
}

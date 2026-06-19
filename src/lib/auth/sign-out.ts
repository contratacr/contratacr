import { createClient } from "@/lib/supabase/client";

// Module-level flag, shared across the whole client bundle — the navbar AND every
// protected page import this same instance. It's set the INSTANT a sign-out begins
// so a page's "no user → /login" guard (which fires the moment `signOut` nulls the
// session, BEFORE the home redirect lands) is suppressed. Without it, logging out
// from the navbar account menu briefly FLASHES /login before redirecting to home.
let _signingOut = false;

/** True while a sign-out is in flight — protected pages check this before bouncing
 *  an absent user to /login, so the logout goes STRAIGHT to home (no /login flash). */
export function isSigningOut() {
  return _signingOut;
}

/** Sign out and go straight to the locale home. Uses `replace` (logout isn't kept in
 *  history) and `scope: "local"` (clears the client session immediately — snappy). */
export async function signOutToHome(locale: string) {
  _signingOut = true;
  try {
    await createClient().auth.signOut({ scope: "local" });
  } catch {
    /* even if the network call fails, the local session is cleared — go home anyway */
  }
  window.location.replace(`/${locale || "es"}`);
}

// Client helpers to guide users to the correct sign-in method (one email = one
// account). Backed by /api/auth/method, which returns which provider(s) an email's
// account uses without exposing any other data.

/**
 * Returns the social provider (Google, Apple or Facebook) IF the email's account is
 * SOCIAL-ONLY (created via that provider, no app password) — so the UI can say
 * "use Google" instead of a vague error or creating a duplicate. Returns null if
 * the account has a password, doesn't exist, or on any error (best-effort).
 */
export async function detectSocialOnly(email: string): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const m = await r.json();
    if (m?.exists && !m.hasPassword && Array.isArray(m.social) && m.social.length > 0) {
      return m.social.includes("apple") ? "apple" : m.social.includes("google") ? "google" : m.social.includes("facebook") ? "facebook" : m.social[0];
    }
  } catch { /* ignore — caller falls back to a generic message */ }
  return null;
}

export const providerLabel = (p: string): string =>
  p === "google" ? "Google" : p === "apple" ? "Apple" : p === "facebook" ? "Facebook" : p;

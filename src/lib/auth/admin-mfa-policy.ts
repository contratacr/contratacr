// Only pass cryptographically verified Supabase JWT claims to this policy.
export const ADMIN_MFA_MAX_AGE_SECONDS = 15 * 60;
export function hasRecentAdminMfa(claims: { aal?: unknown; amr?: unknown }, now = Date.now() / 1000): boolean {
  if (claims.aal !== "aal2" || !Array.isArray(claims.amr)) return false;
  return claims.amr.some(entry => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (method === "totp" || method === "mfa/totp") && typeof timestamp === "number"
      && Number.isFinite(timestamp) && timestamp <= now + 30 && now - timestamp < ADMIN_MFA_MAX_AGE_SECONDS;
  });
}

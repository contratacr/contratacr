// Only pass cryptographically verified Supabase JWT claims to this policy.
/** A completed second factor remains valid for this session, including token refreshes. */
export function hasAdminSessionMfa(claims: { aal?: unknown; amr?: unknown }, now = Date.now() / 1000): boolean {
  if (claims.aal !== "aal2" || !Array.isArray(claims.amr)) return false;
  return claims.amr.some(entry => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (method === "totp" || method === "mfa/totp") && typeof timestamp === "number"
      && Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + 30;
  });
}

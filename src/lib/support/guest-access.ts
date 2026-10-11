import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const GUEST_ACCESS_SECONDS = 14 * 24 * 60 * 60;
const key = () => process.env.SUPPORT_GUEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const emailKey = (email: string) => email.trim().toLowerCase();

// Separate HMAC domain from other links signed with the service key. This is a
// capability for ONE guest access-support case, never a Supabase session.
function sign(id: string, email: string, expires: string) {
  return createHmac("sha256", key()).update(`support-guest:v1:${id}:${emailKey(email)}:${expires}`).digest("base64url");
}

export function guestAccessToken(id: string, email: string, now = Date.now()): string | null {
  if (!key() || !UUID.test(id) || !emailKey(email)) return null;
  const expires = String(Math.floor(now / 1000) + GUEST_ACCESS_SECONDS);
  return `${expires}.${sign(id, email, expires)}`;
}

export function validGuestAccess(id: string, email: string, token: string, now = Date.now()): boolean {
  if (!key() || !UUID.test(id) || typeof token !== "string") return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + GUEST_ACCESS_SECONDS) return false;
  const expected = sign(id, email, match[1]);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(match[2]));
}

export function guestAccessEligible(ticket: { user_id?: string | null; topic?: string | null }) {
  return !ticket.user_id && ticket.topic === "subject1";
}

export function guestAccessLink(origin: string, id: string, email: string) {
  const token = guestAccessToken(id, email);
  // Fragment stays out of server/access logs and HTTP Referer headers.
  return token ? `${origin.replace(/\/$/, "")}/soporte/caso/${id}#${token}` : null;
}

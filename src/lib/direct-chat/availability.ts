import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const FRESH_PUSH_DAYS = 30;
type Recipient = { id: string; profileId?: string | null };

/** Private, viewer-scoped channel decision. A blocked chat must never expose WhatsApp. */
export async function contactAvailability(viewerId: string, recipients: Recipient[]): Promise<Record<string, boolean>> {
  if (!recipients.length) return {};
  const db = createAdminClient();
  const ids = recipients.map(row => row.id);
  const profiles = [...new Set(recipients.flatMap(row => row.profileId ? [row.profileId] : []))];
  const signal = AbortSignal.timeout(1500);
  const [push, blocked] = await Promise.all([
    profiles.length ? db.from("user_push_tokens").select("user_id").in("user_id", profiles)
      .eq("is_active", true).gte("last_seen_at", new Date(Date.now() - FRESH_PUSH_DAYS * 86_400_000).toISOString()).abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    db.from("direct_conversations").select("professional_id").eq("client_id", viewerId)
      .eq("status", "blocked").in("professional_id", ids).abortSignal(signal),
  ]);
  if (push.error || blocked.error) throw new Error("contact-availability-unavailable");
  const reachable = new Set((push.data ?? []).map(row => row.user_id));
  const blockedIds = new Set((blocked.data ?? []).map(row => row.professional_id));
  return Object.fromEntries(recipients.map(row => [row.id, blockedIds.has(row.id) || !!row.profileId && reachable.has(row.profileId)]));
}

/** No session means no private query and an immediately usable anonymous CTA. */
export async function initialContactAvailability(viewerId: string | undefined, recipients: Recipient[]) {
  const values = viewerId ? await contactAvailability(viewerId, recipients).catch(() => ({})) : {};
  return { viewerId: viewerId ?? "", values, resolvedAt: Date.now() };
}

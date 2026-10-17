import type { createAdminClient } from "@/lib/supabase/admin";
import { documentCaseId } from "./documents";

/** Same identity/review cycle as document uploads; repeated appeals reuse one case. */
export async function requestManualVerification(
  db: ReturnType<typeof createAdminClient>,
  owner: { id: string; cedula: string | null; full_name: string | null; email: string | null },
  professionalId: string, message: string,
) {
  const { data: decision, error: decisionError } = await db.from("provider_verification_log").select("id")
    .eq("professional_id", professionalId).in("action", ["verified", "rejected", "reverted_pending"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (decisionError) throw decisionError;
  const ticketId = documentCaseId(owner.id, owner.cedula ?? "", decision?.id ?? null);
  const messageId = documentCaseId(owner.id, owner.cedula ?? "", `appeal:${decision?.id ?? "initial"}`);
  const body = message || "Solicito revisión manual de mi identificación.";
  const now = new Date().toISOString();
  const { error: ticketError } = await db.from("support_tickets").upsert({
    id: ticketId, user_id: owner.id, professional_id: professionalId, name: owner.full_name || owner.email || "Usuario", email: owner.email ?? "",
    topic: "verification_appeal", subject: "Apelación de verificación", message: body,
    status: "open", last_reply_role: "user", last_reply_at: now,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (ticketError) throw ticketError;
  const { error: messageError } = await db.from("support_ticket_messages").upsert({
    id: messageId, ticket_id: ticketId, sender_id: owner.id, sender_role: "user", sender_name: owner.full_name || owner.email || "Usuario", body,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (messageError) throw messageError;
  const { error: appealError } = await db.from("provider_appeals").upsert({ id: messageId, professional_id: professionalId, message: body }, { onConflict: "id", ignoreDuplicates: true });
  if (appealError) throw appealError;
  // An explicit new user appeal can reopen a resolved support conversation.
  const { error: reopenError } = await db.from("support_tickets").update({ status: "open", last_reply_role: "user", last_reply_at: now }).eq("id", ticketId).eq("status", "resolved");
  if (reopenError) throw reopenError;
  const { error: statusError } = await db.from("professionals").update({ verification_status: "under_appeal", verification_updated_at: now })
    .eq("id", professionalId).neq("verification_status", "verified");
  if (statusError) throw statusError;
  return ticketId;
}

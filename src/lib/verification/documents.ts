import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** One case per saved identity/review cycle; HTTP retries reuse the same message. */
export function documentCaseId(userId: string, cedula: string, reviewCycle: string | null) {
  const hex = createHash("sha256").update(JSON.stringify(["verification-documents", userId, cedula, reviewCycle])).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

/** null means unavailable: reminder dispatch must fail closed. */
export async function hasVerificationDocuments(userId: string): Promise<boolean | null> {
  const db = createAdminClient();
  const { data: tickets, error } = await db.from("support_tickets").select("id")
    .eq("user_id", userId).eq("topic", "verification_documents").in("status", ["open", "in_progress"]);
  if (error) return null;
  if (!tickets?.length) return false;
  const { data: messages, error: messageError } = await db.from("support_ticket_messages").select("attachments")
    .in("ticket_id", tickets.map(t => t.id)).eq("sender_role", "user");
  if (messageError) return null;
  return messages?.some(m => Array.isArray(m.attachments) && m.attachments.length > 0) ?? false;
}

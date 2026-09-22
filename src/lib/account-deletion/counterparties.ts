import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationPush } from "@/lib/push/notify";

// When an account is deleted for good, the people on the other side of its open
// relationships must not be left guessing: the request, project, application or
// conversation simply vanishes for them. Collect those people before the
// finalizer runs (it anonymizes and deletes the rows) and tell them afterwards,
// in plain words and without naming anything that no longer exists.

export type Counterparty = { userId: string; what: string };


export async function collectCounterparties(db: SupabaseClient, userId: string): Promise<{ name: string; parties: Counterparty[] }> {
  const parties = new Map<string, Set<string>>();
  const add = (otherUserId: string | null | undefined, what: string) => {
    if (!otherUserId || otherUserId === userId) return;
    const set = parties.get(otherUserId) ?? new Set<string>();
    set.add(what);
    parties.set(otherUserId, set);
  };

  const { data: profile } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { data: ownPros } = await db.from("professionals").select("id, business_name").eq("profile_id", userId);
  const name = (ownPros?.[0]?.business_name || profile?.full_name || "Una persona").trim();


  // Solo cuenta la CONVERSACION abierta. Las citas, las propuestas y las
  // postulaciones salieron del producto: ya no hay «una cita abierta» ni «un
  // proyecto en curso» que alguien reconozca como algo pendiente con esta
  // cuenta. Quien contacto por WhatsApp no deja rastro aqui, y esta bien: ese
  // hilo vive en su telefono, no en el app.

  // Direct conversations that were still active.
  const { data: conversations } = await db
    .from("direct_conversations")
    .select("client_id, professional_profile_id, status")
    .or(`client_id.eq.${userId},professional_profile_id.eq.${userId}`)
    .neq("status", "closed");
  for (const row of conversations ?? []) {
    add(row.client_id === userId ? (row.professional_profile_id as string) : (row.client_id as string), "una conversación abierta");
  }

  return { name, parties: [...parties.entries()].map(([otherUserId, whats]) => ({ userId: otherUserId, what: [...whats].join(", ") })) };
}

export async function notifyCounterparties(db: SupabaseClient, name: string, parties: Counterparty[]): Promise<void> {
  for (const party of parties) {
    try {
      // El MISMO titulo que pinta la campana. Decia uno en el push y otro en
      // la campana, asi que el mismo aviso se leia distinto en cada lado.
      const title = "Una cuenta con la que coordinabas se cerró";
      const message = `${name} eliminó su cuenta de ContrataCR. Tenían ${party.what}; ya no aparece en tu panel y no hace falta que hagas nada. Si necesitas ayuda, escríbenos a soporte.`;
      const notification = { user_id: party.userId, type: "counterparty_account_deleted", title, message, // `link`, no `href`: `notificationHref` solo mira `link`, asi que el
        // aviso se enlazaba a si mismo —abria la propia lista de avisos—.
        data: { link: "/es/dashboard/profesional?tab=soporte" } };
      const { error } = await db.from("notifications").insert(notification);
      if (error) throw error;
      await sendNotificationPush({ userId: party.userId, title, message, data: notification.data });
    } catch (error) {
      console.warn("[account-deletion] counterparty notice failed", party.userId, error instanceof Error ? error.message : error);
    }
  }
}

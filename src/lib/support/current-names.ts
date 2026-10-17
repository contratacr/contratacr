import type { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfileNames } from "@/lib/profiles/current-names";

type Ticket = { id: string; user_id?: string | null; name?: string | null };
type Message = { ticket_id?: string; sender_role?: string; sender_id?: string | null; sender_name?: string | null };

/** Display live identity labels while preserving original tickets/message text. */
export async function withCurrentSupportNames<T extends Ticket, M extends Message = Message>(
  db: ReturnType<typeof createAdminClient>, tickets: T[], messages: M[] = [],
) {
  const owners = new Map(tickets.map((ticket) => [ticket.id, ticket.user_id]));
  const sender = (message: M) => message.sender_role === "user"
    ? message.sender_id || owners.get(message.ticket_id ?? "") : null;
  const names = await getCurrentProfileNames(db, [...tickets.map((ticket) => ticket.user_id), ...messages.map(sender)]);
  return {
    tickets: tickets.map((ticket) => ({ ...ticket, name: names.get(ticket.user_id ?? "") || ticket.name })),
    messages: messages.map((message) => ({ ...message, sender_name: names.get(sender(message) ?? "") || message.sender_name })),
  };
}

export function supportTicketRef(ticketId: string): string {
  const compact = ticketId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!compact) return ticketId.slice(0, 10).toUpperCase();
  return `SUP-${compact.slice(0, 4)}-${compact.slice(-4)}`;
}

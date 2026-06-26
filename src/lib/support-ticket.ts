export function supportTicketRef(ticketId: string): string {
  const hex = ticketId.replace(/[^a-fA-F0-9]/g, "").slice(0, 12);
  if (!hex) return ticketId.slice(0, 6).toUpperCase();
  return String((Number.parseInt(hex, 16) % 900000) + 100000);
}

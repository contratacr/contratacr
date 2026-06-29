export function supportTicketRef(ticketId: string, createdAt?: string | null, caseNumber?: number | string | null): string {
  if (caseNumber != null && String(caseNumber).trim()) {
    const parsedYear = createdAt ? new Date(createdAt).getFullYear() : NaN;
    const year = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
    const numeric = String(caseNumber).replace(/\D/g, "");
    const padded = numeric.padStart(4, "0");
    return `SUP-${year}-${padded}`;
  }

  const compact = ticketId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!compact) return ticketId.slice(0, 10).toUpperCase();
  return `SUP-${compact.slice(0, 4)}-${compact.slice(-4)}`;
}

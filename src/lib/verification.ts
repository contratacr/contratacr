// Shared "Proveedor Autorizado" verification lifecycle — used by the admin
// panel, the provider dashboard, search and the public profile.

export type VerificationStatus = "pending" | "authorized" | "rejected" | "under_appeal";

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  "pending",
  "authorized",
  "rejected",
  "under_appeal",
];

export function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case "authorized":
      return "Autorizado";
    case "rejected":
      return "Rechazado";
    case "under_appeal":
      return "En apelación";
    case "pending":
    default:
      return "Pendiente de revisión";
  }
}

/** Tailwind classes for a status pill. */
export function verificationPillClasses(status: VerificationStatus): string {
  switch (status) {
    case "authorized":
      return "bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]";
    case "rejected":
      return "bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]";
    case "under_appeal":
      return "bg-[#fef3c7] text-[#b45309] border-[#fde68a]";
    case "pending":
    default:
      return "bg-[#e5e7eb] text-[#374151] border-[#d1d5db]";
  }
}

export function isAuthorized(status?: string | null): boolean {
  return status === "authorized";
}

/** A short, human-friendly case id for WhatsApp / support references. */
export function caseRef(professionalId: string): string {
  return professionalId.slice(0, 8).toUpperCase();
}

import { cleanId, isValidId } from "@/lib/cedula";

export const ID_NOT_FOUND_REASON = "Identificación no encontrada.";

// Only a recorded negative result for the current document enables review.
// Changing the document clears the provider and reason in add-cedula.
export function canRequestIdentityReview(pro: {
  verification_status?: string | null;
  is_verified?: boolean | null;
  verification_provider?: string | null;
  verification_reason?: string | null;
}, cedula: string | null | undefined): boolean {
  if (pro.is_verified || pro.verification_status === "verified" || !isValidId(cleanId(cedula ?? ""))) return false;
  if (!pro.verification_provider?.startsWith("hacienda_api")) return false;
  const reason = pro.verification_reason ?? "";
  return reason === ID_NOT_FOUND_REASON || reason.startsWith("No encontramos esta identificación en Hacienda.");
}

import { cleanId, isValidId } from "../cedula";

export function projectIdentity(input: string, saved: { cedula?: string | null; client_identity_status?: string | null } | null) {
  const supplied = cleanId(input);
  if (supplied) return isValidId(supplied) ? supplied : null;
  const existing = cleanId(saved?.cedula ?? "");
  return saved?.client_identity_status === "verified" && isValidId(existing) ? existing : null;
}

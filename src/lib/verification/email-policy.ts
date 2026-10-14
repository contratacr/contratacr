/** Decision emails are useful only after registration and for a final decision. */
export function shouldEmailVerificationDecision(kind: "verified" | "pending" | "rejected" | "reverted", channel: "both" | "in_app") {
  return channel === "both" && kind !== "pending";
}

/** Fail closed for verified or inconsistent records, including direct calls. */
export function canReceiveVerificationOutreach(pro: { verification_status: string | null; is_verified: boolean | null }) {
  return pro.is_verified !== true && (pro.verification_status === "pending" || pro.verification_status === "under_appeal");
}

// Pending in either source wins: old OAuth sessions can say complete while
// the profile is still pending, and a signup trigger can produce the reverse.
// Older accounts without a metadata flag still use the persisted profile.
export function registrationComplete(metadata: Record<string, unknown> = {}, profileComplete?: boolean): boolean {
  if (profileComplete === false) return false;
  return typeof metadata.onboarding_completed === "boolean"
    ? metadata.onboarding_completed
    : profileComplete === true;
}

export function pendingRegistrationPath(metadata: Record<string, unknown> = {}): string {
  if (metadata.intended_role === "professional" || metadata.role === "professional" || metadata.professional_signup_started === true) return "/registro/profesional";
  if (metadata.role === "client") return "/registro/cliente";
  return "/onboarding";
}

export function registrationIntentMatches(metadata: Record<string, unknown>, role: "client" | "professional"): boolean {
  const intended = role === "professional" ? "professional" : null;
  const currentIntent = metadata.intended_role === "professional" ? "professional" : null;
  return metadata.role === "client" && currentIntent === intended && (role === "professional" || metadata.professional_signup_started !== true);
}

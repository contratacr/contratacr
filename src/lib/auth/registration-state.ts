// An explicit pending flag must win over a legacy/stale profile row. Older
// accounts without the metadata flag may still use the profile fallback.
export function registrationComplete(metadata: Record<string, unknown> = {}, profileComplete?: boolean): boolean {
  return typeof metadata.onboarding_completed === "boolean"
    ? metadata.onboarding_completed
    : profileComplete === true;
}

export function pendingRegistrationPath(metadata: Record<string, unknown> = {}): string {
  if (metadata.intended_role === "professional" || metadata.role === "professional" || metadata.professional_signup_started === true) return "/registro/profesional";
  if (metadata.role === "client") return "/registro/cliente";
  return "/onboarding";
}

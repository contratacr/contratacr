export const NATIVE_ONBOARDING_COMPLETED_KEY = "ccr:native-first-run-onboarding:v12";
export const NATIVE_ONBOARDING_COMPLETED_EVENT = "contratacr:native-onboarding-complete";
export const NATIVE_ONBOARDING_PENDING_PATH_KEY = "ccr:native-first-run-pending-path:v1";

export type NativeOnboardingPendingPath =
  | "/login"
  | "/registro/cliente"
  | "/registro/profesional";

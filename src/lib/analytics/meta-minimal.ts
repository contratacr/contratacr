import { GROWTH_ACTIONS } from "./growth-contract";
/** Closed outbound contract: never forward caller-supplied objects to Meta. */
export const META_MEASUREMENT_VERSION = "minimal-2026-10-20";
export const META_EVENTS = ["PageView", "Search", "CompleteRegistration", "Contact", "Lead", "ServiceHireConfirmed", "ProfessionalProfilePublished", "ProfessionalProjectContact", "ProfessionalProjectAccepted", "ServiceOfferPublished", "EmployerJobPublished"] as const;
const PATHS = new Set(["/", "/profesionales", "/proyectos", "/promociones", "/empleos", "/registro", "/dashboard/cliente", "/dashboard/profesional"]);
export function minimalMetaPayload(input: Record<string, unknown>): Record<string, unknown> | null {
  const custom = input.custom_data as Record<string, unknown> | undefined;
  if (custom?.measurement_version !== META_MEASUREMENT_VERSION || !META_EVENTS.includes(input.event_name as typeof META_EVENTS[number])) return null;
  if (typeof input.event_id !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(input.event_id) || !Number.isInteger(input.event_time)) return null;
  const user = input.user_data as Record<string, unknown> | undefined;
  const userData: Record<string, string> = {};
  for (const key of ["fbp", "fbc"] as const) {
    const value = user?.[key];
    if (typeof value === "string" && /^fb\.1\.\d{13}\.[a-zA-Z0-9_-]{1,500}$/.test(value)) userData[key] = value;
  }
  // No account hashes, email, phone, name, address, IP, location or free text.
  // Browser technical data and an ad/browser ID are still pseudonymous data.
  if (!userData.fbp && !userData.fbc) return null;
  if (typeof user?.client_user_agent === "string") userData.client_user_agent = user.client_user_agent.slice(0, 500);
  let path = "/";
  try { const url = new URL(String(input.event_source_url)); if (url.origin === "https://contratacr.com" && PATHS.has(url.pathname)) path = url.pathname; } catch { /* fixed fallback */ }
  const action = Object.entries(GROWTH_ACTIONS).find(([key, value]) => key === custom.action && value.event === input.event_name);
  // Business conversions must carry their matching, server-issued action.
  // A contact click must never be relabelled as a confirmed hire.
  if (Object.values(GROWTH_ACTIONS).some(value => value.event === input.event_name) && !action) return null;
  return {
    event_name: input.event_name, event_id: input.event_id, event_time: input.event_time,
    action_source: "website", event_source_url: `https://contratacr.com${path}`,
    user_data: userData,
    custom_data: { measurement_version: META_MEASUREMENT_VERSION, ...(action ? { action: action[0], audience: action[1].audience } : {}) },
  };
}

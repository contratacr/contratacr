// ─── Support contact — update these when the final number is confirmed ────────

export const SUPPORT_WHATSAPP_NUMBER = "89624340";
export const SUPPORT_WHATSAPP_DISPLAY = "+506 8962-4340";
export const SUPPORT_WHATSAPP_URL = `https://wa.me/506${SUPPORT_WHATSAPP_NUMBER}`;
export const SUPPORT_EMAIL            = "soporte@contratacr.com";

// ─── How a professional wants to be contacted ────────────────────────────────
// `solo_citas` is a LEGACY stored value (the old app-only option). It's no longer
// offered in the UI and is treated everywhere as `ambas` (WhatsApp is always
// available, so there is no real app-only-without-WhatsApp case). Migrated in the
// DB by migration 042; the type keeps it only for backward compatibility.
export type ContactPreference = "solo_whatsapp" | "solo_citas" | "ambas";

// ─── Account type ────────────────────────────────────────────────────────────
export type AccountType = "individual" | "empresa";

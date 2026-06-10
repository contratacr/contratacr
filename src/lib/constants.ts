// ─── Support contact — update these when the final number is confirmed ────────

export const SUPPORT_WHATSAPP_NUMBER  = "50687454360";
export const SUPPORT_WHATSAPP_MESSAGE = "Hola, necesito ayuda con ContrataCR";
export const SUPPORT_WHATSAPP_URL     = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE)}`;
export const SUPPORT_EMAIL            = "soporte@contratacr.com";

// ─── How a professional wants to be contacted ────────────────────────────────
// `solo_citas` is a LEGACY stored value (the old app-only option). It's no longer
// offered in the UI and is treated everywhere as `ambas` (WhatsApp is always
// available, so there is no real app-only-without-WhatsApp case). Migrated in the
// DB by migration 042; the type keeps it only for backward compatibility.
export type ContactPreference = "solo_whatsapp" | "solo_citas" | "ambas";

export const CONTACT_PREFERENCES: { value: ContactPreference; label: string; hint: string }[] = [
  { value: "solo_whatsapp", label: "Solo WhatsApp",      hint: "Los clientes te escriben directo para coordinar." },
  { value: "ambas",         label: "Agenda + WhatsApp",  hint: "Los clientes ven tus horarios y agendan, o te escriben por WhatsApp." },
];

// ─── Account type ────────────────────────────────────────────────────────────
export type AccountType = "individual" | "empresa";

// ─── Support contact — update these when the final number is confirmed ────────

export const SUPPORT_WHATSAPP_NUMBER  = "50687454360";
export const SUPPORT_WHATSAPP_MESSAGE = "Hola, necesito ayuda con ContrataCR";
export const SUPPORT_WHATSAPP_URL     = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE)}`;
export const SUPPORT_EMAIL            = "soporte@contratacr.com";

// ─── How a professional wants to be contacted ────────────────────────────────
export type ContactPreference = "solo_whatsapp" | "solo_citas" | "ambas";

export const CONTACT_PREFERENCES: { value: ContactPreference; label: string; hint: string }[] = [
  { value: "ambas",         label: "Ambas opciones",       hint: "Citas en la app y WhatsApp" },
  { value: "solo_citas",    label: "Solo citas en la app", hint: "Los clientes agendan por ContrataCR" },
  { value: "solo_whatsapp", label: "Solo WhatsApp",        hint: "Los clientes te escriben directo" },
];

// ─── Account type ────────────────────────────────────────────────────────────
export type AccountType = "individual" | "empresa";

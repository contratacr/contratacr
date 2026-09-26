// ─── Contacto de soporte ──────────────────────────────────────────────────────
// El WhatsApp salió de aquí. Era un número provisional («hasta confirmar el
// definitivo») que apuntaba a la API de Meta, cuyo buzón no lee nadie — y aun
// así se coló en el aviso de verificación, mandando a los profesionales a
// enviar sus fotos a un lugar donde no llegaban. El correo sí se lee.
export const SUPPORT_EMAIL = "soporte@contratacr.com";

// ─── How a professional wants to be contacted ────────────────────────────────
// `solo_citas` is a LEGACY stored value (the old app-only option). It's no longer
// offered in the UI and is treated everywhere as `ambas` (WhatsApp is always
// available, so there is no real app-only-without-WhatsApp case). Migrated in the
// DB by migration 042; the type keeps it only for backward compatibility.
export type ContactPreference = "solo_whatsapp" | "solo_citas" | "ambas";

// ─── Account type ────────────────────────────────────────────────────────────
export type AccountType = "individual" | "empresa";

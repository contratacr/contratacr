// Contact details (WhatsApp, call number, email) leave the server only for
// signed-in viewers. Anonymous payloads keep boolean flags so the UI can still
// show the right buttons; the numbers themselves are fetched after the account
// gate through /api/contact/reveal or /api/contact/whatsapp-link.

type ContactFields = {
  whatsapp?: string | null;
  callPhone?: string | null;
  contactEmail?: string | null;
  allowPhoneCall?: boolean | null;
};

export type ContactFlags = {
  hasWhatsapp: boolean;
  hasCallPhone: boolean;
  hasContactEmail: boolean;
};

export function contactFlags(pro: ContactFields): ContactFlags {
  const whatsapp = (pro.whatsapp ?? "").replace(/\D/g, "");
  const callPhone = (pro.callPhone ?? "").replace(/\D/g, "");
  return {
    hasWhatsapp: whatsapp.length > 0,
    hasCallPhone: !!pro.allowPhoneCall && (callPhone.length > 0 || whatsapp.length > 0),
    hasContactEmail: !!(pro.contactEmail ?? "").trim(),
  };
}

export function redactContact<T extends ContactFields>(pro: T, viewerCanSee: boolean): T & ContactFlags {
  const flags = contactFlags(pro);
  if (viewerCanSee) return { ...pro, ...flags };
  return { ...pro, ...flags, whatsapp: "", callPhone: undefined, contactEmail: undefined };
}

/**
 * Un LISTADO nunca lleva los datos de contacto, ni siquiera con sesión abierta.
 *
 * Con sesión, `redactContact` los dejaba pasar, y `/api/buscar/results` entrega
 * los resultados de página en página: una sola cuenta gratis podía recorrer el
 * catálogo y llevarse el teléfono y el correo de todos los profesionales. Los
 * botones no los necesitan —el de llamar y el de correo piden el dato a
 * `/api/contact/reveal`, y el de WhatsApp a `/api/contact/whatsapp-link`, que
 * sí llevan la cuenta de cuántas veces se piden—, así que en una lista basta
 * con saber QUÉ vías de contacto tiene cada quien.
 */
export function redactContactEnListado<T extends ContactFields>(pro: T): T & ContactFlags {
  return { ...pro, ...contactFlags(pro), whatsapp: "", callPhone: undefined, contactEmail: undefined };
}

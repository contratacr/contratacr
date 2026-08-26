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

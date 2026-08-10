const BUSINESS_NAME_HINTS = new Set([
  "barberia",
  "peluqueria",
  "salon",
  "spa",
  "taller",
  "constructora",
  "construccion",
  "ferreteria",
  "clinica",
  "consultorio",
  "estudio",
  "servicio",
  "servicios",
  "soluciones",
  "empresa",
  "grupo",
  "agencia",
  "tienda",
  "academia",
]);

export function normalizeDisplayName(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeBusinessName(name?: string) {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.some((word) => BUSINESS_NAME_HINTS.has(word))) return true;
  if (words.includes("y") && words.length >= 3) return true;
  return /[&+]/.test(name ?? "");
}

export function samePublicIdentity(personName?: string, businessName?: string) {
  const person = normalizeDisplayName(personName);
  const business = normalizeDisplayName(businessName);
  if (!person || !business) return false;
  return person === business || person.includes(business) || business.includes(person);
}

export function formatPersonDisplayName(name?: string, mode: "desktop" | "mobile" = "desktop") {
  if (looksLikeBusinessName(name)) return (name ?? "").trim();
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  if (mode === "mobile") return [parts[0], parts[parts.length - 2]].join(" ");
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(" ");
}

export function getProfessionalDisplayName(fullName: string, businessName?: string) {
  const cleanBusinessName = businessName?.trim() || "";
  const personMobile = formatPersonDisplayName(fullName, "mobile");
  const personDesktop = formatPersonDisplayName(fullName, "desktop");
  const showPersonSubtitle = false;

  return {
    primaryMobile: cleanBusinessName || personMobile,
    primaryDesktop: cleanBusinessName || personDesktop,
    personMobile,
    personDesktop,
    secondaryMobile: showPersonSubtitle ? personMobile : "",
    secondaryDesktop: showPersonSubtitle ? personDesktop : "",
    hasSecondary: showPersonSubtitle,
  };
}

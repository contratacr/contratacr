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

function normalizeDisplayName(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeBusinessName(name?: string) {
  const normalized = normalizeDisplayName(name);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.some((word) => BUSINESS_NAME_HINTS.has(word))) return true;
  if (words.includes("y") && words.length >= 3) return true;
  return /[&+]/.test(name ?? "");
}

const LOWERCASE_NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "van", "von", "da", "dos", "di"]);

/** Presentation only: official all-uppercase names stay unchanged in storage.
 * Keep deliberate mixed casing and explicit business names as written.
 */
function personNameCase(name: string) {
  if (!/\p{L}/u.test(name) || name !== name.toLocaleUpperCase("es")) return name;
  return name.toLocaleLowerCase("es").replace(/\p{L}[\p{L}\p{M}]*/gu, (word, offset: number) =>
    offset > 0 && LOWERCASE_NAME_PARTICLES.has(word) ? word : word[0].toLocaleUpperCase("es") + word.slice(1),
  );
}

// Preserve ambiguous structures (particles, compound given names and longer names).
// Identity/verification always retains the original full_name.
export function formatPersonDisplayName(name?: string, _mode: "desktop" | "mobile" = "desktop") {
  void _mode; // Kept for existing callers; naming is identical on every viewport.
  const clean = (name ?? "").trim().replace(/\s+/gu, " ");
  if (looksLikeBusinessName(clean)) return clean;
  const parts = clean.split(" ");
  const normalized = normalizeDisplayName(clean).split(" ");
  const particles = new Set(["de", "del", "la", "las", "los", "van", "von", "da", "dos", "di"]);
  const compoundGivenNames = new Set(["maria jose", "jose maria", "juan pablo", "juan carlos", "luis miguel", "ana maria"]);
  if (parts.length !== 4 || normalized.some(part => particles.has(part)) || compoundGivenNames.has(normalized.slice(0, 2).join(" "))
    || parts.some(part => !/^[\p{L}'’.-]+$/u.test(part))) return personNameCase(clean);
  return personNameCase([parts[0], parts[2], parts[3]].join(" "));
}

export function getProfessionalDisplayName(fullName: string, businessName?: string) {
  const cleanBusinessName = businessName?.trim() || "";
  const personMobile = formatPersonDisplayName(fullName, "mobile");
  const personDesktop = formatPersonDisplayName(fullName, "desktop");

  return {
    primaryMobile: cleanBusinessName || personMobile,
    primaryDesktop: cleanBusinessName || personDesktop,
    personMobile,
    personDesktop,
  };
}

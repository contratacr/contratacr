// Costa Rican identification helpers (cedula nacional / cedula juridica / DIMEX / NITE).
//
// Storage decision: the DB always holds the CLEAN value: digits only, no hyphens
// or spaces (e.g. "101230456") because TSE/Hacienda/SINPE expect the seamless
// form. Hyphens are display-only.
//
// We do NOT compute a local check digit. Real validation for personal national
// IDs is a live lookup against the TSE/Registro Civil padron. Legal entity IDs
// are accepted as valid format but must be reviewed separately because they do
// not represent a physical person in the TSE padron.

export type IdType = "cedula" | "juridica" | "dimex" | "nite";

/** Strip everything but digits and cap at the longest supported length (12). */
export function cleanId(value: string): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 12);
}

/**
 * Detect the document type from the clean digits.
 *  - Cedula nacional: 9 digits, first digit 1-9.
 *  - Cedula juridica: 10 digits starting with 3 (e.g. 3-101-XXXXXX).
 *  - NITE: 10 digits that are not detected as cedula juridica.
 *  - DIMEX: 11 or 12 digits.
 * Returns null while the value is still too short / ambiguous.
 */
export function detectIdType(value: string): IdType | null {
  const d = cleanId(value);
  if (d.length === 9 && /^[1-9]/.test(d)) return "cedula";
  if (d.length === 10 && d.startsWith("3")) return "juridica";
  if (d.length === 10) return "nite";
  if (d.length === 11 || d.length === 12) return "dimex";
  return null;
}

export function isJuridicalId(value: string): boolean {
  return detectIdType(value) === "juridica";
}

export function idTypeLabel(type: IdType): string {
  if (type === "cedula") return "Cédula nacional";
  if (type === "juridica") return "Cédula jurídica";
  return type === "dimex" ? "DIMEX" : "NITE";
}

/**
 * Live input mask. Up to 9 digits we format as a national ID `X-XXXX-XXXX`,
 * inserting hyphens progressively as the user types. From 10 digits on
 * (cedula juridica / NITE / DIMEX) we show the digits seamlessly, which is how
 * those IDs are normally written for storage/search.
 */
export function formatId(value: string): string {
  const d = cleanId(value);
  if (d.length <= 9) {
    const province = d.slice(0, 1);
    const tomo = d.slice(1, 5);
    const asiento = d.slice(5, 9);
    let out = province;
    if (d.length > 1) out += `-${tomo}`;
    if (d.length > 5) out += `-${asiento}`;
    return out;
  }
  return d;
}

/**
 * Privacy mask for display: hides all but the last 4 digits. National IDs keep
 * the `X-XXXX-XXXX` shape (e.g. `X-XXXX-0456`); legal entity/NITE/DIMEX show
 * seamlessly (e.g. `XXXXXX1234`).
 */
export function maskId(value: string): string {
  const d = cleanId(value);
  if (!d) return "";
  const visible = 4;
  const masked = d
    .split("")
    .map((ch, i) => (i >= d.length - visible ? ch : "X"))
    .join("");
  if (d.length <= 9) {
    const province = masked.slice(0, 1);
    const tomo = masked.slice(1, 5);
    const asiento = masked.slice(5, 9);
    let out = province;
    if (d.length > 1) out += `-${tomo}`;
    if (d.length > 5) out += `-${asiento}`;
    return out;
  }
  return masked;
}

export function normalizeId(value: string): string {
  return cleanId(value);
}

/** Format/length validation only. */
export function isValidId(value: string): boolean {
  return detectIdType(value) !== null;
}



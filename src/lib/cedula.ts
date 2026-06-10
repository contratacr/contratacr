// Costa Rican identification helpers (cédula nacional / DIMEX / NITE).
//
// Storage decision: the DB always holds the CLEAN value — digits only, no
// hyphens or spaces (e.g. "101230456") — because TSE/Hacienda/SINPE all expect
// the seamless form. Hyphens are display-only.
//
// We do NOT compute a local check digit: the CR cédula has no published control
// digit. Real validation is a live lookup against the TSE/Registro Civil padrón.
// Locally we only validate length + allowed first digit per document type.

export type IdType = "cedula" | "dimex" | "nite";

/** Strip everything but digits and cap at the longest supported length (12). */
export function cleanId(value: string): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 12);
}

/**
 * Detect the document type from the clean digits.
 *  - Cédula nacional: 9 digits, first digit 1–9 (province / registry).
 *  - NITE: 10 digits.
 *  - DIMEX: 11 or 12 digits.
 * Returns null while the value is still too short / ambiguous.
 */
export function detectIdType(value: string): IdType | null {
  const d = cleanId(value);
  if (d.length === 9 && /^[1-9]/.test(d)) return "cedula";
  if (d.length === 10) return "nite";
  if (d.length === 11 || d.length === 12) return "dimex";
  return null;
}

export function idTypeLabel(type: IdType): string {
  return type === "cedula" ? "Cédula nacional" : type === "dimex" ? "DIMEX" : "NITE";
}

/**
 * Live input mask. Up to 9 digits we format as a national cédula
 * `X-XXXX-XXXX` (province · tomo · asiento), inserting hyphens progressively as
 * the user types. From 10 digits on (NITE/DIMEX) we show the digits seamlessly,
 * which is how those IDs are normally written.
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
 * Privacy mask for display: hides all but the last 4 digits. National cédulas
 * keep the `X-XXXX-XXXX` shape (e.g. `X-XXXX-0456`); NITE/DIMEX show seamlessly
 * (e.g. `XXXXXX1234`). Use anywhere a saved cédula is shown back to the user.
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

/**
 * Normalised storage value. The mask already produces fixed-width segments, so
 * the clean digits ARE the normalised form (national = province + 4-digit tomo +
 * 4-digit asiento, all zero-padded by construction). This just returns the
 * clean digits for clarity at call sites.
 */
export function normalizeId(value: string): string {
  return cleanId(value);
}

/** Format/length validation only (no check digit — see file header). */
export function isValidId(value: string): boolean {
  return detectIdType(value) !== null;
}

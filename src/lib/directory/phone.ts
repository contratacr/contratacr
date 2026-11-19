// Data quality (2026-11-18): phones of IMPORTED places (OpenStreetMap) are free text — several numbers in one field,
// old 7-digit Costa Rican numbers, US-style «011 506 …» dialling, and numbers of other countries (+1, +505, +507…).
// Only a valid Costa Rican number is offered as «Llamar» (tel: link); anything else is shown as plain text under
// «Otros datos» and listed in the admin report (/admin/directorio, «Teléfonos por revisar»). Pure: shared by the place
// page, the result card and the admin report.
//
// Costa Rica (SUTEL numbering plan): 8 digits starting with 2 (fixed), 4 (fixed/VoIP), 5, 6, 7 or 8 (mobile), with or
// without +506 / 00506 / 011 506; toll-free and premium numbers 800 / 900 / 905 + 7 digits.

export type PhoneCheck =
  | { kind: 'cr'; display: string; tel: string }
  | { kind: 'other'; reason: 'foreign' | 'invalid'; display: string };

const CR_LOCAL = /^[245678]\d{7}$/;
const CR_SPECIAL = /^(800|900|905)\d{7}$/;

function crFromDigits(raw: string): string | null {
  // Strip international prefixes in front of the country code: +506, 00506, 011 506, +011 506, 01 506, 0 506.
  const d = raw.replace(/^\+?(?:00|011|01|0)?506(?=\d{8,10}$)/, '');
  if (CR_LOCAL.test(d) || CR_SPECIAL.test(d)) return d;
  return null;
}

function format(local: string): string {
  return CR_SPECIAL.test(local) ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : `${local.slice(0, 4)}-${local.slice(4)}`;
}

/** Classifies a stored phone. With several numbers in the field the first valid Costa Rican one is used. */
export function checkPlacePhone(phone: string | null | undefined): PhoneCheck | null {
  const text = (phone ?? '').trim();
  if (!text) return null;
  const candidates = text.split(/\s*(?:[/,;|]|\s-\s|\sy\s|\so\s|\sor\s)\s*/i).map(s => s.trim()).filter(Boolean);
  for (const c of candidates) {
    const digits = (c.startsWith('+') ? '+' : '') + c.replace(/\D/g, '');
    const local = crFromDigits(digits);
    if (local) return { kind: 'cr', display: `+506 ${format(local)}`, tel: CR_SPECIAL.test(local) ? local : `+506${local}` };
    // Two local numbers written back to back («2278-1512 2278-1012»).
    const bare = digits.replace(/^\+/, '');
    if (bare.length === 16 && CR_LOCAL.test(bare.slice(0, 8)) && CR_LOCAL.test(bare.slice(8))) {
      const first = bare.slice(0, 8);
      return { kind: 'cr', display: `+506 ${format(first)}`, tel: `+506${first}` };
    }
  }
  const first = candidates[0] ?? text;
  const digits = first.replace(/\D/g, '');
  // Explicit foreign country code (+1, +505, 001…), or a 10/11-digit North-American style number.
  const foreign = (/^\s*(?:\+|00)(?!506)/.test(first) || /^1\d{10}$/.test(digits) || /^[2-9]\d{9}$/.test(digits)) && !/^\+?(?:00|011|01)?506/.test(first.replace(/[^\d+]/g, ''));
  return { kind: 'other', reason: foreign ? 'foreign' : 'invalid', display: text };
}

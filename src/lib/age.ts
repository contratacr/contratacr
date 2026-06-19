// Age helpers. DOB is YYYY-MM-DD. Used to compute years/months/days and to gate
// minors. NOTE: the TSE padrón (electoral roll) does NOT carry a birth date, so
// DOB is only available where it is entered manually (e.g. a beneficiary without
// a cédula). The 18+ gate for a national cédula is derived from PADRÓN PRESENCE —
// the electoral roll only contains citizens 18 or older.

export type AgeParts = { years: number; months: number; days: number };

export function computeAge(dobISO: string, ref: Date = new Date()): AgeParts | null {
  if (!dobISO) return null;
  const [y, m, d] = dobISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dob = new Date(y, m - 1, d);
  if (isNaN(dob.getTime()) || dob > ref) return null;

  let years = ref.getFullYear() - dob.getFullYear();
  let months = ref.getMonth() - dob.getMonth();
  let days = ref.getDate() - dob.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
    days += prevMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

export function formatAge(parts: AgeParts | null): string {
  if (!parts) return "";
  const bits: string[] = [];
  if (parts.years) bits.push(`${parts.years} ${parts.years === 1 ? "año" : "años"}`);
  if (parts.months) bits.push(`${parts.months} ${parts.months === 1 ? "mes" : "meses"}`);
  if (parts.days && !parts.years) bits.push(`${parts.days} ${parts.days === 1 ? "día" : "días"}`);
  return bits.join(", ");
}

export function isMinorFromDob(dobISO: string): boolean {
  const a = computeAge(dobISO);
  return a !== null && a.years < 18;
}

/**
 * Age bracket relevant to a MEDICAL professional, derived from a known DOB:
 *  - "minor"      → under 18 (guardian/consent, pediatric care)
 *  - "olderAdult" → 65 or older ("adulto mayor", CR Ley 7935 — geriatric care)
 *  - null         → a typical adult (18–64), nothing to flag.
 * Shown ONLY to the professional (health bookings), never as client-facing clutter.
 */
export function ageCategoryFromDob(dobISO: string): "minor" | "olderAdult" | null {
  const a = computeAge(dobISO);
  if (a === null) return null;
  if (a.years < 18) return "minor";
  if (a.years >= 65) return "olderAdult";
  return null;
}

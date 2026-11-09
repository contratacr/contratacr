/** UI date fields retain the existing period contract; no profile migration required. */
export type CvDates = { startMonth: string; startYear: string; endMonth: string; endYear: string; current: boolean };
export const blankDates = (): CvDates => ({ startMonth: '', startYear: '', endMonth: '', endYear: '', current: false });
const monthNames = ['ene|jan', 'feb', 'mar', 'abr|apr', 'may', 'jun', 'jul', 'ago|aug', 'sep', 'oct', 'nov', 'dic|dec'];
function datePart(value: string): { year: string; month: string } | null {
  const s = value.trim().toLowerCase().replace(/\./g, '');
  if (!s) return { year: '', month: '' };
  const numeric = s.match(/^(?:(0?[1-9]|1[0-2])\/)?((?:19|20)\d{2})$/);
  if (numeric) return { month: numeric[1] ? String(Number(numeric[1])) : '', year: numeric[2] };
  const named = s.match(/^([a-zá]+)\s+((?:19|20)\d{2})$/);
  if (named) { const month = monthNames.findIndex(m => new RegExp(`^(?:${m})`).test(named[1])); if (month >= 0) return { month: String(month + 1), year: named[2] }; }
  return null;
}
export function parseCvDates(period: string): CvDates | null {
  if (!period.trim()) return blankDates();
  const parts = period.trim().split(/\s*(?:[–—]|\s-\s|\bto\b|\bhasta\b|\ba\b)\s*/i);
  if (parts.length > 2) return null;
  const start = datePart(parts[0]);
  const current = /^(present|current|actualidad|actual|presente)$/i.test(parts[1] || '');
  const end = current ? { month: '', year: '' } : datePart(parts[1] || '');
  if (!start || !end) return null;
  return { startMonth: start.month, startYear: start.year, endMonth: end.month, endYear: end.year, current };
}
export function serializeCvDates(value: CvDates): string {
  const part = (year: string, month: string) => year ? `${month ? month.padStart(2, '0') + '/' : ''}${year}` : '';
  return [part(value.startYear, value.startMonth), value.current ? 'Present' : part(value.endYear, value.endMonth)].join(' – ').replace(/\s*–\s*$/, '').trim();
}
export function invalidCvDates(period: string, requireMonths = true): boolean {
  const d = parseCvDates(period);
  if (!d) return false; // Preserve unrecognized legacy dates for manual review.
  if ((d.current || d.endYear) && !d.startYear) return true;
  if (requireMonths && period.trim() && (!d.startYear || !d.startMonth || (!d.current && (!d.endYear || !d.endMonth)))) return true;
  if (!d.startYear || !d.endYear || d.current) return false;
  return Number(d.endYear) < Number(d.startYear) || (d.endYear === d.startYear && !!d.startMonth && !!d.endMonth && Number(d.endMonth) < Number(d.startMonth));
}
export function formatCvDates(period: string, english: boolean, duration = false, now = new Date()): string {
  const d = parseCvDates(period);
  if (!d || invalidCvDates(period, false)) return period;
  const months = english ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] : ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const part = (year: string, month: string) => [month ? months[Number(month) - 1] : '', year].filter(Boolean).join(' ');
  const range = [part(d.startYear, d.startMonth), d.current ? (english ? 'Present' : 'Actualidad') : part(d.endYear, d.endMonth)].filter(Boolean).join(' – ');
  if (!duration || !d.startYear || !d.startMonth || (!d.current && (!d.endYear || !d.endMonth))) return range;
  const endYear = d.current ? now.getFullYear() : Number(d.endYear), endMonth = d.current ? now.getMonth() + 1 : Number(d.endMonth);
  const count = (endYear - Number(d.startYear)) * 12 + endMonth - Number(d.startMonth) + 1;
  if (count <= 0 || endYear * 12 + endMonth > now.getFullYear() * 12 + now.getMonth() + 1) return range;
  const years = Math.floor(count / 12), rest = count % 12;
  const length = [years ? `${years} ${english ? (years === 1 ? 'year' : 'years') : (years === 1 ? 'año' : 'años')}` : '', rest ? `${rest} ${english ? (rest === 1 ? 'month' : 'months') : (rest === 1 ? 'mes' : 'meses')}` : ''].filter(Boolean).join(' ');
  return `${range} · ${length}`;
}

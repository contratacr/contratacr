/** Only confirmed public profile fields. Never store the source CV or contact data. */
export type CvEntry = { title: string; organization: string; period: string; description: string };
export type CvProfile = { education: CvEntry[]; experience: CvEntry[]; skills: string[] };
export const emptyCv = (): CvProfile => ({ education: [], experience: [], skills: [] });
export const CV_LIMITS = { entries: 20, skills: 40, title: 160, organization: 160, period: 80, description: 1000 };
export const keyOf = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const text = (v: unknown, n: number) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : '';
export function normalizeCv(value: unknown): CvProfile {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const entries = (value: unknown): CvEntry[] => Array.isArray(value) ? value.slice(0, CV_LIMITS.entries).filter(v => v && typeof v === 'object').map(v => ({
    title: text(v.title, CV_LIMITS.title), organization: text(v.organization, CV_LIMITS.organization), period: text(v.period, CV_LIMITS.period), description: text(v.description, CV_LIMITS.description),
  })).filter(v => v.title) : [];
  return { education: entries(raw.education), experience: entries(raw.experience), skills: Array.isArray(raw.skills) ? [...new Map(raw.skills.map(v => text(v, 80)).filter(Boolean).map(v => [keyOf(v), v])).values()].slice(0, CV_LIMITS.skills) : [] };
}
/**
 * The same study or job, even if the dates or capitalisation differ: same title
 * and same institution/employer (or one of them left blank). Re-importing a CV,
 * or a legacy certification saved as "2021" next to the CV's "2017 – 2021",
 * must not appear twice.
 */
export function sameCvEntry(a: Pick<CvEntry, 'title' | 'organization'>, b: Pick<CvEntry, 'title' | 'organization'>): boolean {
  if (keyOf(a.title) !== keyOf(b.title)) return false;
  const ao = keyOf(a.organization), bo = keyOf(b.organization);
  return !ao || !bo || ao === bo;
}
/** Existing entries win: an import never overwrites what the professional already corrected. */
export function mergeCv(existing: CvProfile, added: CvProfile): CvProfile {
  const merge = (a: CvEntry[], b: CvEntry[]) => [...a, ...b.filter((entry, index) => !a.some(old => sameCvEntry(old, entry)) && !b.slice(0, index).some(prev => sameCvEntry(prev, entry)))];
  return normalizeCv({ education: merge(existing.education, added.education), experience: merge(existing.experience, added.experience), skills: [...added.skills, ...existing.skills] });
}
export const hasCv = (cv: CvProfile) => cv.education.length + cv.experience.length + cv.skills.length > 0;

const month = '(?:ene(?:ro)?|feb(?:rero|ruary)?|mar(?:zo|ch)?|abr(?:il)?|apr(?:il)?|may(?:o)?|jun(?:io|e)?|jul(?:io|y)?|ago(?:sto)?|aug(?:ust)?|sep(?:tiembre|tember)?|oct(?:ubre|ober)?|nov(?:iembre|ember)?|dic(?:iembre)?|dec(?:ember)?|jan(?:uary)?)';
const date = `(?:(?:0?[1-9]|1[0-2])[/.-]|${month}\\.?\\s+)?(?:19|20)\\d{2}`;
const periodPattern = new RegExp(`(?:^|\\s)(${date}(?:\\s*(?:[-–—]|to|hasta|a)\\s*(?:${date}|present|current|actualidad|actual|presente))?)$`, 'i');
const cleanLine = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,;:])/g, '$1').trim();
const role = /\b(engineer|developer|analyst|manager|director|assistant|specialist|technician|consultant|designer|ingenier[oa]|desarrollador|analista|gerente|asistente|especialista|tecnic[oa]|consultor|disenador|coordinador|supervisor|contador|auxiliar|chofer)\b/i;
export type CvImportReview = { profile: CvProfile; warnings: string[] };
/** Preserve entry boundaries and flag unsupported/oversized content instead of silently cutting it. */
export function reviewCv(source: string): CvImportReview {
  const cv = emptyCv(), warnings = new Set<string>();
  let section: keyof CvProfile | null = null;
  let block: string[] = [], period = '';
  function flush() {
    if ((section === 'education' || section === 'experience') && block.length) {
      const lines = [...block]; let title = lines.shift()!.replace(/,$/, ''), organization = '';
      const split = title.split(/,\s*/);
      if (split.length === 2) {
        if (section === 'education') [title, organization] = split;
        else if (role.test(keyOf(split[1])) && !role.test(keyOf(split[0]))) [organization, title] = split;
        else if (role.test(keyOf(split[0]))) [title, organization] = split;
        else warnings.add('ambiguous');
      }
      if (!organization && lines.length && !/^[•●▪]/.test(lines[0]) && !lines[0].includes(':')) organization = lines.shift()!;
      const description = lines.reduce<string[]>((out, line) => {
        if (/^[•●▪]/.test(line) || !out.length) out.push(line);
        else out[out.length - 1] += ' ' + line;
        return out;
      }, []).join('\n');
      const entry = { title, organization, period, description };
      if (Object.entries(entry).some(([k,v]) => v.length > CV_LIMITS[k as keyof CvEntry]) || cv[section].length >= CV_LIMITS.entries) warnings.add('limit');
      else cv[section].push(entry);
    }
    block = []; period = '';
  }
  const sourceLines = source.slice(0, 80000).split(/\r?\n/);
  for (const [index, raw] of sourceLines.entries()) {
    const line = cleanLine(raw), heading = keyOf(line).replace(/:$/, '');
    const next = /^(formacion(?: academica)?|educacion|estudios(?: academicos)?|education|academic background|certificaciones|cursos y certificaciones)$/.test(heading) ? 'education'
      : /^(experiencia(?: laboral| profesional)?|work experience|employment history|professional experience)$/.test(heading) ? 'experience'
      : /^(habilidades(?: tecnicas)?|competencias|skills|technical skills|aptitudes)$/.test(heading) ? 'skills' : null;
    if (next) { flush(); section = next; continue; }
    if (/^(referencias.*|references.*|contacto|contact|datos personales|personal.*|perfil.*|profile|summary|resumen|idiomas|languages|intereses|interests)$/.test(heading)) { flush(); section = null; continue; }
    if (/@|https?:|www\.|\b(?:cedula|telefono|phone|email|direccion|address)\b/i.test(keyOf(line))) { flush(); continue; }
    if (!line) { flush(); continue; }
    if (section === 'skills') {
      const content = line.replace(/^[•●▪-]\s*/, '').replace(/^[^:]{1,60}:\s*/, '');
      for (const skill of content.split(/[,;|•]/).map(s => s.trim().replace(/[.;]+$/, '')).filter(Boolean)) {
        if (skill.length > 80) warnings.add('limit'); else cv.skills.push(skill);
      }
    } else if (section) {
      const match = !/^[•●▪]/.test(line) && line.match(periodPattern);
      if (match) {
        const header = line.slice(0, match.index).trim().replace(/[|,–—-]+$/, '').trim();
        if (header && block.length && period) flush();
        else if (!header && period) { warnings.add('ambiguous'); flush(); }
        if (header) block.push(header);
        period = match[1];
      } else {
        const upcoming = sourceLines.slice(index + 1, index + 3).map(cleanLine);
        if (period && block.length && line.length < 160 && !/^[•●▪]|:/.test(line) && upcoming.some(value => { const date = value.match(periodPattern); return date && !value.slice(0, date.index).trim(); })) flush();
        block.push(line.replace(/^[-]\s+/, ''));
      }
    }
  }
  flush();
  if (new Set(cv.skills.map(keyOf)).size > CV_LIMITS.skills || source.length > 80000) warnings.add('limit');
  return { profile: normalizeCv(cv), warnings: [...warnings] };
}
export const suggestCv = (source: string): CvProfile => reviewCv(source).profile;

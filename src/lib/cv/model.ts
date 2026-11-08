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
export function mergeCv(existing: CvProfile, added: CvProfile): CvProfile {
  const merge = (a: CvEntry[], b: CvEntry[]) => [...new Map([...b, ...a].map(v => [keyOf(`${v.title}|${v.organization}|${v.period}`), v])).values()];
  return normalizeCv({ education: merge(existing.education, added.education), experience: merge(existing.experience, added.experience), skills: [...added.skills, ...existing.skills] });
}
export const hasCv = (cv: CvProfile) => cv.education.length + cv.experience.length + cv.skills.length > 0;

/** Conservative, heading-based suggestions: no AI, inferred credentials or years of experience. */
export function suggestCv(source: string): CvProfile {
  const cv = emptyCv();
  let section: keyof CvProfile | null = null;
  let block: string[] = [];
  function flush() {
    if (section === 'education' || section === 'experience') {
      const lines = block.filter(Boolean);
      if (lines.length) {
        const periodIndex = lines.findIndex(l => /^(?:(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}(?:\s*[-–—/]\s*(?:(?:19|20)\d{2}|actualidad|actual|presente|present|current))?$/i.test(l));
        const period = periodIndex >= 0 ? lines.splice(periodIndex, 1)[0] : '';
        if (lines.length) cv[section].push({ title: lines[0], organization: lines[1] || '', period, description: lines.slice(2).join('\n') });
      }
    }
    block = [];
  }
  for (const raw of source.slice(0, 80000).split(/\r?\n/)) {
    const line = raw.trim().replace(/^[•●▪\-]\s*/, '');
    const heading = keyOf(line).replace(/:$/, '');
    const next = /^(formacion(?: academica)?|educacion|estudios(?: academicos)?|education|academic background|certificaciones|cursos y certificaciones)$/.test(heading) ? 'education'
      : /^(experiencia(?: laboral| profesional)?|work experience|employment history|professional experience)$/.test(heading) ? 'experience'
      : /^(habilidades(?: tecnicas)?|competencias|skills|technical skills|aptitudes)$/.test(heading) ? 'skills' : null;
    if (next) { flush(); section = next; continue; }
    if (/^(referencias.*|references.*|contacto|contact|datos personales|personal.*|perfil.*|profile|idiomas|languages|intereses|interests)$/.test(heading)) { flush(); section = null; continue; }
    // Never suggest contact lines as public academic/employment fields.
    if (/@|https?:|www\.|\b(?:cedula|telefono|phone|email|direccion|address)\b/i.test(keyOf(line))) { flush(); continue; }
    if (!line) { flush(); continue; }
    if (section === 'skills') cv.skills.push(...line.split(/[,;|•]/).map(v => v.trim()).filter(Boolean));
    else if (section) block.push(line);
  }
  flush();
  return normalizeCv(cv);
}

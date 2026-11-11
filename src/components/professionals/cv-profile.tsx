'use client';
import { useState, type ReactNode } from 'react';
import { BriefcaseBusiness, GraduationCap, ExternalLink } from 'lucide-react';
import { normalizeCv, sameCvEntry, type CvEntry, type CvProfile } from '@/lib/cv/model';
import { formatCvDates, parseCvDates } from '@/lib/cv/dates';
function Description({ text, english }: { text: string; english: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 180 || text.split('\n').length > 3;
  return <div className="mt-2"><p className={`whitespace-pre-line break-words text-sm leading-6 text-[#52627a] ${long && !expanded ? 'line-clamp-3' : ''}`}>{text}</p>{long && <button type="button" className="min-h-11 text-sm font-semibold text-[#0089bb]" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? (english ? 'Show less' : 'Ver menos') : (english ? 'Show more' : 'Ver más')}</button>}</div>;
}
/**
 * EXPERIENCIA Y FORMACIÓN (pestaña del perfil público). Tres bloques con el
 * mismo dibujo: experiencia, estudios y certificaciones, habilidades.
 * Las certificaciones del sistema anterior (`legacyEducation`) entran en
 * Estudios con la misma fila que los estudios del CV —antes eran tarjetas con
 * otra forma y parecían otra sección— y si ya están en el CV salen una vez.
 * «Ver CV» va en el encabezado, al lado del título.
 */
export function CvProfileDetails({ value, english = false, professionalId, hasFile = false, legacyEducation = [], title }: { value?: CvProfile; english?: boolean; professionalId?: string; hasFile?: boolean; legacyEducation?: CvEntry[]; title?: ReactNode }) {
  const cv = normalizeCv(value);
  const education = [...cv.education, ...legacyEducation.filter(old => old.title.trim() && !cv.education.some(entry => sameCvEntry(entry, old)))];
  const sections = { experience: cv.experience, education } as const;
  const fileLink = hasFile && professionalId ? <a href={`/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#dce5ee] px-4 text-sm font-semibold text-[#0089bb] hover:border-[#009FD9]"><ExternalLink size={16}/>{english ? 'View CV' : 'Ver CV'}</a> : null;
  return <div className="space-y-7" data-cv-public>
    {(title || fileLink) && <div className="flex items-center justify-between gap-3">{title ?? <span/>}{fileLink}</div>}
    {(['experience', 'education'] as const).map(section => sections[section].length > 0 && <section key={section} data-cv-section={section}>
      <h3 className="text-base font-semibold text-[#162543]">{section === 'education' ? (english ? 'Education and certifications' : 'Estudios y certificaciones') : (english ? 'Work experience' : 'Experiencia laboral')}</h3>
      <div className="divide-y divide-[#eef2f6]">{sections[section].map((entry, index) => <div key={`${index}-${entry.title}`} className="flex gap-3 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f8fb] text-[#009FD9]">{section === 'experience' ? <BriefcaseBusiness size={20}/> : <GraduationCap size={20}/>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2"><h4 className="min-w-0 break-words text-sm font-semibold text-[#162543]">{entry.title}</h4>{parseCvDates(entry.period)?.current && <span className="rounded-md bg-[#e8f8fc] px-2 py-0.5 text-xs font-medium text-[#007da8]">{english ? 'Current' : 'Actual'}</span>}</div>
          {entry.organization && <p className="mt-0.5 break-words text-sm text-[#52627a]">{entry.organization}</p>}
          {entry.period && <p className="mt-0.5 break-words text-xs leading-5 text-[#68778d]">{formatCvDates(entry.period, english, section === 'experience')}</p>}
          {entry.description && <Description text={entry.description} english={english}/>}
        </div>
      </div>)}</div>
    </section>)}
    {cv.skills.length > 0 && <section data-cv-section="skills"><h3 className="mb-3 text-base font-semibold text-[#162543]">{english ? 'Skills' : 'Habilidades'}</h3><ul className="flex flex-wrap gap-2">{cv.skills.map(skill => <li key={skill} className="max-w-full break-words rounded-xl bg-[#f1f8fb] px-3 py-2 text-sm text-[#162543]">{skill}</li>)}</ul></section>}
  </div>;
}

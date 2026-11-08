import { normalizeCv, type CvProfile } from '@/lib/cv/model';
export function CvProfileDetails({ value, english = false, professionalId, hasFile = false }: { value?: CvProfile; english?: boolean; professionalId?: string; hasFile?: boolean }) {
  const cv = normalizeCv(value);
  return <div className="space-y-6" data-cv-public>
    {hasFile && professionalId && <a href={`/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[#dce5ee] px-5 text-sm font-semibold text-[#0089bb]">{english ? 'View CV' : 'Ver CV'}</a>}
    {(['education', 'experience'] as const).map(section => cv[section].length > 0 && <section key={section} className="space-y-3">
      <h3 className="text-base font-semibold text-[#162543]">{section === 'education' ? (english ? 'Education' : 'Formación académica') : (english ? 'Work experience' : 'Experiencia laboral')}</h3>
      {cv[section].map((entry, index) => <div key={index} className="rounded-xl border border-[#e5e7eb] p-3.5">
        <p className="break-words text-sm font-semibold text-[#162543]">{entry.title}</p>
        <p className="mt-1 break-words text-xs text-[#52627a]">{[entry.organization, entry.period].filter(Boolean).join(' · ')}</p>
        {entry.description && <p className="mt-2 whitespace-pre-line break-words text-sm text-[#52627a]">{entry.description}</p>}
      </div>)}
    </section>)}
    {cv.skills.length > 0 && <section><h3 className="mb-3 text-base font-semibold text-[#162543]">{english ? 'Skills' : 'Habilidades'}</h3><ul className="flex flex-wrap gap-2">{cv.skills.map(skill => <li key={skill} className="max-w-full break-words rounded-xl bg-[#f1f8fb] px-3 py-2 text-sm text-[#162543]">{skill}</li>)}</ul></section>}
  </div>;
}

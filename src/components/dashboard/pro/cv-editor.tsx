'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { blankDates, parseCvDates, serializeCvDates, invalidCvDates } from '@/lib/cv/dates';
import { CvFileEditor } from './cv-file-editor';
import { Button } from '@/components/ui/button';
import { X, Plus, FileText, ChevronDown } from 'lucide-react';
import { CV_LIMITS, emptyCv, hasCv, keyOf, mergeCv, normalizeCv, reviewCv, type CvEntry, type CvProfile } from '@/lib/cv/model';

const inputClass = 'min-h-11 w-full rounded-xl border border-[#dce5ee] bg-white px-3 py-2 text-sm text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]';
function DateFields({ period, onChange, english, education }: { period: string; onChange: (value: string) => void; english: boolean; education: boolean }) {
  const dates = parseCvDates(period);
  const months = english ? ['January','February','March','April','May','June','July','August','September','October','November','December'] : ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const years = Array.from({ length: new Date().getFullYear() + 11 - 1900 }, (_, i) => String(new Date().getFullYear() + 10 - i));
  if (!dates) return <div className="space-y-2"><label className="block text-sm text-[#52627a]">{english ? 'Previous dates' : 'Fechas anteriores'}<input className={inputClass} value={period} maxLength={80} onChange={e => onChange(e.target.value)}/></label><button type="button" className="min-h-11 text-sm font-semibold text-[#0089bb]" onClick={() => onChange(serializeCvDates(blankDates()))}>{english ? 'Choose start and end dates' : 'Elegir fecha de inicio y fin'}</button></div>;
  return <div className="space-y-3">
    <label className="flex min-h-11 items-center gap-3 text-sm text-[#162543]"><input type="checkbox" className="h-5 w-5 accent-[#009FD9]" checked={dates.current} onChange={e => onChange(serializeCvDates({ ...dates, current: e.target.checked, endMonth: '', endYear: '' }))}/>{education ? (english ? 'Currently studying here' : 'Actualmente estudio aquí') : (english ? 'I currently work here' : 'Actualmente trabajo aquí')}</label>
    {(['start', 'end'] as const).map(kind => (kind === 'start' || !dates.current) && <fieldset key={kind} className="min-w-0"><legend className="mb-1 text-sm text-[#52627a]">{kind === 'start' ? (english ? 'Start date' : 'Fecha de inicio') : (english ? 'End date' : 'Fecha de fin')}</legend><div className="grid grid-cols-2 gap-3">
      <label className="relative block text-xs text-[#68778d]">{english ? 'Year' : 'Año'}<select className={`${inputClass} mt-1 h-11 appearance-none pr-8`} aria-label={`${kind === 'start' ? (english ? 'Start' : 'Inicio') : (english ? 'End' : 'Fin')}: ${english ? 'year' : 'año'}`} value={dates[`${kind}Year`]} onChange={e => onChange(serializeCvDates({ ...dates, [`${kind}Year`]: e.target.value, ...(!e.target.value ? { [`${kind}Month`]: '' } : {}) }))}><option value="">{english ? 'Select' : 'Seleccionar'}</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select><ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute bottom-3.5 right-3"/></label>
      <label className="relative block text-xs text-[#68778d]">{english ? 'Month' : 'Mes'}<select className={`${inputClass} mt-1 h-11 appearance-none pr-8 disabled:opacity-50`} disabled={!dates[`${kind}Year`]} aria-label={`${kind === 'start' ? (english ? 'Start' : 'Inicio') : (english ? 'End' : 'Fin')}: ${english ? 'month' : 'mes'}`} value={dates[`${kind}Month`]} onChange={e => onChange(serializeCvDates({ ...dates, [`${kind}Month`]: e.target.value }))}><option value="">{english ? 'Select' : 'Seleccionar'}</option>{months.map((month, i) => <option key={month} value={String(i + 1)}>{month}</option>)}</select><ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute bottom-3.5 right-3"/></label>
    </div></fieldset>)}
    {invalidCvDates(period) && <p role="alert" className="text-sm text-red-600">{english ? 'Complete the start and end month and year, or select current. The end cannot be earlier than the start.' : 'Completá el mes y año de inicio y fin, o marcá que continúa actualmente. El fin no puede ser anterior al inicio.'}</p>}
  </div>;
}

function SkillsField({ value, onChange, english }: { value: string[]; onChange: (skills: string[]) => void; english: boolean }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function add() {
    const skill = draft.trim().replace(/\s+/g, ' ');
    if (!skill) return;
    if (value.some(v => keyOf(v) === keyOf(skill))) { setError(english ? 'This skill is already added.' : 'Ya agregaste esta habilidad.'); return; }
    if (value.length >= CV_LIMITS.skills) { setError(english ? 'You can add up to 40 skills.' : 'Podés agregar hasta 40 habilidades.'); return; }
    onChange([...value, skill]); setDraft(''); setError(''); input.current?.focus();
  }
  return <fieldset className="min-w-0 space-y-3"><legend className="mb-3 text-sm font-semibold text-[#162543]">{english ? 'Skills' : 'Habilidades'}</legend>
    <ul className="flex flex-wrap gap-2">{value.map((skill, index) => <li key={`${index}-${skill}`} className="flex max-w-full items-center rounded-xl bg-[#f1f8fb] pl-3 text-sm text-[#162543]"><span className="min-w-0 break-words">{skill}</span><button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-[#52627a]" aria-label={`${english ? 'Remove' : 'Quitar'} ${skill}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><X size={16}/></button></li>)}</ul>
    <div className="flex gap-2"><input ref={input} className={`${inputClass} min-w-0 flex-1`} aria-label={english ? 'New skill' : 'Nueva habilidad'} placeholder={english ? 'Add a skill' : 'Agregar una habilidad'} maxLength={80} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}/><Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={!draft.trim()} onClick={add}><Plus size={16}/>{english ? 'Add' : 'Agregar'}</Button></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </fieldset>;
}

function Fields({ value, onChange, english, educationExtra }: { value: CvProfile; onChange: (value: CvProfile) => void; english: boolean; educationExtra?: ReactNode }) {
  const labels = english ? { education: 'Education', experience: 'Work experience', skills: 'Skills', title: 'Qualification or course', role: 'Job title', institution: 'Institution (optional)', employer: 'Employer (optional)', period: 'Dates (optional)', description: 'Details (optional)', remove: 'Remove', add: 'Add', skillHelp: 'One skill per line. Up to 40.' } : { education: 'Formación académica', experience: 'Experiencia laboral', skills: 'Habilidades', title: 'Título o curso', role: 'Puesto', institution: 'Institución (opcional)', employer: 'Empresa (opcional)', period: 'Fechas (opcional)', description: 'Detalles (opcional)', remove: 'Quitar', add: 'Agregar', skillHelp: 'Una habilidad por línea. Hasta 40.' };
  function update(section: 'education' | 'experience', index: number, field: keyof CvEntry, text: string) {
    onChange({ ...value, [section]: value[section].map((entry, i) => i === index ? { ...entry, [field]: text } : entry) });
  }
  return <div className="space-y-6">
    {(['education', 'experience'] as const).map(section => <fieldset key={section} className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-semibold text-[#162543]">{labels[section]}</legend>
      {section === 'education' && educationExtra}
      {value[section].map((entry, index) => <div key={index} className="space-y-3 rounded-xl border border-[#dce5ee] bg-white p-4">
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-[#68778d]">{labels[section]} {index + 1}</span><button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#68778d]" aria-label={`${labels.remove} ${labels[section]} ${index + 1}`} onClick={() => onChange({ ...value, [section]: value[section].filter((_, i) => i !== index) })}><X size={18}/></button></div>
        {(['title', 'organization'] as const).map(field => <label key={field} className="block text-sm text-[#52627a]">{field === 'title' ? section === 'education' ? labels.title : labels.role : field === 'organization' ? section === 'education' ? labels.institution : labels.employer : labels[field]}
          <input className={`${inputClass} mt-1`} maxLength={CV_LIMITS[field]} value={entry[field]} onChange={e => update(section, index, field, e.target.value)}/>
        </label>)}
        <DateFields period={entry.period} english={english} education={section === 'education'} onChange={period => update(section, index, 'period', period)}/>
        <label className="block text-sm text-[#52627a]">{labels.description}<textarea className={`${inputClass} mt-1 min-h-24`} maxLength={CV_LIMITS.description} value={entry.description} onChange={e => update(section, index, 'description', e.target.value)}/></label>
      </div>)}
      <Button type="button" variant="outline" className="min-h-11" disabled={value[section].length >= CV_LIMITS.entries} onClick={() => onChange({ ...value, [section]: [...value[section], { title: '', organization: '', period: '', description: '' }] })}><Plus size={16}/>{labels.add} {section === 'education' ? (english ? 'education' : 'estudio') : (english ? 'experience' : 'experiencia')}</Button>
    </fieldset>)}
    <SkillsField value={value.skills} onChange={skills => onChange({ ...value, skills })} english={english}/>
  </div>;
}

export function CvEditor({ value, onChange, disabled = false, existingEducation = [], educationExtra, professionalId }: { value: CvProfile; onChange: (value: CvProfile) => void; disabled?: boolean; existingEducation?: CvEntry[]; educationExtra?: ReactNode; professionalId: string }) {
  const english = useLocale() === 'en';
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const reviewRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<CvProfile | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => () => { request.current++; }, []);
  const reviewing = candidate !== null;
  useEffect(() => { if (reviewing) reviewRef.current?.focus(); }, [reviewing]);
  async function selectFile(file?: File) {
    if (!file) return;
    setSelectedFile(file);
    const seq = ++request.current;
    setBusy(true); setError(''); setNotice(''); setWarnings([]); setCandidate(null);
    try {
      const { readCvFile, CvReadError } = await import('@/lib/cv/read-file');
      let content: string;
      try { content = await readCvFile(file); } catch (err) {
        const code = err instanceof CvReadError ? err.code : 'unreadable';
        const messages = english ? { format: 'Choose a PDF or DOCX file. Save older Word files as DOCX.', size: 'The file is empty or too large. Maximum 5 MB and 80,000 characters.', pages: 'Choose a CV with up to 15 pages.', timeout: 'Reading took too long. Try a simpler file or enter your information manually.', protected: 'Export an unprotected copy of your CV.', unreadable: 'We could not read this document. Use a PDF with selectable text or a DOCX, or complete the fields manually.' } : { format: 'Elegí un archivo PDF o DOCX. Guardá los Word antiguos como DOCX.', size: 'El archivo está vacío o es demasiado grande. Máximo 5 MB y 80.000 caracteres.', pages: 'Elegí un CV de hasta 15 páginas.', timeout: 'La lectura tardó demasiado. Probá un archivo más sencillo o completá los campos manualmente.', protected: 'Exportá una copia de tu CV sin contraseña.', unreadable: 'No pudimos leer este documento. Usá un PDF con texto seleccionable o DOCX, o completá los campos manualmente.' };
        throw new Error(messages[code]);
      }
      const result = reviewCv(content);
      const extracted = result.profile;
      if (seq !== request.current) return;
      if (!hasCv(extracted) && result.warnings.length) { setError(english ? 'The detected content exceeds the field limits. Complete it manually using your original CV.' : 'El contenido detectado supera los límites de los campos. Completalo manualmente usando tu CV original.'); return; }
      if (!hasCv(extracted)) { setError(english ? 'No education, experience or skills headings were recognized. You can complete the fields manually.' : 'No reconocimos secciones de formación, experiencia o habilidades. Podés completar los campos manualmente.'); return; }
      setWarnings(result.warnings); setCandidate(extracted);
    } catch (err) { if (seq === request.current) setError(err instanceof Error ? err.message : (english ? 'Could not read the file.' : 'No se pudo leer el archivo.')); }
    finally { if (seq === request.current) setBusy(false); }
  }
  function apply() {
    if (!candidate) return;
    if ([...candidate.education, ...candidate.experience].some(e => !e.title.trim() || invalidCvDates(e.period)) || candidate.skills.filter(s => s.trim()).length > 40 || candidate.skills.some(s => s.length > 80)) {
      setError(english ? 'Review the titles, dates and skills (up to 40, 80 characters each).' : 'Revisá los títulos, las fechas y las habilidades (hasta 40, de 80 caracteres cada una).'); return;
    }
    const legacyKeys = new Set(existingEducation.map(e => keyOf(`${e.title}|${e.organization}|${e.period}`)));
    const additions = { ...candidate, education: candidate.education.filter(e => !legacyKeys.has(keyOf(`${e.title}|${e.organization}|${e.period}`))) };
    const merged = mergeCv(value, additions);
    if (value.education.length + candidate.education.length > 20 || value.experience.length + candidate.experience.length > 20 || new Set([...value.skills, ...candidate.skills]).size > 40) {
      setError(english ? 'Remove entries before importing: up to 20 per section and 40 skills.' : 'Quitá entradas antes de importar: hasta 20 por sección y 40 habilidades.'); return;
    }
    onChange(merged); setCandidate(null); setError(''); setNotice(english ? 'Added to the form. Save your changes to publish them.' : 'Agregado al formulario. Guardá los cambios para publicarlos.');
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-5" data-cv-editor>
    <div className="rounded-2xl border border-[#c9e7f2] bg-[#f1faff] p-4">
      <div className="flex items-start gap-3"><FileText className="mt-0.5 shrink-0 text-[#009FD9]" size={22}/><div><h3 className="text-base font-semibold text-[#162543]">{english ? 'Your CV' : 'Tu CV'}</h3></div></div>
      <input ref={fileInput} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={english ? 'Choose CV' : 'Elegir CV'} onChange={e => { void selectFile(e.target.files?.[0]); e.target.value = ''; }}/>


      <CvFileEditor professionalId={professionalId} selectedFile={selectedFile} english={english} reading={busy} onChoose={() => fileInput.current?.click()} onCancel={() => { setSelectedFile(null); setCandidate(null); setError(''); }}/>

    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#0089bb]">{notice}</p>}
    {candidate && <div ref={reviewRef} tabIndex={-1} className="space-y-5 rounded-2xl border-2 border-[#009FD9] p-4" aria-label={english ? 'Review imported information' : 'Revisar información importada'}>
      <div><h3 className="font-semibold text-[#162543]">{english ? 'Review before adding' : 'Revisá antes de agregar'}</h3><p className="mt-1 text-sm text-[#52627a]">{english ? 'Correct or remove anything you do not want to publish. Existing information is kept.' : 'Corregí o quitá lo que no querés publicar. Conservamos tus datos actuales.'}</p></div>
      <p role="status" className="text-sm font-semibold text-[#0089bb]">{candidate.experience.length} {english ? 'work experiences' : 'experiencias'} · {candidate.education.length} {english ? 'education entries' : 'estudios'} · {candidate.skills.length} {english ? 'skills' : 'habilidades'}</p>
      {warnings.length > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{english ? 'Some content could not be separated reliably or exceeds the field limits. Compare with your CV and complete the missing information before saving.' : 'Parte del contenido no se pudo separar con seguridad o supera los límites. Compará con tu CV y completá lo que falta antes de guardar.'}</p>}
      <Fields value={candidate} onChange={setCandidate} english={english}/>
      <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" onClick={apply}>{english ? 'Add to my profile form' : 'Agregar al formulario'}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setCandidate(null); setError(''); }}>{english ? 'Discard import' : 'Descartar importación'}</Button></div>
    </div>}
    {!candidate && <Fields value={value} onChange={onChange} english={english} educationExtra={educationExtra}/>}
  </fieldset>;
}

export function cvValidationError(value: CvProfile): boolean {
  return new TextEncoder().encode(JSON.stringify(normalizeCv(value))).byteLength > 65000 || [...value.education, ...value.experience].some(e => !e.title.trim() || invalidCvDates(e.period)) || value.skills.filter(s => s.trim()).length > 40 || value.skills.some(s => s.length > 80);
}
export { emptyCv, normalizeCv };

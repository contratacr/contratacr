'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { blankDates, parseCvDates, serializeCvDates, invalidCvDates, formatCvDates } from '@/lib/cv/dates';
import { CvFileEditor } from './cv-file-editor';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { X, Plus, FileText, ChevronDown, Pencil, Check, BriefcaseBusiness, GraduationCap, ScanText, ArrowRight } from 'lucide-react';
import { CV_LIMITS, emptyCv, hasCv, keyOf, mergeCv, normalizeCv, reviewCv, sameCvEntry, type CvEntry, type CvProfile } from '@/lib/cv/model';

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

type LegacyEducation = { entry: CvEntry; onRemove: () => void };

/**
 * CADA ESTUDIO Y CADA EXPERIENCIA ES UNA TARJETA CERRADA (título, lugar y
 * fechas) con lápiz y X, como los locales. Antes cada una quedaba abierta como
 * formulario completo —puesto, empresa, casilla, cuatro menús de fecha y
 * detalles— y con cuatro experiencias la sección no terminaba. Se abre al
 * tocar el lápiz, al agregar una nueva o si le falta algo para guardarse.
 * Las certificaciones del sistema anterior van en Estudios con la misma
 * tarjeta (solo se pueden quitar), no como un bloque aparte con otro dibujo.
 */
function Fields({ value, onChange, english, legacyEducation = [], existing }: { value: CvProfile; onChange: (value: CvProfile) => void; english: boolean; legacyEducation?: LegacyEducation[]; existing?: CvProfile }) {
  const labels = english ? { education: 'Education and certifications', entry: { education: 'Education', experience: 'Work experience' }, experience: 'Work experience', skills: 'Skills', title: 'Qualification or course', role: 'Job title', institution: 'Institution (optional)', employer: 'Employer (optional)', period: 'Dates (optional)', description: 'Details (optional)', remove: 'Remove', edit: 'Edit', done: 'Done', add: 'Add', untitled: 'Untitled', already: 'Already on your profile' } : { education: 'Estudios y certificaciones', entry: { education: 'Formación académica', experience: 'Experiencia laboral' }, experience: 'Experiencia laboral', skills: 'Habilidades', title: 'Título o curso', role: 'Puesto', institution: 'Institución (opcional)', employer: 'Empresa (opcional)', period: 'Fechas (opcional)', description: 'Detalles (opcional)', remove: 'Quitar', edit: 'Editar', done: 'Listo', add: 'Agregar', untitled: 'Sin título', already: 'Ya está en tu perfil' };
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string, next: boolean) => setOpen(prev => { const copy = new Set(prev); if (next) copy.add(id); else copy.delete(id); return copy; });
  function update(section: 'education' | 'experience', index: number, field: keyof CvEntry, text: string) {
    onChange({ ...value, [section]: value[section].map((entry, i) => i === index ? { ...entry, [field]: text } : entry) });
  }
  function remove(section: 'education' | 'experience', index: number) {
    onChange({ ...value, [section]: value[section].filter((_, i) => i !== index) });
    // Las posiciones se corren: se cierran las de esa sección para no abrir otra.
    setOpen(prev => new Set([...prev].filter(id => !id.startsWith(`${section}:`))));
  }
  const summary = (section: 'education' | 'experience', entry: CvEntry) => <div className="min-w-0 flex-1 pt-0.5">
    <p className="break-words text-sm font-semibold leading-5 text-[#162543]">{entry.title.trim() || <span className="text-[#68778d]">{labels.untitled}</span>}</p>
    {entry.organization && <p className="break-words text-[13px] leading-5 text-[#52627a]">{entry.organization}</p>}
    {entry.period && <p className="break-words text-xs leading-5 text-[#68778d]">{formatCvDates(entry.period, english, section === 'experience')}</p>}
  </div>;
  const tile = (section: 'education' | 'experience') => <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1f8fb] text-[#009FD9]">{section === 'experience' ? <BriefcaseBusiness size={18}/> : <GraduationCap size={18}/>}</span>;
  return <div className="space-y-6">
    {(['experience', 'education'] as const).map(section => <fieldset key={section} className="min-w-0 space-y-2.5" data-cv-editor-section={section}>
      <legend className="mb-3 text-sm font-semibold text-[#162543]">{labels[section]}</legend>
      {value[section].map((entry, index) => {
        const id = `${section}:${index}`;
        const needsWork = !entry.title.trim() || invalidCvDates(entry.period);
        const duplicate = !!existing && existing[section].some(old => sameCvEntry(old, entry));
        const name = `${labels.entry[section]} ${index + 1}`;
        const removeButton = <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#a12828] hover:bg-red-50" aria-label={`${labels.remove} ${name}`} title={labels.remove} onClick={() => remove(section, index)}><X size={18}/></button>;
        if (!open.has(id) && !needsWork) return <div key={index} className="flex items-start gap-3 rounded-xl border border-[#dce5ee] bg-white py-2 pl-3 pr-1" data-cv-entry={section}>
          {tile(section)}
          <div className="min-w-0 flex-1">{summary(section, entry)}{duplicate && <span className="mt-1 inline-block rounded-md bg-[#f1f5f9] px-2 py-0.5 text-xs font-medium text-[#52627a]">{labels.already}</span>}</div>
          <div className="flex shrink-0 items-center"><button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-[#0089bb] hover:bg-[#f1f8fb]" aria-label={`${labels.edit} ${name}`} title={labels.edit} onClick={() => toggle(id, true)}><Pencil size={16}/></button>{removeButton}</div>
        </div>;
        return <div key={index} className="space-y-3 rounded-xl border border-[#009FD9] bg-white p-4" data-cv-entry={section} data-open>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#68778d]">{name}</span>{removeButton}</div>
          {(['title', 'organization'] as const).map(field => <label key={field} className="block text-sm text-[#52627a]">{field === 'title' ? section === 'education' ? labels.title : labels.role : section === 'education' ? labels.institution : labels.employer}
            <input className={`${inputClass} mt-1`} maxLength={CV_LIMITS[field]} value={entry[field]} onChange={e => update(section, index, field, e.target.value)}/>
          </label>)}
          <DateFields period={entry.period} english={english} education={section === 'education'} onChange={period => update(section, index, 'period', period)}/>
          <label className="block text-sm text-[#52627a]">{labels.description}<textarea className={`${inputClass} mt-1 min-h-24`} maxLength={CV_LIMITS.description} value={entry.description} onChange={e => update(section, index, 'description', e.target.value)}/></label>
          {!needsWork && <div className="flex justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={() => toggle(id, false)}><Check size={16}/>{labels.done}</Button></div>}
        </div>;
      })}
      {section === 'education' && legacyEducation.filter(old => !value.education.some(entry => sameCvEntry(entry, old.entry))).map((old, index) => <div key={`legacy-${index}`} className="flex items-start gap-3 rounded-xl border border-[#dce5ee] bg-white py-2 pl-3 pr-1" data-cv-entry="legacy">
        {tile('education')}{summary('education', old.entry)}
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#a12828] hover:bg-red-50" aria-label={`${labels.remove} ${old.entry.title}`} title={labels.remove} onClick={old.onRemove}><X size={18}/></button>
      </div>)}
      <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-bold text-[#0089bb] disabled:opacity-50" disabled={value[section].length >= CV_LIMITS.entries} onClick={() => { onChange({ ...value, [section]: [...value[section], { title: '', organization: '', period: '', description: '' }] }); toggle(`${section}:${value[section].length}`, true); }}><Plus size={16}/>{labels.add} {section === 'education' ? (english ? 'education' : 'estudio') : (english ? 'experience' : 'experiencia')}</button>
    </fieldset>)}
    <SkillsField value={value.skills} onChange={skills => onChange({ ...value, skills })} english={english}/>
  </div>;
}

export function CvEditor({ value, onChange, disabled = false, legacyEducation = [], professionalId }: { value: CvProfile; onChange: (value: CvProfile) => void; disabled?: boolean; legacyEducation?: LegacyEducation[]; professionalId: string }) {
  const english = useLocale() === 'en';
  const fileInput = useRef<HTMLInputElement>(null);
  // DOS ACCIONES, UN SOLO SELECTOR DE ARCHIVO. «Subir CV» adjunta el
  // documento para «Ver CV»; «Completar con mi CV» lo lee para llenar los
  // campos. Antes elegir el archivo hacía las dos cosas a la vez sin decirlo.
  const pickFor = useRef<'attach' | 'import'>('import');
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
  const legacyEntries = legacyEducation.map(l => l.entry);
  const current: CvProfile = { ...value, education: [...value.education, ...legacyEntries] };
  function choose(kind: 'attach' | 'import') { pickFor.current = kind; fileInput.current?.click(); }
  async function readFile(file?: File) {
    if (!file) return;
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
  function picked(file?: File) {
    if (!file) return;
    if (pickFor.current === 'attach') { setSelectedFile(file); setError(''); return; }
    void readFile(file);
  }
  function apply() {
    if (!candidate) return;
    if ([...candidate.education, ...candidate.experience].some(e => !e.title.trim() || invalidCvDates(e.period)) || candidate.skills.filter(s => s.trim()).length > 40 || candidate.skills.some(s => s.length > 80)) {
      setError(english ? 'Review the titles, dates and skills (up to 40, 80 characters each).' : 'Revisá los títulos, las fechas y las habilidades (hasta 40, de 80 caracteres cada una).'); return;
    }
    const additions = { ...candidate, education: candidate.education.filter(e => !legacyEntries.some(old => sameCvEntry(old, e))) };
    const merged = mergeCv(value, additions);
    if (merged.education.length > 20 || merged.experience.length > 20 || merged.skills.length > 40 || new Set([...value.skills, ...candidate.skills].map(keyOf)).size > 40) {
      setError(english ? 'Remove entries before importing: up to 20 per section and 40 skills.' : 'Quitá entradas antes de importar: hasta 20 por sección y 40 habilidades.'); return;
    }
    onChange(merged); setCandidate(null); setError(''); setNotice(english ? 'Added to the form. Save your changes to publish them.' : 'Agregado al formulario. Guardá los cambios para publicarlos.');
  }
  const repeated = candidate ? [...candidate.experience.filter(e => current.experience.some(o => sameCvEntry(o, e))), ...candidate.education.filter(e => current.education.some(o => sameCvEntry(o, e)))].length : 0;
  return <fieldset disabled={disabled} className="min-w-0 space-y-5" data-cv-editor>
    <div className="rounded-2xl border border-[#c9e7f2] bg-[#f1faff] p-4">
      <div className="flex items-start gap-3"><FileText className="mt-0.5 shrink-0 text-[#009FD9]" size={22}/><div><h3 className="text-base font-semibold text-[#162543]">{english ? 'Your CV' : 'Tu CV'}</h3><p className="mt-0.5 text-[13px] leading-snug text-[#52627a]">{english ? 'Upload it so clients can open it from your profile.' : 'Subilo para que los clientes lo abran desde tu perfil.'}</p></div></div>
      <input ref={fileInput} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={english ? 'Choose CV' : 'Elegir CV'} onChange={e => { picked(e.target.files?.[0]); e.target.value = ''; }}/>
      <CvFileEditor professionalId={professionalId} selectedFile={selectedFile} english={english} reading={busy} onChoose={() => choose('attach')} onCancel={() => { setSelectedFile(null); setError(''); }}/>
      <div className="mt-4 border-t border-[#c9e7f2] pt-4">
        <p className="text-sm font-semibold text-[#162543]">{english ? 'Fill in from my CV' : 'Completar con mi CV'}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-[#52627a]">{english ? 'We read your experience, education and skills so you can review them before adding.' : 'Leemos tu experiencia, estudios y habilidades para que los revisés antes de agregarlos.'}</p>
        <Button type="button" variant="outline" className="mt-3 min-h-11 bg-white" disabled={busy} onClick={() => choose('import')}><ScanText size={16}/>{english ? 'Choose CV to read' : 'Elegir CV para leer'}</Button>
        {busy && <p role="status" className="mt-2 text-xs text-[#68778d]">{english ? 'Reading CV…' : 'Leyendo CV…'}</p>}
      </div>
      <div className="mt-4 border-t border-[#c9e7f2] pt-4">
        <p className="text-sm font-semibold text-[#162543]">{english ? 'Applying for a job?' : '¿Vas a postular a un empleo?'}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-[#52627a]">{english ? 'Create a version that passes screening filters, with a cover letter, from this information.' : 'Creá una versión que pase los filtros automáticos, con carta de presentación, a partir de estos datos.'}</p>
        <Link href="/dashboard/profesional?tab=cv" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-bold text-[#0089bb]">{english ? 'Create a version to apply' : 'Crear versión para postular'}<ArrowRight size={16}/></Link>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#0089bb]">{notice}</p>}
    {candidate && <div ref={reviewRef} tabIndex={-1} className="space-y-5 rounded-2xl border-2 border-[#009FD9] p-4" aria-label={english ? 'Review imported information' : 'Revisar información importada'}>
      <div><h3 className="font-semibold text-[#162543]">{english ? 'Review before adding' : 'Revisá antes de agregar'}</h3><p className="mt-1 text-sm text-[#52627a]">{english ? 'Correct or remove anything you do not want to publish. Existing information is kept.' : 'Corregí o quitá lo que no querés publicar. Conservamos tus datos actuales.'}</p></div>
      <p role="status" className="text-sm font-semibold text-[#0089bb]">{([[candidate.experience.length, english ? ['work experience', 'work experiences'] : ['experiencia', 'experiencias']], [candidate.education.length, english ? ['education entry', 'education entries'] : ['estudio', 'estudios']], [candidate.skills.length, english ? ['skill', 'skills'] : ['habilidad', 'habilidades']]] as [number, string[]][]).map(([n, [one, many]]) => `${n} ${n === 1 ? one : many}`).join(' · ')}{repeated > 0 && <span className="font-normal text-[#52627a]"> · {repeated} {english ? 'already on your profile (will not be added again)' : (repeated === 1 ? 'ya está en tu perfil (no se agrega de nuevo)' : 'ya están en tu perfil (no se agregan de nuevo)')}</span>}</p>
      {warnings.length > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{english ? 'Some content could not be separated reliably or exceeds the field limits. Compare with your CV and complete the missing information before saving.' : 'Parte del contenido no se pudo separar con seguridad o supera los límites. Compará con tu CV y completá lo que falta antes de guardar.'}</p>}
      <Fields value={candidate} onChange={setCandidate} english={english} existing={current}/>
      <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" onClick={apply}>{english ? 'Add to my profile form' : 'Agregar al formulario'}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setCandidate(null); setError(''); }}>{english ? 'Discard import' : 'Descartar importación'}</Button></div>
    </div>}
    {!candidate && <Fields value={value} onChange={onChange} english={english} legacyEducation={legacyEducation}/>}
  </fieldset>;
}

export function cvValidationError(value: CvProfile): boolean {
  return new TextEncoder().encode(JSON.stringify(normalizeCv(value))).byteLength > 65000 || [...value.education, ...value.experience].some(e => !e.title.trim() || invalidCvDates(e.period)) || value.skills.filter(s => s.trim()).length > 40 || value.skills.some(s => s.length > 80);
}
export { emptyCv, normalizeCv };

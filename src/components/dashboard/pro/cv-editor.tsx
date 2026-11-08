'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { CvFileEditor } from './cv-file-editor';
import { Button } from '@/components/ui/button';
import { Upload, X, Plus, FileText } from 'lucide-react';
import { CV_LIMITS, emptyCv, hasCv, keyOf, mergeCv, normalizeCv, suggestCv, type CvEntry, type CvProfile } from '@/lib/cv/model';

const inputClass = 'min-h-11 w-full rounded-xl border border-[#dce5ee] bg-white px-3 py-2 text-sm text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]';
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
        {(['title', 'organization', 'period', 'description'] as const).map(field => <label key={field} className="block text-sm text-[#52627a]">{field === 'title' ? section === 'education' ? labels.title : labels.role : field === 'organization' ? section === 'education' ? labels.institution : labels.employer : labels[field]}
          {field === 'description' ? <textarea className={`${inputClass} mt-1 min-h-20`} maxLength={CV_LIMITS[field]} value={entry[field]} onChange={e => update(section, index, field, e.target.value)}/> : <input className={`${inputClass} mt-1`} maxLength={CV_LIMITS[field]} value={entry[field]} onChange={e => update(section, index, field, e.target.value)}/>}
        </label>)}
      </div>)}
      <Button type="button" variant="outline" className="min-h-11" disabled={value[section].length >= CV_LIMITS.entries} onClick={() => onChange({ ...value, [section]: [...value[section], { title: '', organization: '', period: '', description: '' }] })}><Plus size={16}/>{labels.add} {section === 'education' ? (english ? 'education' : 'estudio') : (english ? 'experience' : 'experiencia')}</Button>
    </fieldset>)}
    <label className="block text-sm font-semibold text-[#162543]">{labels.skills}<textarea className={`${inputClass} mt-2 min-h-24 font-normal`} value={value.skills.join('\n')} maxLength={3240} onChange={e => onChange({ ...value, skills: e.target.value.split('\n') })}/><span className="mt-1 block text-xs font-normal text-[#68778d]">{labels.skillHelp}</span></label>
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
  useEffect(() => () => { request.current++; }, []);
  const reviewing = candidate !== null;
  useEffect(() => { if (reviewing) reviewRef.current?.focus(); }, [reviewing]);
  async function selectFile(file?: File) {
    if (!file) return;
    setSelectedFile(file);
    const seq = ++request.current;
    setBusy(true); setError(''); setNotice(''); setCandidate(null);
    try {
      const { readCvFile, CvReadError } = await import('@/lib/cv/read-file');
      let content: string;
      try { content = await readCvFile(file); } catch (err) {
        const code = err instanceof CvReadError ? err.code : 'unreadable';
        const messages = english ? { format: 'Choose a PDF or DOCX file. Save older Word files as DOCX.', size: 'The file is empty or too large. Maximum 5 MB and 80,000 characters.', pages: 'Choose a CV with up to 15 pages.', timeout: 'Reading took too long. Try a simpler file or enter your information manually.', protected: 'Export an unprotected copy of your CV.', unreadable: 'We could not read this document. Use a PDF with selectable text or a DOCX, or complete the fields manually.' } : { format: 'Elegí un archivo PDF o DOCX. Guardá los Word antiguos como DOCX.', size: 'El archivo está vacío o es demasiado grande. Máximo 5 MB y 80.000 caracteres.', pages: 'Elegí un CV de hasta 15 páginas.', timeout: 'La lectura tardó demasiado. Probá un archivo más sencillo o completá los campos manualmente.', protected: 'Exportá una copia de tu CV sin contraseña.', unreadable: 'No pudimos leer este documento. Usá un PDF con texto seleccionable o DOCX, o completá los campos manualmente.' };
        throw new Error(messages[code]);
      }
      const extracted = suggestCv(content);
      if (seq !== request.current) return;
      if (!hasCv(extracted)) { setError(english ? 'No education, experience or skills headings were recognized. You can complete the fields manually.' : 'No reconocimos secciones de formación, experiencia o habilidades. Podés completar los campos manualmente.'); return; }
      setCandidate(extracted);
    } catch (err) { if (seq === request.current) setError(err instanceof Error ? err.message : (english ? 'Could not read the file.' : 'No se pudo leer el archivo.')); }
    finally { if (seq === request.current) setBusy(false); }
  }
  function apply() {
    if (!candidate) return;
    if ([...candidate.education, ...candidate.experience].some(e => !e.title.trim()) || candidate.skills.filter(s => s.trim()).length > 40 || candidate.skills.some(s => s.length > 80)) {
      setError(english ? 'Review the titles and skills (up to 40, 80 characters each).' : 'Revisá los títulos y las habilidades (hasta 40, de 80 caracteres cada una).'); return;
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
      <div className="flex items-start gap-3"><FileText className="mt-0.5 shrink-0 text-[#009FD9]" size={22}/><div><h3 className="text-base font-semibold text-[#162543]">{english ? 'Complete your profile with your CV' : 'Completá tu perfil con tu CV'}</h3><p className="mt-1 text-sm leading-6 text-[#52627a]">{english ? 'Import your education, experience and skills, then review before saving.' : 'Importá tus estudios, experiencia y habilidades y revisalos antes de guardar.'}</p></div></div>
      <input ref={fileInput} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label={english ? 'Choose CV' : 'Elegir CV'} onChange={e => { void selectFile(e.target.files?.[0]); e.target.value = ''; }}/>
      <Button type="button" className="mt-4 min-h-11" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16}/>{busy ? (english ? 'Reading CV…' : 'Leyendo CV…') : (english ? 'Choose CV' : 'Elegir CV')}</Button>
      <p className="mt-2 text-xs text-[#68778d]">PDF · DOCX · {english ? 'Maximum 5 MB' : 'Máximo 5 MB'}</p>
      <CvFileEditor professionalId={professionalId} selectedFile={selectedFile} english={english}/>

    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-[#0089bb]">{notice}</p>}
    {candidate && <div ref={reviewRef} tabIndex={-1} className="space-y-5 rounded-2xl border-2 border-[#009FD9] p-4" aria-label={english ? 'Review imported information' : 'Revisar información importada'}>
      <div><h3 className="font-semibold text-[#162543]">{english ? 'Review before adding' : 'Revisá antes de agregar'}</h3><p className="mt-1 text-sm text-[#52627a]">{english ? 'Correct or remove anything you do not want to publish. Existing information is kept.' : 'Corregí o quitá lo que no querés publicar. Conservamos tus datos actuales.'}</p></div>
      <Fields value={candidate} onChange={setCandidate} english={english}/>
      <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" onClick={apply}>{english ? 'Add to my profile form' : 'Agregar al formulario'}</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setCandidate(null); setError(''); }}>{english ? 'Discard import' : 'Descartar importación'}</Button></div>
    </div>}
    {!candidate && <Fields value={value} onChange={onChange} english={english} educationExtra={educationExtra}/>}
  </fieldset>;
}

export function cvValidationError(value: CvProfile): boolean {
  return new TextEncoder().encode(JSON.stringify(normalizeCv(value))).byteLength > 65000 || [...value.education, ...value.experience].some(e => !e.title.trim()) || value.skills.filter(s => s.trim()).length > 40 || value.skills.some(s => s.length > 80);
}
export { emptyCv, normalizeCv };

'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';
import {Button} from '@/components/ui/button';
import {contactFormPublicSchema,validateContactFormAnswers,type ContactFormConfig,type ContactFormErrorKey} from '@/lib/pro/contact-form';
import {ContactFormFields,contactFormConsentText,type ContactFormValues} from './contact-form-fields';

/**
 * Public page of a published contact form (no account). The form id comes from the link. A submission carries an id generated here,
 * so a retry after a lost reply never creates a second lead. A hidden field catches bots; consent is required.
 */
const api='/api/pro/contact-form-public';
export function ContactFormPublic({formId}:{formId:string}){
 const en=useLocale()==='en',[phase,setPhase]=useState<'loading'|'ready'|'gone'|'error'|'sent'>('loading'),[config,setConfig]=useState<ContactFormConfig|null>(null),[business,setBusiness]=useState(''),[values,setValues]=useState<ContactFormValues>({}),[errors,setErrors]=useState<Record<string,ContactFormErrorKey>>({}),[consent,setConsent]=useState(false),[consentError,setConsentError]=useState(false),[website,setWebsite]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirmation,setConfirmation]=useState('');
 const submission=useRef('');
 const load=useCallback(async()=>{setPhase('loading');try{const response=await fetch(api+'?'+new URLSearchParams({id:formId}),{cache:'no-store',credentials:'same-origin'});if(response.status===404||response.status===400){setPhase('gone');return;}if(!response.ok)throw Error();const data=contactFormPublicSchema.parse(await response.json());setConfig(data.config);setBusiness(data.business);setPhase('ready');}catch{setPhase('error');}},[formId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(event:FormEvent){event.preventDefault();if(!config||busy)return;setNotice('');
  const checked=validateContactFormAnswers(config,values);setErrors(checked.ok?{}:checked.errors);setConsentError(!consent);
  if(!checked.ok||!consent){setNotice(en?'Review the marked fields.':'Revise los campos marcados.');return;}
  setBusy(true);submission.current||=crypto.randomUUID();
  try{const response=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:formId,submissionId:submission.current,consent:true,website,answers:values})});
   if(response.status===404){setPhase('gone');return;}
   if(response.status===400){const body=await response.json().catch(()=>({}));if(body&&typeof body==='object'&&'fields' in body)setErrors(body.fields as Record<string,ContactFormErrorKey>);setNotice(en?'Review the marked fields.':'Revise los campos marcados.');return;}
   if(response.status===429){setNotice(en?'Too many attempts. Wait a few minutes and try again.':'Demasiados intentos. Espere unos minutos e intente de nuevo.');return;}
   if(!response.ok)throw Error();const data=await response.json().catch(()=>({}));setConfirmation(typeof data.confirmation==='string'?data.confirmation:config.confirmation);setPhase('sent');
  }catch{setNotice(en?'Could not send. Try again: your request will not be duplicated.':'No se pudo enviar. Intente de nuevo: su solicitud no se duplicará.');}finally{setBusy(false);}}
 const title=useMemo(()=>business?(en?'Contact '+business:'Contactar a '+business):(en?'Contact form':'Formulario de contacto'),[business,en]);
 return <main data-contact-form-public className="mx-auto min-h-screen w-full max-w-xl space-y-5 px-4 py-6 text-[#162543]">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] pb-4"><ContrataCRLogo/></header>
  {phase==='loading'&&<p role="status" className="text-sm text-[#52627a]">{en?'Loading the form…':'Cargando el formulario…'}</p>}
  {phase==='gone'&&<p role="alert" data-contact-form-gone className="rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4 text-sm">{en?'This form is not available. Ask the company for a new link.':'Este formulario no está disponible. Pida un enlace nuevo a la empresa.'}</p>}
  {phase==='error'&&<div role="alert" className="space-y-3 rounded-2xl border border-[#f2c9c9] bg-[#fdf0f0] p-4 text-sm text-[#9b2c2c]"><p>{en?'Could not load the form.':'No se pudo cargar el formulario.'}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{en?'Retry':'Reintentar'}</Button></div>}
  {phase==='sent'&&<section role="status" data-contact-form-sent className="space-y-2 rounded-2xl border border-[#cfe9f3] bg-[#eaf7fb] p-4"><h1 className="text-xl font-bold">{en?'Request sent':'Solicitud enviada'}</h1><p className="whitespace-pre-line break-words text-sm">{confirmation}</p></section>}
  {phase==='ready'&&config&&<form noValidate data-contact-form-form onSubmit={e=>void send(e)} className="space-y-4">
   <h1 className="break-words text-xl font-bold">{title}</h1>
   <ContactFormFields config={config} en={en} values={values} errors={errors} disabled={busy} onChange={(id,value)=>{setValues(old=>({...old,[id]:value}));setErrors(old=>{const next={...old};delete next[id];return next;});}}/>
   <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={e=>setWebsite(e.target.value)}/></label></div>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" data-contact-consent className="mt-1" checked={consent} disabled={busy} onChange={e=>{setConsent(e.target.checked);setConsentError(false);}}/><span>{contactFormConsentText(en)}</span></label>
   {consentError&&<p role="alert" className="text-sm text-red-700">{en?'Accept to send your request.':'Acepte para enviar su solicitud.'}</p>}
   {notice&&<p role="alert" className="text-sm text-red-700">{notice}</p>}
   <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy}>{busy?(en?'Sending…':'Enviando…'):(en?'Submit':'Enviar')}</Button>
  </form>}
 </main>;
}

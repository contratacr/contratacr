'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {fillTemplate,TEMPLATE_VARIABLES,type EmailTemplate,type InboxMessage} from '@/lib/pro/email-tools';

/**
 * Family 10: email templates (reusable subject + message with {{variables}}) and the synced inbox of the connected
 * mailbox (read-only copy, linkable to a job). Nothing here sends mail: templates only fill the project-email form
 * and the owner still confirms each message.
 */
type Provider='google'|'microsoft';
type Work={id:string;label:string};
type Data={templates:EmailTemplate[];inbox:InboxMessage[]};
const api='/api/pro/company-email-tools',card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const TEMPLATES_CHANGED='pro-email-templates-changed';
async function load():Promise<Data|null>{try{const response=await fetch(api,{cache:'no-store'});return response.ok?await response.json() as Data:null;}catch{return null;}}

/** Select inside the project-email form: choosing a template fills the subject and the message. */
export function TemplatePicker({workLabel,onPick}:{workLabel:string;onPick:(subject:string,body:string)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,[templates,setTemplates]=useState<EmailTemplate[]>([]);
 useEffect(()=>{
  let live=true;
  const reload=()=>{void load().then(data=>{if(live&&data)setTemplates(data.templates.filter(template=>!template.archived));});};
  reload();window.addEventListener(TEMPLATES_CHANGED,reload);// the template manager on the same page saved, archived or changed one
  return()=>{live=false;window.removeEventListener(TEMPLATES_CHANGED,reload);};
 },[]);
 if(!templates.length)return null;
 const today=new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'long'}).format(new Date());
 return <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Usar una plantilla','Use a template')}
  <select data-email-template-pick className={field} defaultValue="" onChange={event=>{const template=templates.find(item=>item.id===event.target.value);if(!template)return;
   const values={trabajo:workLabel,fecha:today};onPick(fillTemplate(template.subject,values),fillTemplate(template.body,values));event.target.value='';}}>
   <option value="">{t('Elegir…','Choose…')}</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}
  </select></label>;
}

export function CompanyMailTools({providers,works}:{providers:Provider[];works:Work[]}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [data,setData]=useState<Data|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [draft,setDraft]=useState<{id:string|null;revision:number;name:string;subject:string;body:string;locale:'es'|'en'}|null>(null);
 const seq=useRef(0);
 const refresh=useCallback(async()=>{const n=++seq.current;const next=await load();if(n!==seq.current)return;if(next){setData(next);setFailed(false);}else setFailed(true);},[]);
 useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh]);
 async function post(payload:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const json=await response.json().catch(()=>({})) as {error?:string;inserted?:number};
   if(!response.ok){setError(response.status===409?t('El dato cambió o el nombre ya existe. Actualice e intente de nuevo.','The data changed or the name already exists. Refresh and try again.'):(json.error??t('No se pudo completar la operación.','The operation could not be completed.')));return false;}
   setNotice(typeof json.inserted==='number'?(en?`${json.inserted} new message(s) copied.`:`${json.inserted} mensaje(s) nuevo(s) copiado(s).`):done);return true;
  }catch{setError(t('No se pudo comprobar la operación. Reintente.','Could not confirm the operation. Retry.'));return false;}
  finally{setBusy(false);await refresh();window.dispatchEvent(new Event(TEMPLATES_CHANGED));}
 }
 async function save(event:FormEvent){
  event.preventDefault();if(!draft)return;
  if(await post({action:'template_save',id:draft.id,revision:draft.revision,name:draft.name,subject:draft.subject,body:draft.body,locale:draft.locale},t('Plantilla guardada.','Template saved.')))setDraft(null);
 }
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 if(failed&&!data)return <p role="alert" className="text-sm">{t('No se pudieron cargar las plantillas y el correo recibido.','Could not load the templates and received mail.')}</p>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const active=data.templates.filter(template=>!template.archived);
 return <div data-mail-tools className="min-w-0 space-y-4">
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  <section className={card} aria-labelledby="mail-templates-title" data-mail-templates>
   <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 id="mail-templates-title" className="font-bold">{t('Plantillas de correo','Email templates')}</h3>
    <Button type="button" variant="secondary" disabled={busy||!!draft} data-template-new onClick={()=>setDraft({id:null,revision:0,name:'',subject:'',body:'',locale:en?'en':'es'})}>{t('Nueva plantilla','New template')}</Button></div>
   <p className="text-xs text-[#52627a]">{t('Puede usar estas variables: ','You can use these variables: ')}{TEMPLATE_VARIABLES.map(v=>`{{${v.key}}}`).join(' ')}. {t('Se completan al elegir la plantilla en el correo de proyecto; las que no se pueden completar quedan visibles para que las edite.','They are filled in when you pick the template in the project email; any that cannot be filled stay visible so you can edit them.')}</p>
   {draft&&<form data-template-form onSubmit={save} className="grid min-w-0 gap-3 rounded-xl border border-[#008fb8] bg-[#f7fbfd] p-3 sm:grid-cols-2">
    <label className="block min-w-0 text-sm font-bold">{t('Nombre','Name')}<input data-template-field="name" className={field} required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="block min-w-0 text-sm font-bold">{t('Idioma','Language')}<select data-template-field="locale" className={field} value={draft.locale} onChange={e=>setDraft({...draft,locale:e.target.value as 'es'|'en'})}><option value="es">Español</option><option value="en">English</option></select></label>
    <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Asunto','Subject')}<input data-template-field="subject" className={field} required maxLength={200} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label>
    <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Mensaje','Message')}<textarea data-template-field="body" className={field+' min-h-32 py-2'} required maxLength={20000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy} data-template-save>{t('Guardar plantilla','Save template')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>setDraft(null)}>{t('Cancelar','Cancel')}</Button></div>
   </form>}
   {active.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay plantillas.','No templates yet.')}</p>
   :<ul className="space-y-2">{active.map(template=><li key={template.id} data-template-item={template.id} className="min-w-0 space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{template.name}</strong><span className="rounded-full bg-[#f3f8fb] px-2 py-0.5 text-xs font-bold uppercase">{template.locale}</span></div>
    <p className="break-words text-[#52627a]">{template.subject}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy||!!draft} data-template-edit onClick={()=>setDraft({id:template.id,revision:template.revision,name:template.name,subject:template.subject,body:template.body,locale:template.locale})}>{t('Editar','Edit')}</Button>
     <Button type="button" variant="secondary" className="text-red-700" disabled={busy||!!draft} data-template-archive onClick={()=>void post({action:'template_archive',id:template.id,revision:template.revision},t('Plantilla archivada.','Template archived.'))}>{t('Archivar','Archive')}</Button></div>
   </li>)}</ul>}
  </section>
  <section className={card} aria-labelledby="mail-inbox-title" data-mail-inbox>
   <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 id="mail-inbox-title" className="font-bold">{t('Correo recibido','Received email')}</h3>
    <div className="flex flex-wrap gap-2">{providers.map(provider=><Button key={provider} type="button" variant="secondary" disabled={busy} data-inbox-sync={provider} onClick={()=>void post({action:'inbox_sync',provider},'')}>{provider==='google'?t('Sincronizar Gmail','Sync Gmail'):t('Sincronizar Outlook','Sync Outlook')}</Button>)}</div></div>
   <p className="text-xs text-[#52627a]">{t('Es una copia de lectura: solo se guardan remitente, asunto, un resumen corto y la fecha. ContrataCR no responde ni borra nada en su buzón.','It is a read-only copy: only the sender, subject, a short snippet and the date are kept. ContrataCR never replies to or deletes anything in your mailbox.')}</p>
   {data.inbox.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay correos sincronizados.','No synced emails yet.')}</p>
   :<ul className="space-y-2">{data.inbox.map(message=><li key={message.provider+message.remoteId} data-inbox-item={message.remoteId} className="min-w-0 space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{message.subject}</strong><span className="text-xs text-[#52627a]">{when(message.receivedAt)}</span></div>
    <p className="break-all text-xs text-[#52627a]">{message.fromName?message.fromName+' · ':''}{message.fromEmail}</p>
    {message.snippet&&<p className="break-words">{message.snippet}</p>}
    <label className="block text-xs font-bold">{t('Trabajo vinculado','Linked job')}<select data-inbox-link className={field} disabled={busy} value={message.workId??''} onChange={e=>void post({action:'inbox_link',provider:message.provider,remoteId:message.remoteId,workId:e.target.value||null},t('Vínculo guardado.','Link saved.'))}>
     <option value="">{t('Sin trabajo','No job')}</option>{works.map(work=><option key={work.id} value={work.id}>{work.label}</option>)}</select></label>
   </li>)}</ul>}
  </section>
 </div>;
}

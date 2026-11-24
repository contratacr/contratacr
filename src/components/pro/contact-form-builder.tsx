'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {contactFormBuiltinIds,contactFormLimits,contactFormReadSchema,contactFormConfigSchema,defaultContactFormConfig,defaultContactFormLabels,type ContactFormBuiltinId,type ContactFormConfig,type ContactFormQuestion,type ContactFormRecord} from '@/lib/pro/contact-form';
import {ContactFormFields,contactFormConsentText} from './contact-form-fields';

/**
 * Leads area: contact form builder (one form per company). Edit and Preview, fields in order with editable labels, zip and address
 * that can be shown or required, custom questions (short, long, single or multiple choice), a confirmation message, and publish.
 * A published form has its own public link. Embedding it in another site is not offered yet.
 */
const api='/api/pro/contact-form',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const isBuiltin=(id:string):id is ContactFormBuiltinId=>(contactFormBuiltinIds as readonly string[]).includes(id);
export function ContactFormBuilder({actor,onClose,onChanged}:{actor:string;onClose:()=>void;onChanged?:()=>void}){
 const en=useLocale()==='en',language=en?'en':'es',t=(es:string,english:string)=>en?english:es;
 const [record,setRecord]=useState<ContactFormRecord|null>(null),[config,setConfig]=useState<ContactFormConfig>(()=>defaultContactFormConfig(en?'en':'es')),[saved,setSaved]=useState<string>(''),[loaded,setLoaded]=useState(false),[mode,setMode]=useState<'edit'|'preview'>('edit'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const busyRef=useRef(false);
 const dirty=loaded&&JSON.stringify(config)!==saved;
 const apply=useCallback((form:ContactFormRecord|null)=>{setRecord(form);if(form){setConfig(form.config);setSaved(JSON.stringify(form.config));}else setSaved(JSON.stringify(defaultContactFormConfig(en?'en':'es')));},[en]);
 const load=useCallback(async()=>{try{const r=await fetch(api,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();apply(contactFormReadSchema.parse(await r.json()).form);setLoaded(true);setError('');}catch{setError(en?'Could not load the contact form.':'No se pudo cargar el formulario de contacto.');}},[actor,apply,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function call(body:Record<string,unknown>){
  const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});
  if(r.status===409){await load();throw Error(t('El formulario cambió en otra pantalla. Se actualizó; revise e intente de nuevo.','The form changed on another screen. It was refreshed; review it and try again.'));}
  if(r.status===400)throw Error(t('Revise los campos del formulario.','Review the form fields.'));
  if(!r.ok)throw Error(t('No se pudo guardar. Reintente.','Could not save. Try again.'));
  return contactFormReadSchema.parse(await r.json()).form;
 }
 async function run(task:()=>Promise<void>){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await task();onChanged?.();}catch(caught){setError(caught instanceof Error?caught.message:String(caught));}finally{busyRef.current=false;setBusy(false);}}
 const parsed=contactFormConfigSchema.safeParse(config);
 const save=()=>run(async()=>{const form=await call({action:'save',revision:record?.revision??0,config});apply(form);});
 const publish=(on:boolean)=>run(async()=>{let current=record;if(dirty||!current)current=await call({action:'save',revision:current?.revision??0,config});if(!current)return;apply(await call({action:on?'publish':'unpublish',revision:current.revision}));});
 const shareUrl=record?window.location.origin+(en?'/en':'')+'/formulario-contacto/'+record.publicId:'';
 async function copy(){try{await navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError(t('No se pudo copiar. Seleccione el enlace y cópielo.','Could not copy. Select the link and copy it.'));}}
 function move(id:string,delta:-1|1){setConfig(c=>{const order=[...c.order],i=order.indexOf(id),j=i+delta;if(i<0||j<0||j>=order.length)return c;[order[i],order[j]]=[order[j],order[i]];return {...c,order};});}
 const setQuestion=(id:string,patch:Partial<ContactFormQuestion>)=>setConfig(c=>({...c,questions:c.questions.map(q=>q.id===id?{...q,...patch}:q)}));
 function addQuestion(){if(config.questions.length>=contactFormLimits.questions)return;const q:ContactFormQuestion={id:crypto.randomUUID(),label:'',type:'short',required:false,options:[]};setConfig(c=>({...c,questions:[...c.questions,q],order:[...c.order,q.id]}));}
 function removeQuestion(id:string){setConfig(c=>({...c,questions:c.questions.filter(q=>q.id!==id),order:c.order.filter(x=>x!==id)}));}
 const status=!loaded?t('Cargando…','Loading…'):dirty?t('Cambios sin guardar','Unsaved changes'):record?(record.status==='published'?t('Publicado','Published'):t('Borrador guardado','Draft saved')):t('Sin guardar todavía','Not saved yet');
 const invalid=!parsed.success;
 const row=(id:string,i:number)=>{
  const question=config.questions.find(q=>q.id===id),arrows=<span className="flex shrink-0 gap-1"><button type="button" aria-label={t('Subir','Move up')} disabled={i===0||busy} className="min-h-9 min-w-9 rounded-lg border border-[#d7e1ea] disabled:opacity-40" onClick={()=>move(id,-1)}>↑</button><button type="button" aria-label={t('Bajar','Move down')} disabled={i===config.order.length-1||busy} className="min-h-9 min-w-9 rounded-lg border border-[#d7e1ea] disabled:opacity-40" onClick={()=>move(id,1)}>↓</button></span>;
  if(question)return <li key={id} data-contact-builder-question={id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <div className="flex items-start justify-between gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">{t('Escriba su pregunta','Enter your question')}<input data-contact-question-label value={question.label} maxLength={contactFormLimits.label} disabled={busy} className={field} onChange={e=>setQuestion(id,{label:e.target.value})}/></label>{arrows}</div>
   <label className="block text-sm font-semibold">{t('Tipo de respuesta','Answer type')}<select data-contact-question-type value={question.type} disabled={busy} className={field} onChange={e=>{const type=e.target.value as ContactFormQuestion['type'];setQuestion(id,{type,options:type==='single'||type==='multiple'?(question.options.length?question.options:['','']):[]});}}><option value="short">{t('Respuesta corta','Short answer')}</option><option value="long">{t('Respuesta larga','Long answer')}</option><option value="single">{t('Una opción','Single choice')}</option><option value="multiple">{t('Varias opciones','Multiple choice')}</option></select></label>
   {(question.type==='single'||question.type==='multiple')&&<label className="block text-sm font-semibold">{t('Opciones (una por línea, entre 2 y 10)','Options (one per line, 2 to 10)')}<textarea data-contact-question-options rows={4} value={question.options.join('\n')} disabled={busy} className={field} onChange={e=>setQuestion(id,{options:e.target.value.split('\n').slice(0,contactFormLimits.options).map(o=>o.slice(0,contactFormLimits.option))})}/></label>}
   <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={question.required} disabled={busy} onChange={e=>setQuestion(id,{required:e.target.checked})}/>{t('Respuesta obligatoria','Response required')}</label><Button type="button" variant="outline" disabled={busy} onClick={()=>removeQuestion(id)}>{t('Eliminar pregunta','Delete question')}</Button></div>
  </li>;
  if(!isBuiltin(id))return null;
  const optional=id==='zip'||id==='address';
  return <li key={id} data-contact-builder-field={id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <div className="flex items-start justify-between gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">{defaultContactFormLabels[language][id]}<input data-contact-field-label={id} value={config.labels[id]??''} placeholder={defaultContactFormLabels[language][id]} maxLength={60} disabled={busy} className={field} onChange={e=>setConfig(c=>({...c,labels:{...c.labels,[id]:e.target.value}}))}/></label>{arrows}</div>
   {optional?<div className="flex flex-wrap gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-contact-show={id} checked={config[id].show} disabled={busy} onChange={e=>setConfig(c=>({...c,[id]:{show:e.target.checked,required:e.target.checked&&c[id].required}}))}/>{t('Mostrar','Show')}</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-contact-required={id} checked={config[id].required} disabled={busy||!config[id].show} onChange={e=>setConfig(c=>({...c,[id]:{...c[id],required:e.target.checked}}))}/>{t('Respuesta obligatoria','Response required')}</label></div>
    :<p className="text-sm text-[#52627a]">{t('Respuesta obligatoria (no se puede cambiar).','Response required (cannot be changed).')}</p>}
  </li>;
 };
 return <Modal manageFocus title={t('Formulario de contacto','Contact form')} onClose={()=>{if(!busy)onClose();}} closeLabel={t('Cerrar','Close')} size="lg"
  footer={<div className="flex flex-wrap items-center justify-between gap-2"><span data-contact-builder-status role="status" className="text-sm text-[#52627a]">{status}</span><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy||!loaded||!dirty||invalid} onClick={()=>void save()}>{t('Guardar borrador','Save draft')}</Button>{record?.status==='published'?<Button type="button" variant="outline" data-contact-unpublish disabled={busy||!loaded} onClick={()=>void publish(false)}>{t('Despublicar','Unpublish')}</Button>:null}<Button type="button" data-contact-publish disabled={busy||!loaded||invalid||(record?.status==='published'&&!dirty)} onClick={()=>void publish(true)}>{record?.status==='published'?t('Publicar cambios','Publish changes'):t('Crear formulario','Create form')}</Button></div></div>}>
  <div data-contact-builder className="min-w-0 space-y-4">
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {record?.status==='published'&&<div data-contact-share className="min-w-0 space-y-2 rounded-xl border border-[#cfe9f3] bg-[#eaf7fb] p-3 text-sm"><p className="font-semibold">{t('Su formulario está publicado','Your form is published')}</p><p className="text-[#52627a]">{t('Comparta este enlace por correo, WhatsApp o redes sociales. Cada envío llega a Solicitudes con el canal Sitio web. Todavía no se puede incrustar en otro sitio web.','Share this link by email, WhatsApp or social media. Every submission arrives in Leads with the Website channel. It cannot be embedded in another website yet.')}</p><div className="flex flex-wrap items-center gap-2"><input readOnly aria-label={t('Enlace del formulario','Form link')} data-contact-share-url value={shareUrl} onFocus={e=>e.currentTarget.select()} className={field+' flex-1'}/><Button type="button" variant="outline" onClick={()=>void copy()}>{copied?t('Copiado','Copied'):t('Copiar enlace','Copy link')}</Button><a href={shareUrl} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-4 font-semibold text-[#008bb5]">{t('Abrir','Open')}</a></div><p className="text-xs text-[#52627a]">{en?`${record.submissions} submissions received.`:`${record.submissions} envíos recibidos.`}</p></div>}
   <div role="group" aria-label={t('Modo','Mode')} className="flex gap-2">{([['edit',t('Editar','Edit')],['preview',t('Vista previa','Preview')]] as const).map(([v,label])=><button key={v} type="button" data-contact-mode={v} aria-pressed={mode===v} onClick={()=>setMode(v)} className={'min-h-9 rounded-full border px-3 text-sm '+(mode===v?'border-[#008bb5] bg-[#e8f6fb] font-semibold':'border-[#d7e1ea]')}>{label}</button>)}</div>
   {invalid&&<p role="alert" className="text-sm text-red-700">{t('Complete el texto de cada pregunta y de cada opción (las de elección necesitan al menos 2 opciones distintas).','Fill in the text of every question and option (choice questions need at least 2 different options).')}</p>}
   {mode==='edit'?<>
    <ol className="space-y-2">{config.order.map(row)}</ol>
    <Button type="button" variant="outline" data-contact-add-question disabled={busy||config.questions.length>=contactFormLimits.questions} onClick={addQuestion}>+ {t('Agregar pregunta','Add question')}</Button>
    <label className="block text-sm font-semibold">{t('Mensaje de confirmación','Confirmation message')}<textarea data-contact-confirmation rows={3} maxLength={contactFormLimits.confirmation} value={config.confirmation} disabled={busy} className={field} onChange={e=>setConfig(c=>({...c,confirmation:e.target.value}))}/></label>
   </>:<div data-contact-preview className="min-w-0 space-y-4 rounded-xl border border-[#d7e1ea] bg-white p-4">
    <p className="text-sm text-[#52627a]">{t('Así verá el formulario la persona que lo reciba. No se envía nada desde aquí.','This is how the person who receives it will see the form. Nothing is sent from here.')}</p>
    <ContactFormFields config={config} en={en} values={{}} errors={{}} disabled onChange={()=>undefined}/>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled className="mt-1"/><span>{contactFormConsentText(en)}</span></label>
    <Button type="button" disabled>{t('Enviar','Submit')}</Button>
    <p className="whitespace-pre-line rounded-xl bg-[#f4f7fa] p-3 text-sm"><span className="font-semibold">{t('Confirmación: ','Confirmation: ')}</span>{config.confirmation}</p>
   </div>}
  </div>
 </Modal>;
}

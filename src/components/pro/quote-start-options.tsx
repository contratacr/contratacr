'use client';
import {useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Sparkles,FileUp} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/use-auth';
import {ProModal} from './modal';
import {AiDraftAssist} from './ai-assistant';
import {pushProParams} from '@/lib/pro/navigation';
import {writeQuoteStartPayload} from '@/lib/pro/quote-start-payload';
import {parseQuoteFile,QUOTE_IMPORT_MAX_BYTES,type ImportedQuoteRow} from '@/lib/pro/quote-file-import';

/** Area D: "Create with AI" and "Import from file" next to "New quote". Both leave a normal local draft and open the usual editor, so nothing is sent or saved until the professional saves. */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
function openWithDraft(actor:string,draft:{title:string;notes:string;rows:ImportedQuoteRow[]}){
 const id=crypto.randomUUID();
 if(!writeQuoteStartPayload(actor,id,{title:draft.title.slice(0,160),notes:draft.notes.slice(0,2000),lines:draft.rows.map(row=>({description:row.description,quantity:row.quantity,price:row.unit_price}))}))return false;
 pushProParams({nuevaEstimacion:id,estimacionPrivada:null,cotizacionCliente:null,origenEstimacion:null,idOrigenEstimacion:null,revisionOrigenEstimacion:null,huellaOrigenEstimacion:null,lineaCatalogo:null,volverEstimacion:null});return true;
}
export function QuoteStartOptions({disabled,onStart}:{disabled:boolean;onStart?:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{user}=useAuth(),input=useRef<HTMLInputElement>(null);
 const [ai,setAi]=useState(false),[title,setTitle]=useState(''),[scope,setScope]=useState(''),[error,setError]=useState('');
 if(!user)return null;
 async function pick(file:File|undefined){
  setError('');if(!file)return;
  if(file.size>QUOTE_IMPORT_MAX_BYTES){setError(t('El archivo es demasiado grande (máximo 200 KB).','The file is too large (200 KB maximum).'));return;}
  let text:string;try{text=await file.text();}catch{setError(t('No se pudo leer el archivo.','The file could not be read.'));return;}
  const result=parseQuoteFile(text);
  if(!result.rows.length){setError(t('No se encontraron partidas. Use un archivo CSV con las columnas descripción, cantidad y precio unitario.','No lines were found. Use a CSV file with description, quantity and unit price columns.'));return;}
  if(openWithDraft(user!.id,{title:file.name.replace(/\.[^.]+$/,''),notes:'',rows:result.rows}))onStart?.();else setError(t('No se pudo preparar el borrador en este navegador.','The draft could not be prepared in this browser.'));
 }
 function startAi(){
  if(openWithDraft(user!.id,{title,notes:scope,rows:[{description:title.trim().slice(0,140),quantity:'1',unit_price:''}]})){setAi(false);onStart?.();}else setError(t('No se pudo preparar el borrador en este navegador.','The draft could not be prepared in this browser.'));
 }
 const secondary='min-h-11 flex-1 sm:flex-none';
 return <div data-quote-start-options className="min-w-0 space-y-2">
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="secondary" data-quote-start="ai" className={secondary} disabled={disabled} onClick={()=>{setError('');setAi(true);}}><Sparkles className="h-4 w-4" aria-hidden/>{t('Crear con IA','Create with AI')}</Button>
   <Button type="button" variant="secondary" data-quote-start="import" className={secondary} disabled={disabled} onClick={()=>input.current?.click()}><FileUp className="h-4 w-4" aria-hidden/>{t('Importar de archivo','Import from file')}</Button>
   <input ref={input} data-quote-import-file type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" className="sr-only" tabIndex={-1} aria-label={t('Archivo de partidas (CSV)','Lines file (CSV)')} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void pick(file);}}/>
  </div>
  {error&&!ai&&<p role="alert" data-quote-start-error className="text-sm text-red-700">{error}</p>}
  {ai&&<ProModal open onClose={()=>setAi(false)} title={t('Crear cotización con IA','Create a quote with AI')} size="lg" mobilePresentation="fullscreen" footer={<><Button type="button" variant="secondary" onClick={()=>setAi(false)}>{t('Cancelar','Cancel')}</Button><Button type="button" data-quote-ai-continue disabled={!title.trim()} onClick={startAi}>{t('Abrir borrador','Open draft')}</Button></>}>
   <div data-quote-ai className="min-w-0 space-y-4">
    <p className="text-sm text-[#52627a]">{t('Describa el trabajo y la IA propone el alcance y las notas de la cotización. Usted revisa y edita todo en el borrador; no se envía nada al cliente.','Describe the job and the AI suggests the scope and notes of the quote. You review and edit everything in the draft; nothing is sent to the customer.')}</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="block text-sm font-semibold">{t('Trabajo a cotizar','Job to quote')}<input data-quote-ai-title className={field} value={title} maxLength={120} onChange={event=>setTitle(event.target.value)}/></label>
    <div className="min-w-0 space-y-2"><AiDraftAssist feature="quote_scope" getInput={()=>({title,current:scope,lines:[title]})} onUse={setScope} disabled={!title.trim()} label={t('✦ Sugerir alcance','✦ Suggest scope')}/>
     <label className="block text-sm font-semibold">{t('Alcance y notas','Scope and notes')}<textarea data-quote-ai-scope className={field+' min-h-28'} value={scope} maxLength={2000} onChange={event=>setScope(event.target.value)}/></label></div>
   </div>
  </ProModal>}
 </div>;
}

'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {pushProParams} from '@/lib/pro/navigation';
import {Composer} from './company-connectors';

/**
 * Round 6C (6B follow-up): project email composed from the job workspace. Same contract as Company › Correo y
 * calendario (connected Google/Microsoft account, explicit confirmation of EACH message, mock = outbox only),
 * with the project fixed to this job and the job's own sent/simulated messages listed below.
 */
type Composed=Parameters<typeof Composer>[0]['data'];
type Mail={id:string;status:string;to:string[];subject:string;workId:string|null;createdAt:string};
export function WorkProjectEmail({workId}:{workId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Composed|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch('/api/pro/connectors',{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Composed;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(payload:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/pro/connectors',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(en?({missing_keys:'Server keys for this provider are missing.',not_connected:'Connect the account first.',pro_oauth_not_connected:'Connect the account first.',pro_email_confirm:'Confirm sending this email.',attachment:'One of the attachments is no longer available.'} as Record<string,string>)[json.reason]??'Could not complete it.':json.error??'No se pudo completar.');return null;}
   return json as Record<string,unknown>;
  }catch{setError(t('No se pudo comprobar el envío. Reintente; no se registrará dos veces.','Could not confirm the send. Retry; it will not be recorded twice.'));return null;}
  finally{setBusy(false);await load();}
 }
 if(failed&&!data)return <div role="alert" className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm"><p>{t('No se pudo cargar el correo del proyecto.','Could not load project email.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return null;
 const connected=data.providers.filter(p=>p.id!=='quickbooks'&&p.connected).map(p=>p.id as 'google'|'microsoft');
 const mails=(data.outbox as unknown as Mail[]).filter(mail=>mail.workId===workId);
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 return <div data-work-project-email className="min-w-0 space-y-3">
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {connected.length===0?<section className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h3 className="font-bold">{t('Correo de proyecto','Project email')}</h3>
   <p className="text-sm text-[#52627a]">{t('Conecte su cuenta de Google o Microsoft para escribir desde aquí al cliente o a proveedores; cada envío pide su confirmación.','Connect your Google or Microsoft account to write to the customer or suppliers from here; each send asks for your confirmation.')}</p>
   <Button type="button" variant="secondary" data-work-email-connect onClick={()=>pushProParams({tab:'pro_company',empresa:'conectores',cita:null,vistaTrabajo:null})}>{t('Conectar cuenta','Connect account')}</Button></section>
  :<Composer key={connected.join()} providers={connected} data={data} busy={busy} post={post} confirm={confirm} fixedWork={workId} onSent={()=>setNotice(t('Correo registrado en este trabajo.','Email recorded in this job.'))}/>}
  {mails.length>0&&<section data-work-email-outbox className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="text-sm font-bold">{t('Correos de este trabajo','Emails for this job')}</h4>
   <ul className="space-y-1 text-sm">{mails.map(mail=><li key={mail.id} data-work-email-item={mail.status} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg bg-[#f7f9fc] px-2 py-1"><span className="min-w-0 break-words">{mail.subject} · <span className="break-all">{mail.to.join(', ')}</span></span><span className="text-xs text-[#52627a]">{mail.status==='simulated'?t('Simulado · no enviado','Simulated · not sent'):mail.status==='sent'?t('Enviado','Sent'):mail.status} · {when(mail.createdAt)}</span></li>)}</ul></section>}
  {dialogNode}
 </div>;
}

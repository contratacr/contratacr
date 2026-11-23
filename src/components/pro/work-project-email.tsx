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
type Received={provider:string;remoteId:string;fromEmail:string;fromName:string|null;subject:string;snippet:string;receivedAt:string};
export function WorkProjectEmail({workId}:{workId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Composed|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [received,setReceived]=useState<Received[]>([]),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch('/api/pro/connectors',{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Composed;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{let live=true;void fetch('/api/pro/work-email-log?workId='+encodeURIComponent(workId),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(body=>{if(live&&body)setReceived((body as {messages:Received[]}).messages);}).catch(()=>{});return()=>{live=false;};},[workId,data]);
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
  {(mails.length>0||received.length>0)&&<section data-work-email-log className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><h4 className="text-sm font-bold">{t('Registro de conversación','Conversation log')}</h4>
   <p className="text-xs text-[#52627a]">{t('Correos enviados o simulados desde este trabajo y correos recibidos que usted vinculó a él, del más reciente al más antiguo.','Emails sent or simulated from this job and received emails you linked to it, newest first.')}</p>
   <ul className="space-y-1 text-sm">{[...mails.map(mail=>({key:'o'+mail.id,at:mail.createdAt,out:true,subject:mail.subject,who:mail.to.join(', '),state:mail.status,snippet:''})),...received.map(mail=>({key:'i'+mail.provider+mail.remoteId,at:mail.receivedAt,out:false,subject:mail.subject,who:(mail.fromName?mail.fromName+' · ':'')+mail.fromEmail,state:'received',snippet:mail.snippet}))]
    .sort((a,b)=>b.at.localeCompare(a.at)).map(row=><li key={row.key} data-work-email-log-item={row.out?'out':'in'} className="min-w-0 space-y-0.5 rounded-lg bg-[#f7f9fc] px-2 py-1">
     <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"><span className="min-w-0 break-words font-semibold">{row.out?t('Enviado a','To')+': ':t('Recibido de','From')+': '}<span className="break-all font-normal">{row.who}</span></span>
      <span className="text-xs text-[#52627a]">{row.state==='simulated'?t('Simulado · no enviado','Simulated · not sent'):row.out&&row.state==='sent'?t('Enviado','Sent'):row.out?row.state:t('Recibido','Received')} · {when(row.at)}</span></p>
     <p className="break-words">{row.subject}</p>{row.snippet&&<p className="break-words text-xs text-[#52627a]">{row.snippet}</p>}</li>)}</ul></section>}
  {dialogNode}
 </div>;
}

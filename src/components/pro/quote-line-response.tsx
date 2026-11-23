'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {acceptancePublicationReadSchema,acceptanceResultSchema,lineResponseReadSchema,type LineResponse} from '@/lib/pro/quote-recorded-acceptance';

/**
 * Rows 39 and 35: the formal partial response of a shared version (customer side) and its direct conversion into the agreement of a job
 * (owner side). The response is sent once, freezes the line decisions and is read-only for both parties. Converting creates a NEW quote with
 * only the lines the customer approved and links it as the job's agreement; the shared version and its decisions never change.
 */
const reasonText=(en:boolean):Record<string,string>=>en?{currency:'Only quotes in colones can become the agreement of a job.',job:'Choose the job.',convert_first:'Convert the opportunity into a job first.',other_job:'This quote belongs to another job.',
 job_rules:'This job cannot take the agreement (another customer, cancelled, already agreed or with earlier finances).',already_converted:'This partial response was already converted.',no_response:'The customer has not sent the partial response yet.',
 already_accepted:'This quote already has an accepted version.',stale:'The draft changed. Reload and try again.',client_archived:'Restore the customer first.',empty:'The quote has no amount to agree.',incomplete:'Decide every item: at least one approved and one not approved.'}
 :{currency:'Solo las cotizaciones en colones pueden quedar como acuerdo del trabajo.',job:'Elija el trabajo.',convert_first:'Convierta primero la oportunidad en trabajo.',other_job:'Esta cotización pertenece a otro trabajo.',
 job_rules:'Este trabajo no admite el acuerdo (otro cliente, cancelado, con otro acuerdo o con finanzas anteriores).',already_converted:'Esta respuesta parcial ya se convirtió en acuerdo.',no_response:'El cliente aún no envió su respuesta parcial.',
 already_accepted:'Esta cotización ya tiene una versión aceptada.',stale:'El borrador cambió. Recargue e intente de nuevo.',client_archived:'Restaure primero al cliente.',empty:'La cotización no tiene un monto que acordar.',incomplete:'Decida todas las partidas: al menos una aprobada y una no aprobada.'};
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type Props={actor:string;publicationId:string;side:'owner'|'client';open:boolean;pendingCount:number;approvedCount:number;declinedCount:number;money:(cents:number)=>string;onResponse:(response:LineResponse|null)=>void;onChanged:()=>void};
export function QuoteLineResponse({actor,publicationId,side,open,pendingCount,approvedCount,declinedCount,money,onResponse,onChanged}:Props){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,reasons=reasonText(en);
 const [response,setResponse]=useState<LineResponse|null>(null),[loaded,setLoaded]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),attempt=useRef<{key:string;id:string}|null>(null);
 const [acc,setAcc]=useState<ReturnType<typeof acceptancePublicationReadSchema.parse>|null>(null),[workId,setWorkId]=useState(''),[notice,setNotice]=useState(''),convertAttempt=useRef<{key:string;id:string}|null>(null);
 const headers={'X-Pro-Expected-Actor':actor};
 const load=useCallback(async()=>{
  try{
   const r=await fetch('/api/pro/quote-line-response?'+new URLSearchParams({publicationId}),{cache:'no-store',headers});if(!r.ok)throw Error();
   const next=lineResponseReadSchema.parse(await r.json()).response;setResponse(next);onResponse(next);setLoaded(true);
   if(side==='owner'&&next){const a=await fetch('/api/pro/quote-acceptance?'+new URLSearchParams({publicationId}),{cache:'no-store',headers});if(a.ok){const parsed=acceptancePublicationReadSchema.parse(await a.json());setAcc(parsed);setWorkId(w=>w||parsed.targetWorkId||(parsed.works.length===1?parsed.works[0].id:''));}}
  }catch{setLoaded(true);}
 // eslint-disable-next-line react-hooks/exhaustive-deps -- onResponse is the parent setter.
 },[actor,publicationId,side]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const when=(iso:string)=>new Date(iso).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 async function send(){
  if(busy)return;const key=JSON.stringify([publicationId,note.trim()]);if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/quote-line-response',{method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({actionId:attempt.current.id,publicationId,note:note.trim()})});
   const body=await r.json().catch(()=>({})) as {reason?:string};
   if(r.status===409){attempt.current=null;setError(t('La propuesta cambió o ya se respondió. Se recargó.','The proposal changed or was already answered. It was reloaded.'));await load();onChanged();return;}
   if(!r.ok){setError(body.reason&&reasons[body.reason]?reasons[body.reason]:t('No se pudo enviar la respuesta.','The response could not be sent.'));return;}
   attempt.current=null;setNotice(t('Su respuesta por partidas se envió a su profesional.','Your item-by-item response was sent to your professional.'));await load();onChanged();
  }catch{setError(t('No se pudo comprobar el envío. Intente de nuevo; no se enviará dos veces.','Could not confirm the sending. Try again; it will not be sent twice.'));}finally{setBusy(false);}
 }
 async function convert(){
  if(busy||!response)return;const key=JSON.stringify([publicationId,workId]);if(convertAttempt.current?.key!==key)convertAttempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/quote-acceptance',{method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'partial_response',actionId:convertAttempt.current.id,publicationId,workId:workId||null})});
   const body=await r.json().catch(()=>({})) as {reason?:string};
   if(!r.ok){if(r.status===409||r.status===400)convertAttempt.current=null;setError(body.reason&&reasons[body.reason]?reasons[body.reason]:t('No se pudo convertir en acuerdo. Recargue e intente de nuevo.','Could not convert it into an agreement. Reload and try again.'));return;}
   const result=acceptanceResultSchema.parse(body);convertAttempt.current=null;
   setNotice(t(`Listo: la cotización con ${result.lineCount} partidas aprobadas (${money(result.totalCents)}) quedó como acuerdo aceptado del trabajo.`,`Done: the quote with ${result.lineCount} approved items (${money(result.totalCents)}) is now the accepted agreement of the job.`));await load();onChanged();
  }catch{setError(t('No se pudo comprobar el guardado. Intente de nuevo; no se creará dos veces.','Could not confirm the save. Try again; it will not be created twice.'));}finally{setBusy(false);}
 }
 if(!loaded)return null;
 const ready=pendingCount===0&&approvedCount>=1&&declinedCount>=1;
 return <section data-quote-line-response className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-[#f7fbfd] p-3">
  {error&&<p role="alert" data-quote-line-response-error className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-quote-line-response-notice className="text-sm text-[#175b42]">{notice}</p>}
  {response?<div data-quote-line-response-sent className="space-y-1 text-sm text-[#162543]">
   <p className="font-semibold">{t('Respuesta formal por partidas','Formal item-by-item response')}</p>
   <p>{t(`Enviada el ${when(response.respondedAt)} por ${response.respondedByName||'el cliente'}: ${response.approvedCount} partidas aprobadas (${money(response.approvedCents)}) y ${response.declinedCount} no aprobadas (${money(response.declinedCents)}).`,
    `Sent on ${when(response.respondedAt)} by ${response.respondedByName||'the customer'}: ${response.approvedCount} approved items (${money(response.approvedCents)}) and ${response.declinedCount} not approved (${money(response.declinedCents)}).`)}</p>
   {response.note&&<p className="break-words text-[#52627a]">{t('Nota: ','Note: ')}{response.note}</p>}
   <p className="text-xs text-[#52627a]">{t('Las decisiones por partida quedaron congeladas en esta versión.','The item decisions are frozen in this version.')}</p></div>
  :side==='client'&&open?<div className="space-y-2">
   <p className="text-sm text-[#162543]">{ready?t('Cuando termine de decidir, envíe su respuesta por partidas: su profesional la recibe como respuesta formal y las decisiones ya no cambian.','When you finish deciding, send your item-by-item response: your professional receives it as the formal answer and the decisions no longer change.')
    :t('Para enviar su respuesta formal por partidas decida todas las partidas, con al menos una aprobada y una no aprobada. Si aprueba todo, acepte la cotización completa.','To send your formal item-by-item response, decide every item, with at least one approved and one not approved. If you approve everything, accept the whole quote.')}</p>
   {ready&&<><label className="block text-xs font-semibold text-[#162543]">{t('Nota para su profesional (opcional)','Note for your professional (optional)')}<textarea data-quote-line-response-note className={field+' min-h-20'} maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <Button type="button" className="min-h-11" data-quote-line-response-send disabled={busy} onClick={()=>void send()}>{t('Enviar mi respuesta por partidas','Send my item-by-item response')}</Button></>}</div>:null}
  {side==='owner'&&response&&acc&&<div data-quote-line-agreement className="space-y-2 rounded-xl border border-[#b9e0c8] bg-white p-3">
   {acc.conversion?<p data-quote-line-agreement-done className="text-sm text-[#175b42]">{t(`Es el acuerdo aceptado del trabajo ${acc.conversion.workId}: versión ${acc.conversion.version} con ${money(acc.conversion.totalCents)}, creada solo con las partidas que el cliente aprobó.`,`It is the accepted agreement of job ${acc.conversion.workId}: version ${acc.conversion.version} with ${money(acc.conversion.totalCents)}, created only with the items the customer approved.`)}</p>
   :<>
    <p className="text-sm text-[#162543]">{t('Convierta directamente lo que el cliente aprobó en el acuerdo aceptado del trabajo. Se crea una cotización nueva solo con las partidas aprobadas y esta respuesta queda como evidencia; la versión compartida no cambia.','Convert what the customer approved directly into the accepted agreement of the job. A new quote is created with only the approved items and this response is kept as evidence; the shared version does not change.')}</p>
    <label className="block text-xs font-semibold text-[#162543]">{t('Trabajo del acuerdo','Job of the agreement')}<select data-quote-line-agreement-work className={field} value={workId} onChange={e=>setWorkId(e.target.value)}>
     <option value="">{t('Elegir trabajo…','Choose a job…')}</option>{acc.works.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
    <Button type="button" className="min-h-11" data-pro-write="sales.write" data-quote-line-agreement-convert disabled={busy||!workId} onClick={()=>void convert()}>{t('Convertir en acuerdo del trabajo','Convert into the job agreement')}</Button></>}
  </div>}
 </section>;
}

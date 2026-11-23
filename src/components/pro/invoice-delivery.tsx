'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {invoiceDeliverySchema,invoiceLifecycleSchema,type InvoiceDelivery,type InvoiceStatus} from '@/lib/pro/invoice-delivery';

/** Rows 42/44: send the invoice draft to the customer of the job and follow its status (draft, sent, viewed, partly paid, paid, overdue). E-mail is sandbox only. */
const api='/api/pro/invoice-delivery';
const tone:Record<InvoiceStatus,string>={draft:'bg-[#f1f4f8] text-[#52627a]',sent:'bg-[#eaf5fb] text-[#006e90]',viewed:'bg-[#eaf5fb] text-[#006e90]',partial:'bg-[#fff4dc] text-[#7a4b00]',paid:'bg-[#eef8f4] text-[#18573a]',overdue:'bg-[#fdf0eb] text-[#a03c1f]',void:'bg-[#f1f4f8] text-[#52627a]'};
export function InvoiceDelivery({id,blocked}:{id:string;blocked:boolean}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <DeliverySession key={user.id+':'+id} accountId={user.id} id={id} blocked={blocked}/>;
}
function DeliverySession({accountId,id,blocked}:{accountId:string;id:string;blocked:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<InvoiceDelivery|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[email,setEmail]=useState(false),[uncertain,setUncertain]=useState(false);
 const pending=useRef<{action:'send'|'recall';actionId:string;draftId:string;email?:boolean}|null>(null);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch(api+'?'+new URLSearchParams({draftId:id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setData(invoiceDeliverySchema.parse(await r.json()));}catch{setFailed(true);}},[accountId,id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const labels:Record<InvoiceStatus,string>={draft:t('Borrador','Draft'),sent:t('Enviada','Sent'),viewed:t('Vista por el cliente','Viewed by the customer'),partial:t('Pago parcial','Partly paid'),paid:t('Pagada','Paid'),overdue:t('Vencida','Overdue'),void:t('Anulada','Void')};
 const events={send:t('Enviada','Sent'),resend:t('Enviada de nuevo','Sent again'),recall:t('Retirada','Recalled'),view:t('Vista por el cliente','Viewed by the customer'),email_sandbox_sent:t('Correo simulado (no se envió)','Simulated e-mail (not sent)'),email_failed:t('Correo no enviado','E-mail not sent')};
 const when=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(iso+'T00:00:00Z'));
 async function run(input:{action:'send'|'recall';actionId:string;draftId:string;email?:boolean}){setBusy(true);setError('');setNotice('');pending.current=input;setUncertain(false);
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(r.status===409||r.status===400){pending.current=null;setError(t('No se pudo completar. Actualice y revise la factura.','Could not complete. Refresh and review the invoice.'));await load();return;}
   if(!r.ok)throw Error();invoiceLifecycleSchema.parse(await r.json());pending.current=null;setNotice(input.action==='send'?t('La factura ya la ve su cliente en el proyecto.','The customer can now see the invoice in the project.'):t('La factura se retiró de la vista del cliente.','The invoice was removed from the customer view.'));await load();}
  catch{setUncertain(true);setError(t('No se pudo confirmar. Reintente: se envía la misma solicitud y nunca se aplica dos veces.','Could not confirm. Retry: the same request is sent again and is never applied twice.'));}finally{setBusy(false);}}
 if(!data)return failed?<p role="alert" data-invoice-delivery-error className="text-sm text-red-700">{t('No se pudo cargar el estado de la factura.','Could not load the invoice status.')} <button type="button" className="font-semibold underline" onClick={()=>void load()}>{t('Reintentar','Retry')}</button></p>:null;
 const money=(c:number)=>proMoney(c/100,en);
 return <div data-invoice-delivery={data.status} className="min-w-0 space-y-2 rounded-xl border border-[#e5ebf1] bg-[#f9fbfd] p-3 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[#162543]">{t('Envío al cliente','Delivery to the customer')}</span><span data-invoice-status={data.status} className={`rounded-full px-3 py-1 text-xs font-semibold ${tone[data.status]}`}>{labels[data.status]}</span></div>
  <p className="text-xs text-[#52627a]">{t('Vence el ','Due ')}{day(data.dueDate)} · {t('Saldo ','Balance ')}{money(data.balanceCents)}{data.daysOverdue>0?' · '+t(`${data.daysOverdue} días de atraso`,`${data.daysOverdue} days overdue`):''}</p>
  {data.hasWork?<div className="flex flex-wrap items-center gap-2">
   {!data.delivered&&<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#009FD9]" checked={email} disabled={!data.recipientEmail||busy} onChange={e=>setEmail(e.target.checked)}/>{data.recipientEmail?t('Avisar por correo (modo de prueba, no se envía)','Notify by e-mail (test mode, not sent)'):t('El cliente no tiene correo guardado','The customer has no saved e-mail')}</label>}
   <Button type="button" data-invoice-delivery-send disabled={blocked||busy||data.status==='void'||data.totalCents<=0} onClick={()=>void run({action:'send',actionId:crypto.randomUUID(),draftId:id,email:email&&!data.delivered})}>{data.delivered?t('Enviar de nuevo','Send again'):t('Enviar al cliente','Send to the customer')}</Button>
   {data.delivered&&<Button type="button" variant="secondary" data-invoice-delivery-recall disabled={blocked||busy} onClick={()=>void run({action:'recall',actionId:crypto.randomUUID(),draftId:id})}>{t('Retirar de la vista del cliente','Remove from the customer view')}</Button>}</div>
   :<p className="text-xs text-[#52627a]">{t('Solo las facturas de un trabajo se pueden mostrar al cliente.','Only invoices of a job can be shown to the customer.')}</p>}
  {uncertain&&<Button type="button" size="sm" variant="secondary" disabled={busy} onClick={()=>{if(pending.current)void run(pending.current);}}>{t('Reintentar','Retry')}</Button>}
  {notice&&<p role="status" data-invoice-delivery-notice className="rounded-lg bg-[#eef8f4] p-2 text-[#18573a]">{notice}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
  {data.events.length>0&&<details className="rounded-lg border border-[#e5ebf1] p-2"><summary className="cursor-pointer font-semibold">{t('Historial','History')}</summary><ul data-invoice-delivery-events className="mt-2 space-y-1 text-xs text-[#52627a]">{data.events.map((e,n)=><li key={n} className="flex flex-wrap justify-between gap-2"><span>{events[e.action]}</span><span>{when(e.at)}</span></li>)}</ul></details>}
 </div>;
}

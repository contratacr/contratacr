'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {privateEstimateContextSchema} from '@/lib/pro/private-estimates';
import {leadQuickQuoteContextSchema,quickQuoteLineParam,type LeadQuickQuoteContext} from '@/lib/pro/lead-quick-quote';
import {currentProPath,navigatePro} from '@/lib/pro/navigation';

/**
 * Ronda F2-B (row 35): one-click "Cotizar" from a lead (list row, request detail, board card). It opens the existing
 * private-estimate editor with the lead's customer and source already chosen and, when the professional's catalogue has
 * a close match for the service, a first line with that item and its own catalogue price. Nothing is saved until the
 * professional saves the draft with the existing writer.
 */
const COPY={
 es:{quote:'Cotizar',preparing:'Preparando…',aria:(s:string)=>`Cotizar "${s}"`,failed:'No se pudo preparar la cotización. Actualice la solicitud y reintente.',
  archived:'Restaure la solicitud para cotizarla.',no_client:'Para cotizar, primero confirme la cita o agregue al cliente en Clientes.',client_archived:'El cliente está archivado. Restáurelo en Clientes para cotizar.'},
 en:{quote:'Quote',preparing:'Preparing…',aria:(s:string)=>`Quote "${s}"`,failed:'Could not prepare the quote. Refresh the lead and try again.',
  archived:'Restore the lead to quote it.',no_client:'To quote, first confirm the appointment or add the customer in Customers.',client_archived:'The customer is archived. Restore it in Customers to quote.'},
} as const;
type Blocked=NonNullable<LeadQuickQuoteContext['blocked']>;

export function LeadQuickQuoteButton({actor,kind,id,service,disabled=false,size='sm',className=''}:{actor:string;kind:'manual'|'request';id:string;service:string;disabled?:boolean;size?:'sm'|'md';className?:string}){
 const c=COPY[useLocale()==='en'?'en':'es'],[busy,setBusy]=useState(false),[problem,setProblem]=useState<Blocked|'failed'|null>(null),mutex=useRef(false),current=useRef({actor,kind,id,active:true});
 useEffect(()=>{current.current={actor,kind,id,active:true};return()=>{current.current.active=false;};},[actor,kind,id]);
 const valid=()=>current.current.active&&current.current.actor===actor&&current.current.kind===kind&&current.current.id===id;
 async function quote(){
  if(disabled||mutex.current||!valid())return;mutex.current=true;setBusy(true);setProblem(null);const origin=currentProPath();
  try{
   const r=await fetch('/api/pro/lead-quick-quote?'+new URLSearchParams({kind,id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();
   const lead=leadQuickQuoteContextSchema.parse(await r.json());if(!valid())return;if(lead.kind!==kind||lead.id!==id)throw Error();
   if(lead.blocked||!lead.clientId){setProblem(lead.blocked??'no_client');return;}
   // Same validation as the existing "Prepare quote" flows: the editor's context must agree with the lead.
   const params:Record<string,string>={view:'context',...lead.source?.kind==='manual'?{sourceKind:'manual',sourceId:lead.source.id}:lead.source?.kind==='work'?{clientId:lead.clientId,sourceKind:'work',sourceId:lead.source.id}:{clientId:lead.clientId}};
   const response=await fetch('/api/pro/private-estimates?'+new URLSearchParams(params),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();
   const context=privateEstimateContextSchema.parse(await response.json());if(!valid())return;
   if(context.client.id!==lead.clientId)throw Error();
   const estimateId=crypto.randomUUID(),line:Record<string,string>=lead.match?{lineaCatalogo:quickQuoteLineParam(estimateId,lead.match.productId)}:{};
   if(lead.source?.kind==='manual'){if(context.source?.kind!=='manual'||context.source.id!==lead.source.id)throw Error();
    navigatePro('quotes',{nuevaEstimacion:estimateId,cotizacionCliente:context.client.id,origenEstimacion:'manual',idOrigenEstimacion:lead.source.id,revisionOrigenEstimacion:String(context.source.revision),volverEstimacion:origin,...line});}
   else if(lead.source?.kind==='work'){if(context.source?.kind!=='work'||context.source.id!==lead.source.id)throw Error();
    navigatePro('quotes',{nuevaEstimacion:estimateId,cotizacionCliente:context.client.id,origenEstimacion:'work',idOrigenEstimacion:context.source.id,huellaOrigenEstimacion:context.source.fingerprint,volverEstimacion:origin,...line});}
   else navigatePro('quotes',{nuevaEstimacion:estimateId,cotizacionCliente:context.client.id,volverEstimacion:origin,...line});
  }catch{if(valid())setProblem('failed');}finally{mutex.current=false;if(valid())setBusy(false);}
 }
 return <span className={'inline-flex min-w-0 flex-col items-start gap-1 '+className}>
  <Button type="button" size={size} variant="secondary" data-pro-write="sales.write" data-lead-quick-quote={id} disabled={disabled||busy} aria-label={service?c.aria(service):undefined} onClick={()=>void quote()}>{busy?c.preparing:c.quote}</Button>
  {problem&&<span role="alert" data-lead-quick-quote-problem={problem} className="max-w-[16rem] text-xs text-red-700">{c[problem]}</span>}
 </span>;
}

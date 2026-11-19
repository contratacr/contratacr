'use client';
import { useLocale } from 'next-intl';
import type { ProQuoteRow } from '@/lib/pro/panel-queries';
import { PagedSelect } from './paged-select';
export function AppointmentQuoteSelect({clientId,value,onChange,onRows}:{clientId:string;value:string;onChange:(row:ProQuoteRow|undefined)=>void;onRows:(rows:ProQuoteRow[])=>void}){
 const en=useLocale()==='en';
 if(!clientId)return <label className="block text-[13px] font-bold">{en?'Accepted quote (optional)':'Cotización aceptada (opcional)'}<select aria-label={en?'Accepted quote (optional)':'Cotización aceptada (opcional)'} disabled value="" className="mt-1 min-h-11 w-full rounded-xl border px-3"><option>{en?'No quote':'Sin cotización'}</option></select></label>;
 return <PagedSelect<ProQuoteRow> key={clientId} value={value} url={'/api/pro/quotes?'+new URLSearchParams({clientId,status:'accepted'})} label={en?'Accepted quote (optional)':'Cotización aceptada (opcional)'} placeholder={en?'No quote':'Sin cotización'} disabled={!clientId} searchLabel={en?'Search accepted quotes':'Buscar cotizaciones aceptadas'} moreLabel={en?'Show more quotes':'Ver más cotizaciones'} optionLabel={r=>r.title} onChange={onChange} onRows={onRows}
 detailUrl={id=>'/api/pro/quotes?'+new URLSearchParams({id:id.replace(/^quote:/,''),...(id.startsWith('quote:')?{}:{legacy:'1'})})}
 parse={body=>{const b=body as {items?:ProQuoteRow[];quote?:{id:string;title:string;status:string};link?:{clientId:string};document?:{quotes:{id:string;title:string;clientId:string;status:string}[]}};const q=b.quote??b.document?.quotes[0];const items=b.items??(q?[{...q,client:'',clientId:b.quote?b.link?.clientId:('clientId' in q?q.clientId:null),total:0,at:'',legacy:!b.quote,key:q.id}]:[]);return items.filter(r=>r.status==='accepted'&&r.clientId===clientId).map(r=>({...r,id:r.legacy?r.id:'quote:'+r.id})) as ProQuoteRow[];}}/>;
}

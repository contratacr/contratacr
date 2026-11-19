'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {PanelListSkeleton} from '@/components/ui/content-loading';
import {businessSchema,type Business} from '@/lib/pro/business';
import {proMoney} from '@/lib/pro/money';

const messages={
 es:{heading:'Historial de citas y cotizaciones',empty:'Todavía no hay citas ni cotizaciones.',more:'Ver más historial',retry:'Reintentar',failed:'No se pudo cargar el historial.',changed:'El historial cambió. Actualice para ver los registros más recientes.',refresh:'Actualizar historial',detailFailed:'No se pudo cargar la cita.',close:'Cerrar',quote:'Cotización',work:'Cita',job:'Trabajo',jobNew:'Nuevo',unscheduled:'Sin programar',dateLocale:'es-CR',status:{new:'Nueva',quoting:'En cotización',scheduled:'Agendada',completed:'Finalizada',cancelled:'Cancelada',draft:'Borrador',sent:'Enviada',accepted:'Aceptada',declined:'Rechazada',withdrawn:'Retirada'}},
 en:{heading:'Appointment and quote history',empty:'No appointments or quotes yet.',more:'Show more history',retry:'Retry',failed:'Could not load history.',changed:'History changed. Refresh to see the latest records.',refresh:'Refresh history',detailFailed:'Could not load the appointment.',close:'Close',quote:'Quote',work:'Appointment',job:'Job',jobNew:'New',unscheduled:'Not scheduled',dateLocale:'en-US',status:{new:'New',quoting:'Quoting',scheduled:'Scheduled',completed:'Completed',cancelled:'Cancelled',draft:'Draft',sent:'Sent',accepted:'Accepted',declined:'Declined',withdrawn:'Withdrawn'}},
};
type HistoryRow={id:string;key:string;kind:'work'|'quote';title:string;status:string;at:string;total:number|null;legacy:boolean;start:string|null;end:string|null};
export function ClientHistory({clientId,onQuote,onWork}:{clientId:string;onQuote:(id:string,legacy:boolean)=>void;onWork?:(id:string)=>void}){
 const locale=useLocale(),copy=messages[locale as keyof typeof messages]??messages.es;
 const [rows,setRows]=useState<HistoryRow[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[changed,setChanged]=useState(false);
 const [appointment,setAppointment]=useState<Business['work'][number]|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(false);
 const sequence=useRef(0),detailSequence=useRef(0),busy=useRef(false),revision=useRef<number|null>(null);
 const load=useCallback(async(after='')=>{
  if(after&&busy.current)return;
  const request=++sequence.current;busy.current=true;setLoading(true);setError(false);
  try{
   const response=await fetch('/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:clientId,history:'1',after}),{cache:'no-store'}),body=await response.json();
   if(!response.ok)throw Error();if(request!==sequence.current)return;
   if(after&&revision.current!==body.revision){setChanged(true);return;}
   if(!after){revision.current=body.revision;setChanged(false);}
   setRows(previous=>after?[...previous,...body.items.filter((row:HistoryRow)=>!previous.some(old=>old.key===row.key))]:body.items);
   setCursor(body.nextCursor);
  }catch{if(request===sequence.current)setError(true);}
  finally{if(request===sequence.current){busy.current=false;setLoading(false);}}
 },[clientId]);
 const cancel=useCallback(()=>{sequence.current++;detailSequence.current++;busy.current=false;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);cancel();};},[load,cancel]);
 async function open(row:HistoryRow){
  if(row.kind==='quote'){onQuote(row.id,row.legacy);return;}
  if(onWork){onWork(row.id);return;}
  const request=++detailSequence.current;setAppointment(null);setDetailError(false);setDetailLoading(true);
  try{const response=await fetch('/api/pro/agenda?'+new URLSearchParams({id:row.id}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error();const work=businessSchema.shape.work.element.parse(body.work);if(request===detailSequence.current)setAppointment(work);}
  catch{if(request===detailSequence.current)setDetailError(true);}
  finally{if(request===detailSequence.current)setDetailLoading(false);}
 }
 const date=(value:string)=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toLocaleString(copy.dateLocale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}):'';};
 const status=(value:string)=>copy.status[value as keyof typeof copy.status]??value;
 const undated=(row:Pick<HistoryRow,'kind'|'start'|'end'>)=>row.kind==='work'&&!row.start&&!row.end;
 return <section className="space-y-3" aria-label={copy.heading} data-client-history="">
  <h3 className="font-bold">{copy.heading}</h3>
  {loading&&!rows.length?<PanelListSkeleton rows={3} compacto/>:!error&&!rows.length?<p className="text-sm text-[#68778d]">{copy.empty}</p>:null}
  {rows.map(row=><button key={row.key} data-client-work={row.kind==='work'?row.id:undefined} type="button" disabled={loading||changed||error} className="block w-full disabled:opacity-60 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#162543]" onClick={()=>void open(row)}>
   <span className="block font-semibold break-words">{row.title}</span><span className="block text-sm text-[#52627a]">{row.kind==='quote'?copy.quote:undated(row)?copy.job:copy.work} · {undated(row)&&row.status==='new'?copy.jobNew:status(row.status)}{row.total!==null?' · '+proMoney(row.total):''}</span>{undated(row)?<span className="block text-xs text-[#68778d]">{copy.unscheduled}</span>:row.at&&<span className="block text-xs text-[#68778d]">{date(row.at)}</span>}
  </button>)}
  {error&&<p role="alert" className="text-sm text-red-700">{copy.failed}</p>}
  {changed&&<p role="status" className="text-sm text-[#52627a]">{copy.changed}</p>}
  {changed?<Button variant="secondary" disabled={loading} onClick={()=>void load()}>{copy.refresh}</Button>:error?<Button variant="secondary" disabled={loading} onClick={()=>void load(rows.length?cursor??'':'')}>{copy.retry}</Button>:cursor?<Button variant="secondary" disabled={loading} onClick={()=>void load(cursor)}>{copy.more}</Button>:null}
  {(appointment||detailLoading||detailError)&&<Modal title={appointment?.service??copy.work} ariaLabel={appointment?.service??copy.work} onClose={()=>{detailSequence.current++;setAppointment(null);setDetailLoading(false);setDetailError(false);}} closeLabel={copy.close} mobilePresentation="fullscreen">
   {detailLoading?<PanelListSkeleton rows={2} compacto/>:detailError?<p role="alert">{copy.detailFailed}</p>:appointment?<div className="space-y-3"><p>{appointment.client}</p><p>{!appointment.start&&!appointment.end&&!appointment.cancelled&&appointment.stage==='new'?copy.jobNew:status(appointment.cancelled?'cancelled':appointment.stage)}</p><p>{!appointment.start&&!appointment.end?copy.unscheduled:<>{date(appointment.start)} – {date(appointment.end)}</>}</p></div>:null}
  </Modal>}
 </section>;
}

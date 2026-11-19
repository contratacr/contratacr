'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Plus,CalendarDays} from 'lucide-react';
import {ProRecordCard} from './record-card';
import {Button} from '@/components/ui/button';
import {replaceProParams,pushProParams,closeProStep} from '@/lib/pro/navigation';
import {useProSearchParams} from './use-pro-search-params';
import {AppointmentRequestDetail} from './appointment-requests-workspace';
import {appointmentDate} from './appointment-copy';
type Row={id:string;source:'request'|'manual';client:string;service:string;start:string|null;status:string;detail_status:string};
type Page={items:Row[];nextCursor:string|null};
export function AppointmentInbox({ready}:{ready:boolean}){
 const en=useLocale()==='en',locale=en?'en':'es',tr=(es:string,english:string)=>en?english:es,params=useProSearchParams();
 const labels:Record<string,string>={pending:tr('Pendientes','Pending'),confirmed:tr('Confirmadas','Confirmed'),completed:tr('Finalizadas','Completed'),cancelled:tr('Canceladas','Cancelled'),all:tr('Todas','All')};
 const legacy=params.get('estadoCitaSolicitud'),raw=params.get('estadoCitas')||(legacy==='requested'||legacy==='proposed'?'pending':legacy==='declined'?'cancelled':legacy),status=raw&&labels[raw]?raw:'pending';
 const [page,setPage]=useState<(Page&{status:string})|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),sequence=useRef(0),lock=useRef(false);
 const load=useCallback(async(after='')=>{if(after&&lock.current)return;const seq=++sequence.current;lock.current=true;setLoading(true);setError(false);try{
 const response=await fetch('/api/pro/appointment-list?'+new URLSearchParams({status,...(after?{after}:{})}),{cache:'no-store'}),body:Page=await response.json();if(!response.ok||!Array.isArray(body.items))throw Error();
 if(seq===sequence.current)setPage(old=>({...body,status,items:after&&old?.status===status?[...old.items,...body.items.filter(row=>!old.items.some(v=>v.id===row.id&&v.source===row.source))]:body.items}));
 }catch{if(seq===sequence.current)setError(true);}finally{if(seq===sequence.current){setLoading(false);lock.current=false;}}},[status]);
 const invalidate=useCallback(()=>{sequence.current++;lock.current=false;},[]);
 useEffect(()=>{if(!ready)return;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[ready,load,invalidate]);
 useEffect(()=>{const refresh=()=>void load();window.addEventListener('contratacr:appointments-changed',refresh);return()=>window.removeEventListener('contratacr:appointments-changed',refresh);},[load]);
 const id=params.get('citaSolicitud'),current=page?.status===status?page:null;
 return <section data-appointment-inbox className="space-y-4">
 <Button size="crear" className="w-full" disabled={!ready} onClick={()=>pushProParams({nueva:'1',cita:null,citaSolicitud:null})}><Plus aria-hidden="true" className="h-4 w-4"/>{tr('Nueva cita','New appointment')}</Button>
 <label className="block text-[13px] font-bold text-[#162543]">{tr('Mostrar citas','Show appointments')}<select aria-label={tr('Mostrar citas','Show appointments')} value={status} onChange={event=>replaceProParams({estadoCitas:event.target.value,estadoCitaSolicitud:null})} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px]">{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 {error&&<div role="alert"><p>{tr('No se pudieron cargar las citas.','Could not load appointments.')}</p><Button variant="secondary" onClick={()=>void load()}>{tr('Reintentar','Retry')}</Button></div>}
 {!current&&!error?<p role="status">{tr('Cargando citas…','Loading appointments…')}</p>:current&&<><div className="space-y-3">{current.items.map(row=><ProRecordCard key={row.source+row.id} icon={CalendarDays} title={row.service} subtitle={row.client}
 meta={<>{appointmentDate(row.start,locale)||tr('Horario por acordar','Time to be agreed')} · {row.detail_status==='proposed'?tr('Horario propuesto','Time proposed'):labels[row.status]}<span className="mt-1 block">{row.source==='manual'?tr('Agregada por usted','Added by you'):tr('Solicitud del cliente','Customer request')}</span></>}
 disabled={loading||error} onOpen={()=>pushProParams(row.source==='request'?{citaSolicitud:row.id,cita:null}:{cita:row.id,citaSolicitud:null})} openLabel={tr('Ver cita','View appointment')}
 />)}</div>{!current.items.length&&!error&&<p>{tr('No hay citas en esta vista.','No appointments in this view.')}</p>}{current.nextCursor&&<Button variant="secondary" disabled={loading||error} onClick={()=>void load(current.nextCursor!)}>{tr('Ver más','Show more')}</Button>}</>}
 {id&&<AppointmentRequestDetail key={id} id={id} side="provider" onChanged={()=>void load()} onClose={()=>closeProStep('citaSolicitud')}/>}
 </section>;
}

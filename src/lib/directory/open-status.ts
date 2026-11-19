/**
 * Yelp-model header line (2026-11-19): «Abierto ahora · cierra a las 19:30» / «Cerrado · abre mañana a las 07:30».
 * Pure: hours are the dir_place_hours rows (weekday 0 = Sunday, HH:MM, a slot may close after midnight when
 * closes <= opens; 00:00–24:00/23:59 = 24 hours). `now` is read in America/Costa_Rica (UTC-6, no DST).
 * Returns null when there are no hours (nothing is invented).
 */
export type PlaceHour={weekday:number;opens:string;closes:string};
export type OpenStatus=
 |{state:'open24'}
 |{state:'open';closes:string|null}
 |{state:'closed';opens:{time:string;day:'today'|'tomorrow'|number}|null};

const minutes=(hhmm:string)=>{const [h,m]=hhmm.split(':').map(Number);return (h??0)*60+(m??0);};
const isAllDay=(h:PlaceHour)=>h.opens==='00:00'&&(h.closes==='24:00'||h.closes==='23:59');

/** Costa Rica weekday (0 = Sunday) and minutes since midnight. */
export function crClock(now=new Date()){
 const cr=new Date(now.getTime()-6*3600_000);
 return {weekday:cr.getUTCDay(),minute:cr.getUTCHours()*60+cr.getUTCMinutes()};
}

export function openStatus(hours:PlaceHour[],now=new Date()):OpenStatus|null{
 if(!hours.length)return null;
 if([0,1,2,3,4,5,6].every(d=>hours.some(h=>h.weekday===d&&isAllDay(h))))return {state:'open24'};
 const {weekday,minute}=crClock(now);
 // Open intervals in minutes from the start of today's weekday, covering yesterday's overnight slots too.
 const intervals:{from:number;to:number}[]=[];
 for(const h of hours){
  const o=minutes(h.opens),cRaw=h.closes==='24:00'?1440:minutes(h.closes),c=cRaw<=o?cRaw+1440:cRaw;
  for(const shift of [-1,0,1,2,3,4,5,6,7]){
   if(((weekday+shift)%7+7)%7!==h.weekday)continue;
   intervals.push({from:shift*1440+o,to:shift*1440+c});
  }
 }
 intervals.sort((a,b)=>a.from-b.from);
 const current=intervals.find(i=>i.from<=minute&&minute<i.to);
 if(current){
  // Merge contiguous slots (e.g. 00:00–24:00 followed by 00:00–… the next day).
  let end=current.to;for(const i of intervals)if(i.from<=end&&i.to>end)end=i.to;
  return {state:'open',closes:end-minute>=1440?null:fmt(end)};
 }
 const next=intervals.find(i=>i.from>minute);
 if(!next)return {state:'closed',opens:null};
 const dayOffset=Math.floor(next.from/1440);
 return {state:'closed',opens:{time:fmt(next.from),day:dayOffset===0?'today':dayOffset===1?'tomorrow':(weekday+dayOffset)%7}};
}
const fmt=(m:number)=>{const x=((m%1440)+1440)%1440;return `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`;};

/** Short text for headers and cards; `days` = localized weekday names (0 = Sunday). */
export function openStatusText(s:OpenStatus,en:boolean,days:readonly string[]):{label:string;detail:string|null;open:boolean}{
 const t=(es:string,english:string)=>en?english:es;
 if(s.state==='open24')return {label:t('Abierto 24 horas','Open 24 hours'),detail:null,open:true};
 if(s.state==='open')return {label:t('Abierto ahora','Open now'),detail:s.closes?t(`cierra a las ${s.closes}`,`closes at ${s.closes}`):null,open:true};
 if(!s.opens)return {label:t('Cerrado','Closed'),detail:null,open:false};
 const when=s.opens.day==='today'?t(`abre hoy a las ${s.opens.time}`,`opens today at ${s.opens.time}`)
  :s.opens.day==='tomorrow'?t(`abre mañana a las ${s.opens.time}`,`opens tomorrow at ${s.opens.time}`)
  :t(`abre el ${days[s.opens.day]!.toLowerCase()} a las ${s.opens.time}`,`opens ${days[s.opens.day]} at ${s.opens.time}`);
 return {label:t('Cerrado','Closed'),detail:when,open:false};
}

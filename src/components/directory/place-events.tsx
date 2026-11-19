import type {PlaceEvent} from '@/lib/directory/place-features';

// LOCAL PRO ONLY (place features round, 2026-11-17): upcoming events of a place (place page) and the event card shared with
// /eventos. Dates in Costa Rica time; price is free text from the business (never a payment); order = start time.
export function eventWhen(e:Pick<PlaceEvent,'startsAt'|'endsAt'>,en:boolean){
 const f=(iso:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',...o}).format(new Date(iso));
 const start=f(e.startsAt,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
 if(!e.endsAt)return start;
 const sameDay=f(e.startsAt,{dateStyle:'short'})===f(e.endsAt,{dateStyle:'short'});
 return `${start} – ${sameDay?f(e.endsAt,{hour:'numeric',minute:'2-digit'}):f(e.endsAt,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}`;
}
export function EventCard({event,en,place}:{event:PlaceEvent;en:boolean;place?:{slug:string;name:string;area:string}}){
 const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
 return <article data-event={event.id} className="space-y-1 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-[#162543]">
  <p className="text-sm font-semibold text-[#0b4f6c]"><time dateTime={event.startsAt}>{eventWhen(event,en)}</time></p>
  <h3 className="break-words text-lg font-bold">{event.title}</h3>
  {place&&<p className="text-sm"><a className={`font-semibold underline underline-offset-2 ${ring}`} href={`${en?'/en':''}/lugar/${place.slug}`}>{place.name}</a>{place.area?` · ${place.area}`:''}</p>}
  {event.priceText&&<p className="text-sm" data-event-price>{event.priceText}</p>}
  {event.description&&<p className="whitespace-pre-line text-sm text-slate-700">{event.description}</p>}
 </article>;
}
export function PlaceEvents({events,locale}:{events:PlaceEvent[];locale:string}){
 const en=locale==='en';
 if(!events.length)return null;
 return <section aria-labelledby="place-events" data-place-events={events.length} className="space-y-3">
  <h2 id="place-events" className="text-lg font-bold">{en?'Upcoming events':'Próximos eventos'}</h2>
  <ul className="grid gap-3 sm:grid-cols-2">{events.slice(0,6).map(e=><li key={e.id}><EventCard event={e} en={en}/></li>)}</ul>
  <p className="text-sm"><a className="underline underline-offset-2" href={en?'/en/eventos':'/eventos'}>{en?'See all events':'Ver todos los eventos'}</a></p>
 </section>;
}

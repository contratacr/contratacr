import { MapPin, Navigation } from 'lucide-react';
import { publicWorkplaces, directionsUrl, type PublicWorkplace } from '@/lib/public-workplaces';
export function WorkplaceDirections({ places, english = false }: { places?: PublicWorkplace[]; english?: boolean }) {
  const locations = publicWorkplaces(places);
  if (!locations.length) return null;
  return <section className="border-t border-[#eef2f6] pt-5" data-workplace-directions>
    <h3 className="mb-3 text-base font-semibold text-[#162543]">{english ? 'In-person locations' : 'Dónde atiende presencialmente'}</h3>
    <div className="space-y-3">{locations.map(w => <div key={`${w.lat},${w.lng}`} className="rounded-xl border border-[#dce5ee] p-4">
      <div className="flex items-start gap-3"><MapPin size={20} className="mt-0.5 shrink-0 text-[#009FD9]"/><div className="min-w-0"><p className="break-words text-sm font-semibold text-[#162543]">{w.name || (english ? 'In-person location' : 'Lugar presencial')}</p>{w.address && <p className="mt-1 break-words text-sm leading-6 text-[#52627a]">{w.address}</p>}</div></div>
      <a href={directionsUrl(w)!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#c9e7f2] px-4 text-sm font-semibold text-[#0089bb]"><Navigation size={16}/>{english ? 'Get directions' : 'Cómo llegar'}</a>
    </div>)}</div>
  </section>;
}

/** The frequent action stays with contact controls; multiple destinations are disclosed on demand. */
export function WorkplaceDirectionsAction({ places, english = false }: { places?: PublicWorkplace[]; english?: boolean }) {
  const locations = publicWorkplaces(places);
  if (!locations.length) return null;
  const label = english ? 'Get directions' : 'Cómo llegar';
  const actionClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#c9e7f2] bg-[#f1faff] px-4 py-2.5 text-sm font-semibold text-[#0089bb]';
  if (locations.length === 1) return <a data-directions-action href={directionsUrl(locations[0])!} target="_blank" rel="noopener noreferrer" className={actionClass}><Navigation size={18}/>{label}</a>;
  return <details className="group mt-1" data-directions-action>
    <summary className={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><Navigation size={18}/>{label}<span className="text-xs font-normal">· {locations.length} {english ? 'locations' : 'sedes'}</span></summary>
    <div className="mt-2 divide-y divide-[#dce5ee] rounded-xl border border-[#dce5ee] bg-white px-3">{locations.map(w => <a key={`${w.lat},${w.lng}`} href={directionsUrl(w)!} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-start gap-2 py-3 text-sm text-[#162543]"><MapPin size={18} className="mt-0.5 shrink-0 text-[#009FD9]"/><span className="min-w-0 break-words"><span className="font-semibold">{w.name || label}</span>{w.address && <span className="mt-0.5 block text-xs leading-5 text-[#68778d]">{w.address}</span>}</span></a>)}</div>
  </details>;
}

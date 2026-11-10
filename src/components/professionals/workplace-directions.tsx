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

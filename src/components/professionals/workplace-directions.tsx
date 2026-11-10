import { Navigation, Map } from 'lucide-react';
import { publicWorkplaces, directionsUrl, wazeUrl, type PublicWorkplace } from '@/lib/public-workplaces';
/** Compact navigation controls share the social row; each provider keeps its own destination chooser. */
export function WorkplaceDirections({ places, english = false }: { places?: PublicWorkplace[]; english?: boolean }) {
  const locations = publicWorkplaces(places);
  if (!locations.length) return null;
  const style = 'grid h-11 w-11 place-items-center rounded-full border border-[#e5e7eb] text-[#52627a] transition-colors hover:border-[#009FD9] hover:text-[#009FD9]';
  return <>{([{ name: 'Google Maps', Icon: Map, url: directionsUrl }, { name: 'Waze', Icon: Navigation, url: wazeUrl }]).map(({name, Icon, url}) => locations.length === 1 ? (
    <a key={name} data-directions-provider={name} href={url(locations[0])!} target="_blank" rel="noopener noreferrer" aria-label={`${name}: ${locations[0].name || (english ? 'Get directions' : 'Cómo llegar')}`} title={name} className={style}><Icon className="h-4 w-4"/></a>
  ) : (
    <details key={name} className="group relative" data-directions-provider={name}>
      <summary aria-label={name} title={name} className={`${style} mx-auto cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><Icon className="h-4 w-4"/></summary>
      <div className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-4rem)] shadow-lg divide-y divide-[#eef2f6] rounded-xl border border-[#e5e7eb] bg-white px-3 text-left">{locations.map(w => <a key={`${w.lat},${w.lng}`} href={url(w)!} target="_blank" rel="noopener noreferrer" className="block min-h-11 py-3 text-sm text-[#162543]"><span className="font-semibold">{w.name || name}</span>{w.address && <span className="mt-1 block break-words text-xs text-[#68778d]">{w.address}</span>}</a>)}</div>
    </details>
  ))}</>;
}

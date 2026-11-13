import type { CSSProperties } from 'react';
import { publicWorkplaces, directionsUrl, wazeUrl, type PublicWorkplace } from '@/lib/public-workplaces';
/**
 * Compact navigation controls share the social row; each provider keeps its own destination chooser.
 * IGUALES A LAS REDES: el mismo círculo de 36 px, el mismo ícono de 16 px y
 * el mismo gris que se vuelve celeste al pasar encima. La forma es la original
 * de cada marca (el pin de Google Maps y el Wazer), usada como máscara para que
 * tome el color del texto en vez de sus colores propios.
 */
const SOCIAL = 'grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb] text-[#52627a] transition-colors hover:border-[#009FD9] hover:text-[#009FD9]';
function BrandGlyph({ src }: { src: string }) {
  const mask: CSSProperties = { WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' };
  return <span aria-hidden="true" data-brand-glyph={src} className="block h-4 w-4 bg-current" style={mask} />;
}
export function WorkplaceDirections({ places, english = false }: { places?: PublicWorkplace[]; english?: boolean }) {
  const locations = publicWorkplaces(places);
  if (!locations.length) return null;
  const providers = [
    { name: 'Google Maps', url: directionsUrl, image: '/brand/maps/google-maps.png' },
    { name: 'Waze', url: wazeUrl, image: '/brand/waze/waze-glyph.png' },
  ];
  return <>{providers.map(({name, url, image}) => locations.length === 1 ? (
    <a key={name} data-directions-provider={name} href={url(locations[0])!} target="_blank" rel="noopener noreferrer" aria-label={`${name}: ${locations[0].name || (english ? 'Get directions' : 'Cómo llegar')}`} title={name} className={SOCIAL}><BrandGlyph src={image} /></a>
  ) : (
    <details key={name} className="group relative" data-directions-provider={name}>
      <summary aria-label={name} title={name} className={`${SOCIAL} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><BrandGlyph src={image} /></summary>
      <div className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-4rem)] shadow-lg divide-y divide-[#eef2f6] rounded-xl border border-[#e5e7eb] bg-white px-3 text-left">{locations.map(w => <a key={`${w.lat},${w.lng}`} href={url(w)!} target="_blank" rel="noopener noreferrer" className="block min-h-11 py-3 text-sm text-[#162543]"><span className="font-semibold">{w.name || name}</span>{w.address && <span className="mt-1 block break-words text-xs text-[#68778d]">{w.address}</span>}</a>)}</div>
    </details>
  ))}</>;
}

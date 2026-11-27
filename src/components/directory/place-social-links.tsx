import {Globe} from 'lucide-react';
import {cn} from '@/lib/utils';
import {FacebookIcon,InstagramIcon,LinkedInIcon,TikTokIcon,XIcon,YouTubeIcon} from '@/components/icons/social-icons';
import {BrandGlyph,SOCIAL} from '@/components/professionals/workplace-directions';
import type {PlaceSocialLink,PlaceSocialNetwork} from '@/lib/directory/place-social';

export const SOCIAL_ICONS:Record<PlaceSocialNetwork,(p:{className?:string})=>React.JSX.Element>={facebook:FacebookIcon,instagram:InstagramIcon,tiktok:TikTokIcon,x:XIcon,youtube:YouTubeIcon,linkedin:LinkedInIcon};
const RING='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';

/**
 * The place's icon row (owner 2026-11-27: «arriba en lugar de poner waze y maps poner los iconos de redes sociales e
 * incluir el de waze y maps»), in the production professional profile's order: website (a real, non-social one), social
 * links, Google Maps, Waze; centred, icon-only links with the professional
 * profile's exact style (workplace-directions.tsx SOCIAL: 36 px round outlined button, 16 px grey glyph that turns brand
 * blue on hover; the Waze and Maps shapes are the same masked brand glyphs). Social links come only from place-social.ts
 * (validated https links of the network itself); everything opens in a new tab without referrer.
 */
export function PlaceSocialLinks({links,placeName,en,className,directions,website}:{links:PlaceSocialLink[];placeName:string;en:boolean;className?:string;directions?:{waze:string;google:string}|null;website?:string|null}){
 if(!links.length&&!directions&&!website)return null;
 return <div data-place-social role="group" aria-label={en?'Social media and maps':'Redes sociales y mapas'} className={cn('flex flex-wrap items-center gap-2',className)}>
  {website&&<a href={website} target="_blank" rel="noopener noreferrer nofollow" data-place-action="website" aria-label={en?`Website of ${placeName}`:`Sitio web de ${placeName}`} title={en?'Website':'Sitio web'} className={cn(SOCIAL,RING)}><Globe aria-hidden="true" className="h-4 w-4"/></a>}
  {links.map(({network,url,label})=>{const Icon=SOCIAL_ICONS[network];
   return <a key={network} href={url} target="_blank" rel="noopener noreferrer" data-place-social-link={network}
    aria-label={en?`${label} of ${placeName}`:`${label} de ${placeName}`} title={label} className={cn(SOCIAL,RING)}>
    <Icon className="h-4 w-4"/></a>;})}
  {directions&&<>
   <a href={directions.google} target="_blank" rel="noopener noreferrer" data-place-action="maps" aria-label={en?'Open in Google Maps':'Abrir en Google Maps'} title="Google Maps" className={cn(SOCIAL,RING)}><BrandGlyph src="/brand/maps/google-maps.png"/></a>
   <a href={directions.waze} target="_blank" rel="noopener noreferrer" data-place-action="waze" aria-label={en?'Open in Waze':'Abrir en Waze'} title="Waze" className={cn(SOCIAL,RING)}><BrandGlyph src="/brand/waze/waze-glyph.png"/></a>
  </>}
 </div>;
}

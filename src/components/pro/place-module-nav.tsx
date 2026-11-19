import {proDirectoryItems,type ProPlaceHub} from '@/lib/pro/hub-sections';

/**
 * LOCAL PRO ONLY (pending fixes round, 2026-11-17): navigation between the directory modules of a claimed place
 * (/dashboard/pro/menu, /reservas-mesa, /lugar) and back to the Pro space. Same entries and labels as the Pro hub
 * group «Mi negocio en el directorio» (proDirectoryItems); only the modules this account has are listed.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function PlaceModuleNav({locale,current,hub}:{locale:string;current:'menu'|'table_reservations'|'place';hub:ProPlaceHub}){
 const en=locale==='en',items=proDirectoryItems(en,hub);
 return <nav aria-label={en?'My business in the directory':'Mi negocio en el directorio'} data-place-module-nav className="flex flex-wrap items-center gap-2 text-sm">
  <a href={(en?'/en':'')+'/dashboard/pro'} data-place-module-link="pro" className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 font-semibold ${ring}`}>{en?'← Pro':'← Pro'}</a>
  {items.map(i=><a key={i.key} href={i.href} data-place-module-link={i.key} aria-current={i.key===current?'page':undefined}
   className={`inline-flex min-h-11 items-center rounded-full border px-4 font-semibold ${i.key===current?'border-[#162543] bg-[#162543] text-white':'border-slate-300 bg-white'} ${ring}`}>{i.label}</a>)}
 </nav>;
}

// Launch without Pro (2026-11-18): navigation between the «Mi negocio» tools (/dashboard/negocio/*). Server component,
// plain anchors with the locale prefix. Entries follow the sections that apply to the claimed places (menu and table
// reservations only for restaurants/cafés). Always offers the way back to the account panel.
export type BusinessNavCurrent='hub'|'profile'|'menu'|'reservations'|'place';
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function BusinessNav({locale,current,sections}:{locale:string;current:BusinessNavCurrent;sections:{profile:boolean;menu:boolean;reservations:boolean;place:boolean}}){
 const en=locale==='en',p=(en?'/en':'')+'/dashboard/negocio';
 const items:[BusinessNavCurrent,string,string,boolean][]=[
  ['hub','',en?'My business':'Mi negocio',true],
  ['profile','/perfil',en?'Contact and hours':'Contacto y horario',sections.profile],
  ['menu','/menu',en?'Menu':'Menú',sections.menu],
  ['reservations','/reservas',en?'Table reservations':'Reservas de mesa',sections.reservations],
  ['place','/lugar',en?'Events and «Order»':'Eventos y «Pedir»',sections.place],
 ];
 return <nav aria-label={en?'My business tools':'Herramientas de mi negocio'} data-business-nav>
  <ul className="flex flex-wrap gap-2">
   <li><a href={(en?'/en':'')+'/dashboard/profesional'} data-business-nav-link="panel" className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#162543] ${ring}`}>{en?'← My panel':'← Mi panel'}</a></li>
   {items.filter(i=>i[3]).map(([key,path,label])=><li key={key}><a href={p+path} data-business-nav-link={key} aria-current={key===current?'page':undefined}
    className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${ring} ${key===current?'bg-[#162543] text-white':'border border-slate-300 bg-white text-[#162543] hover:border-[#009FD9]'}`}>{label}</a></li>)}
  </ul>
 </nav>;
}

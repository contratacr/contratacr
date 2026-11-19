import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';
import {editionSettingsPath,type ProChoosableEdition} from '@/lib/pro/edition-choice';

/**
 * LOCAL PRO ONLY (launch fixes 2026-11-17): actionable next step for the empty states of the directory modules
 * (/dashboard/pro/menu, /reservas-mesa, /lugar). Plain anchors + explicit locale prefix so it renders the same in the
 * server menu page and the client reservation/place tools.
 *  - ClaimPlaceNextStep: the claim flow starts on the public place page («¿Es su negocio? Reclámelo gratis»), so we
 *    link to the directory sections where the owner finds that page.
 *  - EditionNextStep: gaps round (2026-11-17) — opens Pro › Edición de Pro (self-service `choose_edition`, owner/admin;
 *    free during the launch) with the needed edition preselected, instead of a support request.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const chip=`inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#162543] hover:border-[#009FD9] ${ring}`;
const primary=`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 text-sm font-semibold text-white hover:bg-[#22355c] ${ring}`;

export function ClaimPlaceNextStep({locale,sections,intro,edition}:{locale:string;sections?:readonly string[];intro:{es:string;en:string};edition?:ProChoosableEdition|'any'}){
 const en=locale==='en',prefix=en?'/en':'';
 const list=PLACE_SECTIONS.filter(s=>!sections||sections.includes(s.section));
 return <div data-place-claim-next className="space-y-3 rounded-2xl bg-slate-50 p-5">
  <p>{en?intro.en:intro.es}</p>
  <p className="text-sm text-[#52627a]">{en?'Find your business in the directory, open its page and press «Is this your business? Claim it for free».':'Busque su negocio en el directorio, abra su ficha y pulse «¿Es su negocio? Reclámelo gratis».'}</p>
  <ul className="flex flex-wrap gap-2">{list.map(s=><li key={s.section}><a data-place-claim-section={s.section} className={list.length===1?primary:chip} href={`${prefix}/${s.section}`}>{list.length===1?(en?`Find my business in ${s.nameEn}`:`Buscar mi negocio en ${s.nameEs}`):(en?s.nameEn:s.nameEs)}</a></li>)}</ul>
  {edition&&<p className="text-sm text-[#52627a]">{en?'Is your Pro edition the right one for this business? ':'¿Su edición de Pro es la adecuada para este negocio? '}<a data-place-claim-edition className="font-semibold text-[#162543] underline" href={editionSettingsPath(locale,edition==='any'?undefined:edition)}>{en?'See Pro editions':'Ver ediciones de Pro'}</a></p>}
 </div>;
}

export function EditionNextStep({locale,text,edition='restaurantes'}:{locale:string;feature?:{es:string;en:string};text:{es:string;en:string};edition?:ProChoosableEdition}){
 const en=locale==='en';
 const name=en?{servicios:'Services',autos:'Cars',restaurantes:'Restaurants',comercio:'Retail'}[edition]:{servicios:'Servicios',autos:'Autos',restaurantes:'Restaurantes',comercio:'Comercio'}[edition];
 return <div data-edition-next className="space-y-3 rounded-2xl bg-slate-50 p-5">
  <p>{en?text.en:text.es} {en?'The owner or an administrator of your company can choose it in Pro › Pro edition; it is free during the launch.':'El dueño o un administrador de su empresa puede elegirla en Pro › Edición de Pro; es gratis durante el lanzamiento.'}</p>
  <a data-edition-choose className={primary} href={editionSettingsPath(locale,edition)}>{en?`Choose the «${name}» edition`:`Elegir la edición «${name}»`}</a>
 </div>;
}

import type {ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {CR_PROVINCES} from '@/lib/directory/listing-public';
import {placeSection} from '@/lib/directory/place-verticals';
import {encodeCursor,placePriceMode,type SearchSort} from '@/lib/directory/search-schemas';
import {searchProblemText,type DirectorySearchPage} from '@/lib/directory/search-server';
import {LandingNavbar} from '@/components/landing/landing-navbar';
import {LandingFooter} from '@/components/landing/landing-footer';
import {SearchResultsLayout} from '@/components/search/search-results-layout';
import {PlacesMap} from '@/components/maps/places-map';
import {hrefWith} from './listing-home-parts';
import {PlaceCard} from './place-card';
import {SearchFilters,sortLabel} from './search-filters';
import {PlacesFilterChips,PlacesFiltersDrawer,type ChipMenu,type ChipToggle} from './places-search-controls';

/**
 * LOCAL PRO ONLY (multivertical F6): landing of a places section (/restaurantes, /farmacias, /supermercados,
 * /gasolineras and, since the owner approval of 2026-11-17, /cafes, /pulperias, /ferreterias, /hospedaje, /salud,
 * /veterinarias, /talleres, /belleza, /gimnasios, /tours, /bancos). Server component built from the server result of
 * loadDirectorySearch; new sections add a «Tipo» chip (attributes.kind) next to the province chip.
 *
 * 2026-11-19 (owner: «buscar lugares y negocios debería tener la misma lógica estética y orden que buscar
 * profesionales»): the page is now the /profesionales results screen — compact title row with the count and the filter
 * chips, numbered cards on the left, the places map on the right (phones: the same map + draggable results sheet,
 * SearchResultsLayout). The explanatory and legal notes (`lead`, `note`, `policy`, order and price explanations) are no
 * longer shown here: their substance lives in the Terms («Directorio de lugares y negocios») and /como-ordenamos
 * (Ley 10.946 ranking parameters), linked from the footer and the Terms.
 */
export type PlaceSection='restaurantes'|'farmacias'|'supermercados'|'gasolineras'|'cafes'|'pulperias'|'ferreterias'|'hospedaje'|'salud'|
 'veterinarias'|'talleres'|'belleza'|'gimnasios'|'tours'|'bancos';
type Copy={title:[string,string]};
/** H1 of each section (the metadata title of its page). */
const COPY:Record<PlaceSection,Copy>={
 restaurantes:{title:['Restaurantes en Costa Rica','Restaurants in Costa Rica']},
 farmacias:{title:['Farmacias en Costa Rica','Pharmacies in Costa Rica']},
 supermercados:{title:['Supermercados en Costa Rica','Supermarkets in Costa Rica']},
 gasolineras:{title:['Gasolineras en Costa Rica','Fuel stations in Costa Rica']},
 cafes:{title:['Cafés, panaderías y bares en Costa Rica','Cafés, bakeries and bars in Costa Rica']},
 pulperias:{title:['Pulperías y minisúper en Costa Rica','Corner stores in Costa Rica']},
 ferreterias:{title:['Ferreterías en Costa Rica','Hardware stores in Costa Rica']},
 hospedaje:{title:['Hospedaje en Costa Rica','Lodging in Costa Rica']},
 salud:{title:['Establecimientos de salud en Costa Rica','Health facilities in Costa Rica']},
 veterinarias:{title:['Veterinarias y tiendas de mascotas en Costa Rica','Vets and pet shops in Costa Rica']},
 talleres:{title:['Talleres y servicios para vehículos en Costa Rica','Car services in Costa Rica']},
 belleza:{title:['Belleza en Costa Rica','Beauty in Costa Rica']},
 gimnasios:{title:['Gimnasios en Costa Rica','Gyms in Costa Rica']},
 tours:{title:['Tours y atracciones en Costa Rica','Tours and attractions in Costa Rica']},
 bancos:{title:['Bancos y cajeros en Costa Rica','Banks and ATMs in Costa Rica']},
};
const fmt=(n:number,en:boolean)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,en?',':'.');
const NOT_FILTERS=['q','sort','cursor','page','lat','lng'];

export function PlacesSectionHome({section,locale,page,basePath,banner}:{section:PlaceSection;locale:string;page:DirectorySearchPage;basePath:string;banner?:ReactNode}){
 const en=locale==='en',i=en?1:0,c=COPY[section],t=(es:string,english:string)=>en?english:es;
 const values=page.values,def=placeSection(section),kinds=def?.kinds??[],priceMode=placePriceMode(section);
 const link=(patch:Record<string,string|undefined>)=>hrefWith(basePath,{...values,cursor:undefined,...patch});
 const activeFilters=Object.entries(values).filter(([k,v])=>!!v&&!NOT_FILTERS.includes(k)).length;
 // Same sort rule as the filters form: price sorts only where a price exists; distance only with the visitor's position.
 const priceSorts=priceMode==='menu'||(priceMode==='product'&&!!values.product);
 const sorts=(['relevance','best_rated',...(values.lat?['distance'] as const:[]),...(priceSorts?['price_asc','price_desc'] as const:[]),'newest'] as SearchSort[]);
 const sort=(values.sort as SearchSort|undefined)??'relevance';
 const menus:ChipMenu[]=[
  {key:'sort',label:sortLabel(sorts.includes(sort)?sort:'relevance',en),active:sort!=='relevance',options:sorts.map(s=>({value:`sort-${s}`,label:sortLabel(s,en),href:link({sort:s==='relevance'?undefined:s}),current:s===sort}))},
  {key:'province',label:values.province??t('Provincia','Province'),active:!!values.province,options:[{value:'province-all',label:t('Todo el país','Whole country'),href:link({province:undefined,canton:undefined}),current:!values.province},
   ...CR_PROVINCES.map(p=>({value:p,label:p,href:link({province:p,canton:undefined}),current:values.province===p}))]},
  ...(kinds.length?[{key:'kind',label:kinds.find(k=>k.value===values.kind)?.[en?'en':'es']??t('Tipo','Type'),active:!!values.kind,
   options:[{value:'kind-all',label:t('Todos los tipos','All types'),href:link({kind:undefined}),current:!values.kind},...kinds.map(k=>({value:`kind-${k.value}`,label:en?k.en:k.es,href:link({kind:k.value}),current:values.kind===k.value}))]}]:[]),
 ];
 const on=(k:string)=>values[k]==='1'||values[k]==='true';
 const facets=page.ok?page.facets:null;
 const toggles:ChipToggle[]=[
  {key:'open-now',label:t('Abierto ahora','Open now'),href:link({openNow:on('openNow')?undefined:'1'}),active:on('openNow')},
  {key:'open-24h',label:t('24 horas','24 hours'),href:link({open24h:on('open24h')?undefined:'1'}),active:on('open24h')},
 ];
 const clear=activeFilters>0?{href:hrefWith(basePath,{q:values.q}),label:t('Limpiar filtros','Clear filters')}:undefined;
 const total=facets?.total??null,where=values.canton??values.province;
 const count=total==null?null:`${fmt(total,en)} ${t(total===1?'lugar':'lugares',total===1?'place':'places')} ${where?t(`en ${where}`,`in ${where}`):t('en Costa Rica','in Costa Rica')}`;
 const items=page.ok?page.result.items:[];
 const places=items.flatMap(it=>it.kind==='place'?[it]:[]);
 const points=places.flatMap((p,n)=>p.location?[{id:p.slug,lat:p.location.lat,lng:p.location.lng,label:`${n+1}. ${p.name}`,href:`${en?'/en':''}/lugar/${p.slug}`,rank:n+1}]:[]);
 const next=page.ok&&page.result.nextCursor?link({cursor:encodeCursor(page.result.nextCursor)}):null;
 const filtersLabel=t('Filtros','Filters');
 const chips=(variant:'bar'|'sheet')=><PlacesFilterChips variant={variant} menus={menus} toggles={toggles} filtersLabel={filtersLabel} activeFilters={activeFilters} clear={clear} en={en}/>;
 const map=points.length?<PlacesMap cluster bare cooperative={false} points={points} locale={locale} zoom={14} className="h-full w-full"
  label={t(`Mapa de ${points.length} resultados`,`Map of ${points.length} results`)}/>:null;
 const nav='inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-bold transition-colors';
 return <div className="ccr-buscar-pagina flex min-h-screen flex-col bg-white" data-places-home={section}>
  <LandingNavbar/>
  <div className="ccr-navbar-spacer hidden h-16 lg:block" aria-hidden/>
  {/* Title row: the same strip as /profesionales (accent bar · H1 · count · chips). Phones carry the title in the sheet. */}
  <div className="hidden bg-white lg:block">
   <div className="mx-auto max-w-[1920px] px-4 pb-2.5 pt-3 sm:px-6 lg:px-8">
    <div className="flex items-center gap-2.5">
     <span className="h-5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden/>
     <div className="flex min-w-0 shrink items-baseline gap-x-2">
      <h1 className="truncate text-lg font-bold leading-tight text-[#162543]">{c.title[i]}</h1>
      {count&&<p className="shrink-0 whitespace-nowrap text-[13px] leading-tight text-[#6b7280]" data-places-count={total}>· {count}</p>}
     </div>
     <div className="ml-4 min-w-0 flex-1">{chips('bar')}</div>
    </div>
   </div>
  </div>
  <main id="contenido" className="flex-1 bg-white">
   <div className="mx-auto max-w-[1920px] px-0 py-0 lg:px-8 lg:pb-0 lg:pt-0">
    <SearchResultsLayout locale={locale} filters={null} map={map} countLabel={count??undefined}
     limpiar={clear} resetKey={JSON.stringify(values)} sinResultados={items.length===0}
     quickFilters={<><h1 className="truncate pb-2 text-[15px] font-bold leading-tight text-[#162543]">{c.title[i]}</h1>{chips('sheet')}</>}>
     <div className="min-w-0 space-y-0 lg:space-y-3 lg:pb-6" data-search-results={section}>
      {banner&&<div className="-mx-4 border-b border-[#eef2f6] px-4 py-3 lg:mx-0 lg:border-0 lg:p-0">{banner}</div>}
      {page.ok&&page.result.priceProduct&&<p className="py-2 text-[13px] text-[#526277] lg:py-0" data-price-product={page.result.priceProduct.slug}>{t('Precios de: ','Prices for: ')}
       <strong className="text-[#162543]">{page.result.priceProduct.name}{page.result.priceProduct.presentation?` (${page.result.priceProduct.presentation})`:''}</strong>{' · '}
       <a className="font-semibold text-[#007fae] hover:underline" href={`${en?'/en':''}/precios?producto=${encodeURIComponent(page.result.priceProduct.slug)}`}>{t('Comparar este producto','Compare this product')}</a></p>}
      {page.ok&&!page.result.priceProduct&&values.product&&priceMode==='product'&&<p className="py-2 text-[13px] text-[#526277] lg:py-0" data-price-product-missing>
       {t(`No encontramos "${values.product}" en el catálogo de precios. Pruebe con otro nombre o con el código de barras.`,`We did not find "${values.product}" in the price catalog. Try another name or the barcode.`)}</p>}
      {!page.ok
       ?<p role="alert" data-search-problem={page.reason} className="my-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-[#162543]">{searchProblemText(page.reason,en)}</p>
       :items.length===0
        ?<div role="status" className="my-3 rounded-2xl border border-[#e5e7eb] bg-white px-6 py-10 text-center text-[#162543] lg:my-0">
          <p className="text-base font-bold">{t('No encontramos resultados con estos filtros.','No results with these filters.')}</p>
          <p className="mt-1 text-sm text-[#526277]">{t('Pruebe con menos filtros u otra zona.','Try fewer filters or another area.')}</p>
          {activeFilters>0&&<a href={clear!.href} className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-sm font-bold text-white hover:bg-[#0089bb]">{t('Limpiar filtros','Clear filters')}</a>}
         </div>
        :<ol className="ccr-search-results-list -mx-4 flex w-[calc(100%+2rem)] min-w-0 flex-col gap-1.5 bg-white lg:mx-0 lg:w-full lg:gap-3 lg:bg-transparent" aria-label={t('Resultados','Results')}>
          {places.map((item,n)=><li key={item.key} className="min-w-0"><PlaceCard item={item} locale={locale} rank={n+1}/></li>)}
         </ol>}
      {(next||values.cursor)&&<nav aria-label={t('Más resultados','More results')} className="flex items-center justify-between gap-3 py-4 lg:border-t lg:border-[#e5e7eb] lg:pt-4">
       {values.cursor?<a href={link({cursor:undefined})} className={`${nav} border border-[#d7e2ea] bg-white text-[#1A2744] hover:border-[#009FD9] hover:text-[#009FD9]`}><ChevronLeft className="h-4 w-4" aria-hidden="true"/>{t('Primeros resultados','First results')}</a>:<span/>}
       {next&&<a href={next} rel="next" className={`${nav} bg-[#009FD9] text-white hover:bg-[#0089bb]`}>{t('Siguiente','Next')}<ChevronRight className="h-4 w-4" aria-hidden="true"/></a>}
      </nav>}
     </div>
    </SearchResultsLayout>
   </div>
  </main>
  <PlacesFiltersDrawer title={filtersLabel} closeLabel={t('Cerrar','Close')}>
   <SearchFilters panel vertical={section} values={values} facets={facets?.facets??null} locale={locale} action={basePath}/>
  </PlacesFiltersDrawer>
  <LandingFooter/>
 </div>;
}

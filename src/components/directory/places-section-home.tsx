import type {ReactNode} from 'react';
import {DirectoryQuickNav} from '@/components/landing/directory-nav';
import {Check} from 'lucide-react';
import {CR_PROVINCES} from '@/lib/directory/listing-public';
import {placeSection,reviewsOn,sectionRatingSort} from '@/lib/directory/place-verticals';
import {encodeCursor,placePriceMode,type SearchSort} from '@/lib/directory/search-schemas';
import {searchProblemText,type DirectorySearchPage} from '@/lib/directory/search-server';
import {LandingNavbar} from '@/components/landing/landing-navbar';
import {LandingFooter} from '@/components/landing/landing-footer';
import {SearchResultsLayout} from '@/components/search/search-results-layout';
import {PlacesMap} from '@/components/maps/places-map';
import {hrefWith} from './listing-home-parts';
import {PlaceCard} from './place-card';
import {placeCardActions} from '@/lib/directory/place-actions';
import {InfiniteMore} from '@/components/search/infinite-more';
import {morePlaces} from '@/app/actions/more-places';
import {kindLabel} from '@/lib/directory/place-verticals';
import {placeCardExtras} from '@/lib/directory/card-extras';
import {SearchFilters,sortLabel} from './search-filters';
import {AMBIGUOUS_SECTIONS,DIRECTORY_SECTION_LABELS} from '@/lib/search/directory-search';
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
// Owner, 2026-11-26: people pick these by photos and reviews, so they keep result cards; every other business section is
// map and pins only on phones (the nearest one open now).
const CARD_SECTIONS=new Set(['restaurantes','cafes','belleza']);
export type PlaceSection='restaurantes'|'farmacias'|'supermercados'|'gasolineras'|'cafes'|'pulperias'|'ferreterias'|'hospedaje'|'salud'|
 'veterinarias'|'talleres'|'belleza'|'gimnasios'|'tours'|'bancos'|'parqueos'|'lavacar'|
 'atracciones'|'tiendas'|'centros-comerciales'|'mercados-y-carnicerias'|'tramites'|'educacion'|'transporte';
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
 tours:{title:['Tours y museos en Costa Rica','Tours and museums in Costa Rica']},
 bancos:{title:['Bancos y cajeros en Costa Rica','Banks and ATMs in Costa Rica']},
 parqueos:{title:['Parqueos en Costa Rica','Parking in Costa Rica']},
 lavacar:{title:['Lavacar en Costa Rica','Car washes in Costa Rica']},
 atracciones:{title:['Atracciones en Costa Rica','Attractions in Costa Rica']},
 tiendas:{title:['Tiendas en Costa Rica','Stores in Costa Rica']},
 'centros-comerciales':{title:['Centros comerciales en Costa Rica','Shopping centers in Costa Rica']},
 'mercados-y-carnicerias':{title:['Mercados y carnicerías en Costa Rica','Markets and butchers in Costa Rica']},
 tramites:{title:['Trámites y oficinas públicas en Costa Rica','Public offices in Costa Rica']},
 educacion:{title:['Educación en Costa Rica','Education in Costa Rica']},
 transporte:{title:['Transporte en Costa Rica','Transport in Costa Rica']},
};
const fmt=(n:number,en:boolean)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,en?',':'.');
const NOT_FILTERS=['q','sort','cursor','page','lat','lng'];

export async function PlacesSectionHome({section,locale,page,basePath,banner}:{section:PlaceSection;locale:string;page:DirectorySearchPage;basePath:string;banner?:ReactNode}){
 const en=locale==='en',i=en?1:0,c=COPY[section],t=(es:string,english:string)=>en?english:es;
 const values=page.values,def=placeSection(section),kinds=def?.kinds??[],priceMode=placePriceMode(section);
 const link=(patch:Record<string,string|undefined>)=>hrefWith(basePath,{...values,cursor:undefined,...patch});
 const activeFilters=Object.entries(values).filter(([k,v])=>!!v&&!NOT_FILTERS.includes(k)).length;
 // Same sort rule as the filters form: price sorts only where a price exists; distance only with the visitor's position.
 const priceSorts=priceMode==='menu'||(priceMode==='product'&&!!values.product);
 // Like the professionals search in production (owner 2026-11-26): Mejor calificados by default, Más cercanos (asks for the
 // position), and the price sorts where prices exist. The chip shows the current order. Sections where some or all places
 // take no reviews (trámites, centros comerciales, educación, transporte) never sort by rating: Más relevantes by default.
 const rated=sectionRatingSort(section),defSort:SearchSort=rated?'best_rated':'relevance';
 const sorts=([defSort,'distance',...(priceSorts?['price_asc','price_desc'] as const:[])] as SearchSort[]);
 const sort=(values.sort as SearchSort|undefined)??defSort;
 const menus:ChipMenu[]=[
  {key:'sort',label:sortLabel(sorts.includes(sort)?sort:defSort,en),active:false,options:sorts.map(s=>({value:`sort-${s}`,label:sortLabel(s,en),href:link({sort:s===defSort?undefined:s}),current:s===sort,...(s==='distance'&&!values.lat?{needsLocation:true}:{})}))},
  {key:'province',label:values.province??t('Provincia','Province'),active:!!values.province,options:[{value:'province-all',label:t('Todo el país','Whole country'),href:link({province:undefined,canton:undefined}),current:!values.province},
   ...CR_PROVINCES.map(p=>({value:p,label:p,href:link({province:p,canton:undefined}),current:values.province===p}))]},
  ...(kinds.length?[{key:'kind',label:kinds.find(k=>k.value===values.kind)?.[en?'en':'es']??t('Tipo','Type'),active:!!values.kind,
   options:[{value:'kind-all',label:t('Todos los tipos','All types'),href:link({kind:undefined}),current:!values.kind},...kinds.map(k=>({value:`kind-${k.value}`,label:en?k.en:k.es,href:link({kind:k.value}),current:values.kind===k.value}))]}]:[]),
 ];
 const on=(k:string)=>values[k]==='1'||values[k]==='true';
 const facets=page.ok?page.facets:null;
 const toggles:ChipToggle[]=[
  // «Cerca de mí» left the chips (owner 2026-11-26): it lives in the search's location field; «Más cercanos» stays in Ordenar.
  {key:'open-now',label:t('Abierto ahora','Open now'),href:link({openNow:on('openNow')?undefined:'1'}),active:on('openNow')},
  // «24 horas» left the chips (owner 2026-11-26): «Abierto ahora» already covers it.
 ];
 // The map's floating pill is «Abierto ahora» (not the first chip: «Cerca de mí» needs the position flow of the chip row).
 const openNowToggle=toggles.find(x=>x.key==='open-now')!;
 const clear=activeFilters>0?{href:hrefWith(basePath,{q:values.q}),label:t('Limpiar filtros','Clear filters')}:undefined;
 const total=facets?.total??null,where=values.canton??values.province;
 const count=total==null?null:`${fmt(total,en)} ${t(total===1?'negocio':'negocios',total===1?'business':'businesses')} ${where?t(`en ${where}`,`in ${where}`):t('en Costa Rica','in Costa Rica')}`;
 const items=page.ok?page.result.items:[];
 const plainValues=Object.fromEntries(Object.entries(values).filter(([k,v])=>k!=='cursor'&&typeof v==='string'&&v)) as Record<string,string>;
 const places=items.flatMap(it=>it.kind==='place'?[it]:[]);
 // Yelp result-card model (2026-11-19): cover photo + newest review snippet for the places of this page.
 const extras=await placeCardExtras(places.map(p=>p.slug));
 const points=places.flatMap((p,n)=>p.location?[{id:p.slug,lat:p.location.lat,lng:p.location.lng,label:`${n+1}. ${p.name}`,href:`${en?'/en':''}/lugar/${p.slug}`,rank:n+1,name:p.name,sub:[en?p.vertical.nameEn:p.vertical.nameEs,kindLabel(p.vertical.id,p.attributes.kind,en)].filter(Boolean).join(' · '),rating:p.rating.average!=null&&reviewsOn(p.vertical.id,p.attributes.kind)?Number(p.rating.average):null,ratingCount:reviewsOn(p.vertical.id,p.attributes.kind)?p.rating.count:0,
  // Map-first sections (owner 2026-11-26): the pin card carries open-now and the two card actions (Llamar, Cómo llegar).
  open:p.openNow===true?t('Abierto ahora','Open now'):p.openNow===false?t('Cerrado ahora','Closed now'):undefined,openNow:p.openNow,
  actions:placeCardActions({slug:p.slug,name:p.name,verticalId:p.vertical.id,locale,phone:p.phone,location:p.location}).map(a=>({id:a.id,label:a.short||a.label,href:a.type==='directions'&&p.location?`https://www.google.com/maps/dir/?api=1&destination=${p.location.lat},${p.location.lng}`:a.href,external:a.type==='directions'||!!a.external}))}]:[]);
 const filtersLabel=t('Filtros','Filters');
 const chips=(variant:'bar'|'sheet')=><PlacesFilterChips variant={variant} menus={menus} toggles={toggles} filtersLabel={filtersLabel} activeFilters={activeFilters} clear={clear} en={en}/>;
 const map=points.length?<PlacesMap cluster bare cooperative={false} points={points} locale={locale} zoom={14} className="h-full w-full"
  label={t(`Mapa de ${points.length} resultados`,`Map of ${points.length} results`)}/>:null;
 return <div className="ccr-buscar-pagina flex min-h-screen flex-col bg-white" data-places-home={section}>
  <LandingNavbar forceCompactSearch mobileSearch/>
  <div className="ccr-navbar-spacer hidden h-16 lg:block" aria-hidden/>
  <DirectoryQuickNav floating={{title:DIRECTORY_SECTION_LABELS[section]?.[en?'en':'es']??c.title[i],subtitle:'Costa Rica',back:t('Volver al inicio','Back to home'),...(CARD_SECTIONS.has(section)?{listToggle:{list:t('Ver lista','Show list'),map:t('Ver mapa','Show map')}}:{})}}/>
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
  {/* One experience (owner 2026-11-22): the section is a business filter of the same results; professionals of the same trade are one tap away. */}
  {AMBIGUOUS_SECTIONS.has(section)&&<nav aria-label={t('Profesionales relacionados','Related professionals')} data-related-professionals="" className="hidden bg-white lg:block"><div className="mx-auto max-w-[1920px] px-4 pb-2 sm:px-6 lg:px-8">
   <a href={`${en?'/en':''}/profesionales?q=${encodeURIComponent(DIRECTORY_SECTION_LABELS[section]?.[en?'en':'es']??'')}`} className="inline-flex h-8 items-center rounded-full bg-[#f1f5f9] px-3.5 text-[13px] font-bold text-[#007fae] hover:bg-[#eaf7fd]">{t('Ver también profesionales de este rubro','Also see professionals in this field')}</a></div></nav>}
  <main id="contenido" className="flex-1 bg-white">
   <div className="mx-auto max-w-[1920px] px-0 py-0 lg:px-8 lg:pb-0 lg:pt-0">
    <SearchResultsLayout locale={locale} filters={null} map={map} countLabel={count??undefined} mapaPrimero={points.length>0&&!CARD_SECTIONS.has(section)} soloMapa={points.length>0&&!CARD_SECTIONS.has(section)} floatingFilters={<a href={openNowToggle.href} data-chip="open-now" aria-pressed={openNowToggle.active} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-bold shadow-sm ${openNowToggle.active?"border-[#009FD9] bg-[#009FD9] text-white":"border-[#d7dde3] bg-white text-[#162543]"}`}>{openNowToggle.active&&<Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true"/>}{openNowToggle.label}</a>}
     limpiar={clear} resetKey={JSON.stringify(values)} sinResultados={items.length===0}
     quickFilters={<><h1 className="sr-only">{c.title[i]}</h1>{chips('sheet')}</>}>
     <div className="min-w-0 space-y-0 lg:space-y-3 lg:pb-6" data-search-results={section}>
      {AMBIGUOUS_SECTIONS.has(section)&&<p className="px-4 pb-1 pt-3 lg:hidden" data-related-professionals-mobile=""><a href={`${en?'/en':''}/profesionales?q=${encodeURIComponent(DIRECTORY_SECTION_LABELS[section]?.[en?'en':'es']??'')}`} className="inline-flex min-h-9 items-center rounded-full bg-[#f1f5f9] px-3.5 text-[13px] font-bold text-[#007fae]">{t('Ver también profesionales de este rubro','Also see professionals in this field')}</a></p>}
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
          {places.map((item,n)=><li key={item.key} className="ccr-search-card-slot min-w-0"><PlaceCard item={item} locale={locale} rank={n+1} extra={extras[item.slug]??null}/></li>)}
          {/* Owner 2026-11-26: the next 20 load by themselves while scrolling (skeleton meanwhile). */}
          <InfiniteMore initialNext={page.ok&&page.result.nextCursor?encodeCursor(page.result.nextCursor):null} startRank={places.length+1} load={morePlaces.bind(null,section,plainValues,locale)} label={t('Cargando más resultados','Loading more results')}/>
         </ol>}
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

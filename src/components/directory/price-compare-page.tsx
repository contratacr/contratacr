import type {ReactNode} from 'react';
import {ArrowLeft,Barcode,ChevronRight,Fuel,MapPin,MessageSquarePlus,PackageSearch,Pill,Search,ShoppingCart,Store,TrendingDown} from 'lucide-react';
import {CR_PROVINCES} from '@/lib/directory/listing-public';
import {COMPARE_SORTS,CONFIDENCE_LABEL,bilingual,categoryLabel,crDay,money,perUnitLabel,
 type CompareSort,type PriceComparison,type PriceHistory,type PriceOffer,type PriceOverview,type PriceOverviewItem,type PriceQuery,type PriceSearchItem,type PriceSearchResult} from '@/lib/directory/price-compare';
import type {PublicPriceCurrent,PublicPriceObservation} from '@/lib/directory/price-schemas';
import {hrefWith} from './listing-home-parts';
import {PlacesFilterChips,PlacesFiltersDrawer,type ChipMenu} from './places-search-controls';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';

/**
 * LOCAL PRO ONLY (multivertical P3): public price comparison /precios (/en/precios). Server component, plain GET
 * (works without JavaScript; the filter chips and drawer are the places-section primitives). Every price shows its
 * source, date, staleness and confidence; unit price is normalized per kg / litre / unit; the order is the lowest unit
 * price first (current prices before out-of-date ones), ties by place name — never payment. Prescription medicines are
 * never searchable (filtered in SQL).
 * 2026-11-19 redesign (owner): one prominent product search; landing with categories (product counts), products with
 * prices, today's ARESEP fuel prices (→ /gasolineras) and invitations to publish/report prices; a product page lists
 * one row per store from lowest to highest price («Mejor precio» on the first current one), with «Actualizado el»,
 * source label, the lowest price of the last 30 days and a small 90-day history. Filters: chips + drawer like the
 * places sections. No explanatory paragraphs (they live in the Terms, 13.1, and /como-ordenamos).
 */
export type PricePageData={invalid:boolean;unavailable:boolean;search:PriceSearchResult|null;comparison:PriceComparison|null;history:PriceHistory|null;
 overview:PriceOverview|null;fuel:PublicPriceCurrent|null};
type Props={locale:string;query:PriceQuery;data:PricePageData};
type T=(es:string,english:string)=>string;

const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const card='rounded-2xl border border-[#e5e7eb] bg-white';
const field='flex flex-col gap-1 text-sm font-medium';
const input='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7fab]';
const primaryBtn=`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white hover:bg-[#0089bb] ${ring}`;
const ghostBtn=`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white px-5 text-sm font-bold text-[#162543] hover:border-[#009FD9] ${ring}`;
const SORT_LABEL:Record<CompareSort,[string,string]>={unit_price:['Precio por unidad','Unit price'],price:['Precio','Price'],place:['Comercio','Store']};
const TIPO_LABEL={supermercados:['Supermercados','Supermarkets'],farmacias:['Farmacias','Pharmacies']} as const;
const SUGGESTIONS:[string,string][]=[['Arroz','Rice'],['Frijoles','Beans'],['Leche','Milk'],['Huevos','Eggs'],['Café','Coffee'],['Acetaminofén','Acetaminophen']];
const fmtInt=(n:number,en:boolean)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,en?',':'.');

export function PriceComparePage({locale,query,data}:Props){
 const en=locale==='en',t:T=(es,english)=>en?english:es,prefix=en?'/en':'',base=prefix+'/precios';
 const {invalid,unavailable,search,comparison,history,overview,fuel}=data;
 const keep={q:query.q??undefined,tipo:query.verticalParam??undefined,provincia:query.province??undefined,orden:query.sort==='unit_price'?undefined:query.sort,
  precioMin:query.priceMin!=null?String(query.priceMin):undefined,precioMax:query.priceMax!=null?String(query.priceMax):undefined,
  categoria:query.category??undefined,producto:query.item??undefined};
 const link=(patch:Record<string,string|undefined>)=>hrefWith(base,{...keep,...patch});
 const menus:ChipMenu[]=[
  {key:'tipo',label:query.verticalParam?TIPO_LABEL[query.verticalParam][en?1:0]:t('Tipo de comercio','Type of store'),active:!!query.verticalParam,options:[
   {value:'tipo-todos',label:t('Todos los comercios','All stores'),href:link({tipo:undefined}),current:!query.verticalParam},
   ...(['supermercados','farmacias'] as const).map(v=>({value:`tipo-${v}`,label:TIPO_LABEL[v][en?1:0],href:link({tipo:v}),current:query.verticalParam===v}))]},
  {key:'provincia',label:query.province??t('Provincia','Province'),active:!!query.province,options:[
   {value:'provincia-todas',label:t('Todo el país','Whole country'),href:link({provincia:undefined}),current:!query.province},
   ...CR_PROVINCES.map(p=>({value:p,label:p,href:link({provincia:p}),current:query.province===p}))]},
 ];
 const activeFilters=[query.verticalParam,query.province,query.priceMin,query.priceMax].filter(v=>v!=null).length;
 const clear=activeFilters>0?{href:hrefWith(base,{q:keep.q,producto:keep.producto,categoria:keep.categoria}),label:t('Limpiar filtros','Clear filters')}:undefined;
 const filtersLabel=t('Filtros','Filters');
 const landing=!query.item&&!query.q&&!query.category;
 const kindOfItem=comparison?.item.kind;
 const reportHref=`${prefix}/${kindOfItem==='medicine'||query.verticalParam==='farmacias'?'farmacias':'supermercados'}`;
 return <main id="contenido" data-price-compare className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-3 text-[#162543] sm:px-6 sm:pt-4">
  {/* Title row: the same strip as the places sections (accent bar · H1 · chips). */}
  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
   <div className="flex items-center gap-2.5">
    <span className="h-5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden/>
    <h1 className="text-lg font-bold leading-tight">{t('Comparar precios','Compare prices')}</h1>
    {overview&&overview.totals.priced>0&&<p className="hidden whitespace-nowrap text-[13px] text-[#6b7280] sm:block" data-price-totals>· {fmtInt(overview.totals.priced,en)} {overview.totals.priced===1?t('producto con precios','product with prices'):t('productos con precios','products with prices')}</p>}
   </div>
   <div className="min-w-0 lg:flex-1" data-price-chips>
    <PlacesFilterChips variant="bar" menus={menus} toggles={[]} filtersLabel={filtersLabel} activeFilters={activeFilters} clear={clear} en={en}/>
   </div>
  </div>

  {!query.item&&<SearchHero query={query} keep={keep} base={base} t={t} en={en} compact={!landing}/>}

  {(query.priceMin!=null||query.priceMax!=null)&&<p className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#EBF5FB] px-3 py-1.5 text-[13px] font-semibold text-[#007fae]" data-price-range-note>
   {t('Rango de precio del producto: ','Product price range: ')}
   {query.priceMin!=null?money(query.priceMin,'CRC',en):t('sin mínimo','no minimum')} – {query.priceMax!=null?money(query.priceMax,'CRC',en):t('sin máximo','no maximum')}</p>}
  {invalid&&<p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">{t('Revise la búsqueda e intente de nuevo.','Please check your search and try again.')}</p>}
  {unavailable&&<p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">{t('Los precios no están disponibles en este momento. Intente de nuevo en unos minutos.','Prices are not available right now. Please try again in a few minutes.')}</p>}

  {search&&!comparison&&<section aria-labelledby="price-results" className="space-y-3" data-price-results>
   <SectionTitle id="price-results">{t(`Resultados para "${search.q??''}"`,`Results for "${search.q??''}"`)}</SectionTitle>
   {search.items.length===0
    ?<Invitation t={t} prefix={prefix} reportHref={reportHref} empty title={t(`No encontramos "${query.q??''}"`,`We did not find "${query.q??''}"`)} hint={t('Pruebe con otra palabra o con el código de barras.','Try another word or the barcode.')}/>
    :<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{search.items.map(i=><li key={i.slug}><ProductCard item={i} href={link({q:keep.q,producto:i.slug,categoria:undefined})} t={t} en={en} searchItem/></li>)}</ul>}
  </section>}

  {query.category&&overview&&!query.item&&<section aria-labelledby="price-category" className="space-y-3" data-price-category={query.category}>
   <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    <a href={link({categoria:undefined})} className={`inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-[#007fae] hover:underline ${ring}`}><ArrowLeft className="h-4 w-4" aria-hidden/>{t('Todas las categorías','All categories')}</a>
   </div>
   <SectionTitle id="price-category">{categoryLabel(query.category,en)}</SectionTitle>
   {overview.items.length===0
    ?<Invitation t={t} prefix={prefix} reportHref={reportHref} empty title={t('Todavía no hay productos en esta categoría','No products in this category yet')}/>
    :<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{overview.items.map(i=><li key={i.slug}><ProductCard item={i} href={link({producto:i.slug,categoria:undefined})} t={t} en={en}/></li>)}</ul>}
  </section>}

  {comparison&&<Comparison c={comparison} history={history} en={en} t={t} base={base} keep={keep} prefix={prefix} reportHref={reportHref}/>}
  {query.item&&!comparison&&!unavailable&&!invalid&&<div className="space-y-4">
   <BackLink href={hrefWith(base,{q:keep.q,tipo:keep.tipo,provincia:keep.provincia})} t={t}/>
   <Invitation t={t} prefix={prefix} reportHref={reportHref} empty title={t('Ese producto no está disponible.','That product is not available.')}/>
  </div>}

  {!query.item&&!query.category&&<Landing overview={overview} fuel={fuel} landing={landing} link={link} t={t} en={en} prefix={prefix} reportHref={reportHref}/>}

  <PlacesFiltersDrawer title={filtersLabel} closeLabel={t('Cerrar','Close')}>
   <FiltersForm query={query} base={base} keep={keep} t={t}/>
  </PlacesFiltersDrawer>
 </main>;
}

function SectionTitle({id,children,aside}:{id:string;children:ReactNode;aside?:ReactNode}){
 return <div className="flex items-baseline justify-between gap-3">
  <h2 id={id} className="text-[17px] font-bold leading-tight text-[#162543]">{children}</h2>{aside}
 </div>;
}

function BackLink({href,t}:{href:string;t:T}){
 return <a href={href} className={`inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-[#007fae] hover:underline ${ring}`}><ArrowLeft className="h-4 w-4" aria-hidden/>{t('Productos','Products')}</a>;
}

/** The one prominent product search (plain GET). Keeps the type/province/range filters as hidden fields. */
function SearchHero({query,keep,base,t,en,compact}:{query:PriceQuery;keep:Record<string,string|undefined>;base:string;t:T;en:boolean;compact:boolean}){
 const hidden={tipo:keep.tipo,provincia:keep.provincia,precioMin:keep.precioMin,precioMax:keep.precioMax};
 return <section className={compact?'':'rounded-3xl bg-[#EBF5FB] px-4 py-6 sm:px-8 sm:py-9'} data-price-hero={compact?'compact':'full'}>
  {!compact&&<p className="mb-3 text-center text-xl font-extrabold leading-tight text-[#162543] sm:text-[26px]">{t('Encuentre el mejor precio','Find the best price')}</p>}
  <form method="get" action={base} role="search" aria-label={t('Buscar un producto','Search for a product')} data-price-search-form
   className={`mx-auto flex w-full max-w-2xl items-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white p-1.5 pl-4 shadow-[0_10px_30px_-18px_rgba(22,37,67,0.45)] focus-within:border-[#009FD9]`}>
   {Object.entries(hidden).map(([k,v])=>v?<input key={k} type="hidden" name={k} value={v}/>:null)}
   <Search className="h-5 w-5 shrink-0 text-[#6b7280]" aria-hidden/>
   <label className="min-w-0 flex-1"><span className="sr-only">{t('Producto o código de barras','Product or barcode')}</span>
    <input type="search" name="q" maxLength={100} defaultValue={query.q??''} enterKeyHint="search" autoComplete="off"
     placeholder={t('Buscar un producto','Search for a product')}
     className="h-10 w-full min-w-0 bg-transparent text-base text-[#162543] placeholder:text-[#8a96a8] focus:outline-none"/></label>
   <button type="submit" className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] sm:px-6 ${ring}`}>{t('Buscar','Search')}</button>
  </form>
  {!compact&&<ul className="mx-auto mt-3 flex max-w-2xl flex-wrap justify-center gap-1.5" aria-label={t('Búsquedas frecuentes','Popular searches')}>
   {SUGGESTIONS.map(([es,english])=><li key={es}><a href={hrefWith(base,{...hidden,q:en?english:es})} data-price-suggestion
    className={`inline-flex h-8 items-center rounded-full border border-[#cfe3ef] bg-white/80 px-3 text-[12px] font-semibold text-[#162543] hover:border-[#009FD9] ${ring}`}>{en?english:es}</a></li>)}
  </ul>}
 </section>;
}

/** Complete GET filters form inside the «Filtros» drawer (product page: price range of the offers). */
function FiltersForm({query,base,keep,t}:{query:PriceQuery;base:string;keep:Record<string,string|undefined>;t:T}){
 const hidden=query.item?{producto:keep.producto,orden:keep.orden,q:keep.q}:{categoria:keep.categoria};
 return <form method="get" action={base} aria-label={t('Filtrar precios','Filter prices')} data-price-filters-form data-price-range-form={query.item?'':undefined} className="space-y-4 text-[#162543]">
  {Object.entries(hidden).map(([k,v])=>v?<input key={k} type="hidden" name={k} value={v}/>:null)}
  {!query.item&&<label className={field}>{t('Producto o código de barras','Product or barcode')}
   <input type="search" name="q" maxLength={100} defaultValue={query.q??''} className={input} enterKeyHint="search" autoComplete="off"/></label>}
  <label className={field}>{t('Tipo de comercio','Type of store')}
   <select name="tipo" defaultValue={query.verticalParam??''} className={`${input} ${SELECT_CLASS}`} style={SELECT_STYLE}>
    <option value="">{t('Todos','All')}</option><option value="supermercados">{t('Supermercados','Supermarkets')}</option><option value="farmacias">{t('Farmacias (venta libre)','Pharmacies (over the counter)')}</option>
   </select></label>
  <label className={field}>{t('Provincia','Province')}
   <select name="provincia" defaultValue={query.province??''} className={`${input} ${SELECT_CLASS}`} style={SELECT_STYLE}>
    <option value="">{t('Todo el país','Whole country')}</option>{CR_PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
   </select></label>
  <fieldset className="grid grid-cols-2 gap-3">
   <legend className="mb-2 text-base font-bold">{t('Precio','Price')}</legend>
   <label className={field}>{t('Precio mínimo (₡)','Minimum price (₡)')}
    <input type="number" inputMode="numeric" name="precioMin" min={0} max={99999999} step={1} defaultValue={query.priceMin??''} className={input} data-price-min/></label>
   <label className={field}>{t('Precio máximo (₡)','Maximum price (₡)')}
    <input type="number" inputMode="numeric" name="precioMax" min={0} max={99999999} step={1} defaultValue={query.priceMax??''} className={input} data-price-max/></label>
  </fieldset>
  <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-[#eef2f6] bg-white px-4 pb-4 pt-3">
   <a href={hrefWith(base,{producto:keep.producto,q:keep.q,categoria:keep.categoria})} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] hover:border-[#009FD9]">{t('Limpiar','Clear')}</a>
   <button type="submit" className="inline-flex h-11 flex-[2] items-center justify-center rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#162543]">{t('Aplicar filtros','Apply filters')}</button>
  </div>
 </form>;
}

function KindIcon({kind,className}:{kind:string;className?:string}){
 return kind==='medicine'||kind==='pharmacy'?<Pill className={className} aria-hidden/>:<ShoppingCart className={className} aria-hidden/>;
}

function ProductCard({item,href,t,en,searchItem}:{item:PriceSearchItem|PriceOverviewItem;href:string;t:T;en:boolean;searchItem?:boolean}){
 const min='minPrice' in item?item.minPrice:null;
 return <a href={href} data-price-search-item={searchItem?item.slug:undefined} data-price-product-card={item.slug}
  className={`group flex h-full min-h-[88px] items-center gap-3 ${card} p-3.5 transition-colors hover:border-[#009FD9] ${ring}`}>
  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]"><KindIcon kind={item.kind} className="h-6 w-6"/></span>
  <span className="min-w-0 flex-1">
   <span className="block truncate text-[15px] font-bold leading-tight">{item.name}</span>
   <span className="mt-0.5 block truncate text-[13px] text-[#6b7280]">{[item.presentation,item.brand].filter(Boolean).join(' · ')||categoryLabel(item.category,en)}</span>
   <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px]">
    {min!=null&&<span className="font-bold text-[#162543]">{t('Desde ','From ')}{money(min,'CRC',en)}</span>}
    <span className={item.offers>0?'font-semibold text-[#007fae]':'text-[#6b7280]'}>{item.offers===0?t('Sin precios todavía','No prices yet'):item.offers===1?t('1 comercio con precio vigente','1 store with a current price'):t(`${item.offers} comercios con precio vigente`,`${item.offers} stores with a current price`)}</span>
   </span>
  </span>
  <ChevronRight className="h-5 w-5 shrink-0 text-[#9aa6b5] group-hover:text-[#009FD9]" aria-hidden/>
 </a>;
}

/** Polished empty state turned into an invitation: claimed businesses publish their prices; people report them. */
function Invitation({t,prefix,reportHref,title,hint,empty}:{t:T;prefix:string;reportHref:string;title?:string;hint?:string;empty?:boolean}){
 return <div className={`${card} overflow-hidden`} data-price-empty={empty?'':undefined} data-price-invite role={empty?'status':undefined}>
  {title&&<div className="flex flex-col items-center gap-2 px-5 pb-5 pt-7 text-center">
   <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF5FB] text-[#009FD9]"><PackageSearch className="h-7 w-7" aria-hidden/></span>
   <p className="text-base font-bold">{title}</p>
   {hint&&<p className="text-sm text-[#526277]">{hint}</p>}
  </div>}
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${title?'border-t border-[#eef2f6]':''}`}>
   <div className="flex items-start gap-3 p-5 sm:border-r sm:border-[#eef2f6]">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#162543] text-white"><Store className="h-5 w-5" aria-hidden/></span>
    <div className="min-w-0 space-y-2.5">
     <p className="text-[15px] font-bold leading-tight">{t('¿Tiene un comercio? Publique sus precios gratis','Own a store? Publish your prices for free')}</p>
     <a href={`${prefix}/dashboard/negocio`} data-price-invite-business className={primaryBtn}>{t('Publicar precios','Publish prices')}</a>
    </div>
   </div>
   <div className="flex items-start gap-3 border-t border-[#eef2f6] p-5 sm:border-t-0">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]"><MessageSquarePlus className="h-5 w-5" aria-hidden/></span>
    <div className="min-w-0 space-y-2.5">
     <p className="text-[15px] font-bold leading-tight">{t('¿Vio un precio en un comercio?','Saw a price at a store?')}</p>
     <a href={reportHref} data-price-invite-report className={ghostBtn}>{t('Reporte un precio','Report a price')}</a>
    </div>
   </div>
  </div>
 </div>;
}

function Landing({overview,fuel,landing,link,t,en,prefix,reportHref}:{overview:PriceOverview|null;fuel:PublicPriceCurrent|null;landing:boolean;
 link:(p:Record<string,string|undefined>)=>string;t:T;en:boolean;prefix:string;reportHref:string}){
 const cats=overview?.categories??[],items=overview?.items??[];
 const count=(v:'grocery'|'pharmacy')=>cats.filter(c=>c.vertical===v||c.vertical==='mixed').reduce((s,c)=>s+c.items,0);
 const departments=[
  {key:'supermercados' as const,icon:<ShoppingCart className="h-6 w-6" aria-hidden/>,label:t('Supermercado','Supermarket'),n:count('grocery'),stores:`${prefix}/supermercados`},
  {key:'farmacias' as const,icon:<Pill className="h-6 w-6" aria-hidden/>,label:t('Farmacia (venta libre)','Pharmacy (over the counter)'),n:count('pharmacy'),stores:`${prefix}/farmacias`},
 ];
 return <div className="space-y-6">
  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
   <section aria-labelledby="price-categories" className="space-y-3" data-price-categories>
    <SectionTitle id="price-categories">{t('Categorías','Categories')}</SectionTitle>
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{departments.map(d=><li key={d.key}>
     <a href={d.n>0?link({tipo:d.key,q:undefined}):d.stores} data-price-department={d.key} className={`group flex items-center gap-3 ${card} p-4 hover:border-[#009FD9] ${ring}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{d.icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">{d.label}</span>
       <span className="mt-0.5 block text-[13px] text-[#6b7280]">{d.n>0?(d.n===1?t('1 producto','1 product'):t(`${fmtInt(d.n,en)} productos`,`${fmtInt(d.n,en)} products`)):t('Ver comercios','See stores')}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#9aa6b5] group-hover:text-[#009FD9]" aria-hidden/>
     </a></li>)}</ul>
    {cats.length>0&&<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={t('Categorías de productos','Product categories')}>{cats.map(c=><li key={c.category}>
     <a href={link({categoria:c.category,q:undefined})} data-price-category-chip={c.category} data-price-category-count={c.items}
      className={`flex h-full min-h-[60px] items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 hover:border-[#009FD9] ${ring}`}>
      <KindIcon kind={c.vertical} className="h-4 w-4 shrink-0 text-[#009FD9]"/>
      <span className="min-w-0"><span className="block truncate text-[13px] font-bold leading-tight text-[#162543]">{categoryLabel(c.category,en)}</span>
       <span className="block text-[12px] text-[#6b7280]">{c.items===1?t('1 producto','1 product'):t(`${fmtInt(c.items,en)} productos`,`${fmtInt(c.items,en)} products`)}</span></span></a></li>)}</ul>}
    {/* Launch (no catalogue prices yet): the invitations fill the column next to the fuel card. */}
    {landing&&cats.length===0&&<Invitation t={t} prefix={prefix} reportHref={reportHref}/>}
   </section>
   {fuel&&<FuelCard fuel={fuel} t={t} en={en} prefix={prefix}/>}
  </div>

  {items.length>0&&<section aria-labelledby="price-popular" className="space-y-3" data-price-popular>
   <SectionTitle id="price-popular">{t('Productos con precios','Products with prices')}</SectionTitle>
   <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(i=><li key={i.slug}><ProductCard item={i} href={link({producto:i.slug,q:undefined})} t={t} en={en}/></li>)}</ul>
  </section>}

  {landing&&cats.length>0&&<Invitation t={t} prefix={prefix} reportHref={reportHref}/>}
 </div>;
}

/** Today's national fuel prices (ARESEP): resolution and validity, linking to /gasolineras. */
function FuelCard({fuel,t,en,prefix}:{fuel:PublicPriceCurrent;t:T;en:boolean;prefix:string}){
 const items=fuel.items.filter(i=>i.current&&(i.item.kind==='fuel'||i.item.kind==='lpg'));
 if(!items.length)return null;
 const ref=items[0]!.current!;
 const order=(s:string)=>s.includes('super')?0:s.includes('regular')?1:s.includes('diesel')?2:3;
 items.sort((a,b)=>order(a.item.slug)-order(b.item.slug));
 return <section aria-labelledby="price-fuel" className={`${card} flex flex-col overflow-hidden`} data-price-fuel>
  <div className="flex items-center gap-3 border-b border-[#eef2f6] px-4 py-3.5">
   <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#162543] text-white"><Fuel className="h-5 w-5" aria-hidden/></span>
   <div className="min-w-0"><h2 id="price-fuel" className="text-[15px] font-bold leading-tight">{t('Combustibles','Fuel')}</h2>
    <p className="text-[12px] text-[#6b7280]">{t('Precio oficial de hoy','Official price today')}</p></div>
   <span className="ml-auto rounded-full bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-bold text-[#007fae]">ARESEP</span>
  </div>
  <ul className="divide-y divide-[#eef2f6] px-4">{items.map(i=>{const [main,sub]=i.item.name.split(' (');return <li key={i.item.slug} data-price-fuel-item={i.item.slug} className="flex items-center justify-between gap-3 py-2.5">
   <span className="min-w-0 text-[14px] font-semibold leading-tight">{main}{sub&&<span className="ml-1 text-[12px] font-normal text-[#6b7280]">{sub.replace(/\)$/,'')}</span>}</span>
   <span className="shrink-0 whitespace-nowrap text-[15px] font-bold">{money(i.current!.price,i.current!.currency,en)}<span className="text-[12px] font-normal text-[#6b7280]"> / {i.item.unitBase==='l'?t('litro','liter'):i.item.unitBase}</span></span>
  </li>;})}</ul>
  <div className="mt-auto space-y-2 bg-[#F7FAFC] px-4 py-3">
   <p className="text-[12px] text-[#526277]" data-price-fuel-ref>{ref.sourceRef?`${t('Resolución','Resolution')} ${ref.sourceRef} · `:''}{t('Vigente desde el ','Valid from ')}{crDay(ref.validFrom,en)}{ref.validTo?`${t(' hasta el ',' to ')}${crDay(ref.validTo,en)}`:''}</p>
   <a href={`${prefix}/gasolineras`} className={`inline-flex min-h-9 items-center gap-1 text-[13px] font-bold text-[#007fae] hover:underline ${ring}`}>{t('Ver gasolineras','See fuel stations')}<ChevronRight className="h-4 w-4" aria-hidden/></a>
  </div>
 </section>;
}

/** Short source label of one price: official attribution (+ survey/resolution) or who reported it. */
function sourceLabel(o:PublicPriceObservation,en:boolean){
 const src=o.sourceKind.startsWith('official')?bilingual(o.source.attribution,en):CONFIDENCE_LABEL[o.confidence][en?'en':'es'];
 return `${src}${o.sourceRef?` · ${o.sourceRef}`:''}`;
}
function validLine(o:PublicPriceObservation,t:T,en:boolean){
 if(o.stale)return o.staleReason==='expired'?t('Vencido: ya no está vigente','Expired: no longer valid'):t('Desactualizado: puede haber cambiado','Out of date: it may have changed');
 return `${t('Vigente hasta el ','Valid until ')}${crDay(o.validTo&&o.validTo<o.staleAfter?o.validTo:o.staleAfter,en)}`;
}

function Comparison({c,history,en,t,base,keep,prefix,reportHref}:{c:PriceComparison;history:PriceHistory|null;en:boolean;t:T;base:string;keep:Record<string,string|undefined>;prefix:string;reportHref:string}){
 const unit=c.item.normalizedUnit;
 const current=c.offers.filter(o=>!o.observation.stale);
 const best=current[0]??null;
 const low30=history?.low30??null;
 return <section aria-labelledby="price-compare-title" className="space-y-5" data-price-comparison={c.item.slug}>
  <BackLink href={hrefWith(base,{q:keep.q,tipo:keep.tipo,provincia:keep.provincia,precioMin:keep.precioMin,precioMax:keep.precioMax})} t={t}/>
  {/* Product header: identity on the left, best price / 30-day low / history on the right. */}
  <div className={`${card} grid grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]`}>
   <div className="flex items-start gap-4 p-4 sm:p-5">
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#EBF5FB] text-[#009FD9]"><KindIcon kind={c.item.kind} className="h-8 w-8"/></span>
    <div className="min-w-0 space-y-1">
     <h2 id="price-compare-title" className="text-xl font-bold leading-tight sm:text-2xl">{c.item.name}</h2>
     <p className="text-[14px] text-[#526277]">{[c.item.presentation,c.item.brand,categoryLabel(c.item.category,en)].filter(Boolean).join(' · ')}</p>
     {c.item.gtin&&<p className="inline-flex items-center gap-1.5 text-[12px] text-[#6b7280]"><Barcode className="h-4 w-4" aria-hidden/>{c.item.gtin}</p>}
    </div>
   </div>
   <div className="grid grid-cols-2 gap-px border-t border-[#eef2f6] bg-[#eef2f6] lg:border-l lg:border-t-0">
    <div className="bg-white p-4" data-price-best>
     <p className="text-[12px] font-semibold text-[#6b7280]">{t('Mejor precio','Best price')}</p>
     {best?<><p className="mt-0.5 text-2xl font-extrabold leading-tight text-[#162543]">{money(best.observation.price,best.observation.currency,en)}</p>
      <p className="truncate text-[12px] text-[#526277]">{best.place.name}</p></>
      :<p className="mt-1 text-[13px] text-[#6b7280]">{t('Sin precios vigentes','No current prices')}</p>}
    </div>
    <div className="bg-white p-4" data-price-low30>
     <p className="flex items-center gap-1 text-[12px] font-semibold text-[#6b7280]"><TrendingDown className="h-3.5 w-3.5 text-[#009FD9]" aria-hidden/>{t('Precio más bajo en 30 días','Lowest price in 30 days')}</p>
     {low30?<><p className="mt-0.5 text-2xl font-extrabold leading-tight">{money(low30.price,'CRC',en)}</p>
      <p className="text-[12px] text-[#526277]">{crDay(low30.day+'T12:00:00-06:00',en)}</p></>
      :<p className="mt-1 text-[13px] text-[#6b7280]">{t('Sin datos todavía','No data yet')}</p>}
    </div>
    {history&&history.points.length>=2&&<div className="col-span-2 bg-white px-4 pb-3 pt-2"><Sparkline h={history} t={t} en={en}/></div>}
   </div>
  </div>

  {c.regions.length>0&&<ul className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" data-price-regions aria-label={t('Por provincia (precios vigentes)','By province (current prices)')}>{c.regions.map(r=><li key={r.province} data-price-region={r.province} className="shrink-0">
   <a href={hrefWith(base,{...keep,provincia:r.province||undefined})} className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d7e1ea] bg-white px-3 text-[12px] text-[#162543] hover:border-[#009FD9] ${ring}`}>
    <MapPin className="h-3.5 w-3.5 text-[#009FD9]" aria-hidden/><span className="font-bold">{r.province||t('Sin provincia','No province')}</span>
    <span className="text-[#526277]">{t('desde ','from ')}{money(r.minUnitPrice,'CRC',en)} {perUnitLabel(unit,en)} · {r.offers===1?t('1 comercio','1 store'):t(`${r.offers} comercios`,`${r.offers} stores`)}</span></a></li>)}</ul>}

  <section aria-labelledby="price-offers" className="space-y-3">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <h3 id="price-offers" className="text-[17px] font-bold">{t('Precios por comercio','Prices by store')} <span className="font-normal text-[#6b7280]">({c.total})</span></h3>
    <nav aria-label={t('Ordenar por','Sort by')} className="flex items-center gap-1 self-start rounded-full bg-[#f1f5f9] p-1">
     {COMPARE_SORTS.map(s=><a key={s} data-chip={s} href={hrefWith(base,{...keep,producto:c.item.slug,orden:s==='unit_price'?undefined:s})} aria-current={c.sort===s?'true':undefined}
      className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-bold ${c.sort===s?'bg-white text-[#007fae] shadow-sm':'text-[#526277] hover:text-[#162543]'} ${ring}`}>{SORT_LABEL[s][en?1:0]}</a>)}
    </nav>
   </div>
   {c.offers.length===0
    ?<Invitation t={t} prefix={prefix} reportHref={reportHref} empty title={t('Todavía no hay precios para este producto','No prices for this product yet')}/>
    :<ol className="space-y-2.5" data-price-offers>{c.offers.map((o,idx)=><OfferRow key={o.place.slug} o={o} idx={idx} best={best?.place.slug===o.place.slug} unit={unit} t={t} en={en} prefix={prefix}/>)}</ol>}
  </section>
  {c.offers.length>0&&<Invitation t={t} prefix={prefix} reportHref={reportHref}/>}
  <p className="text-xs text-[#6b7280]">{t('Consultado el ','Checked on ')}{crDay(c.asOf,en)}</p>
 </section>;
}

function OfferRow({o,idx,best,unit,t,en,prefix}:{o:PriceOffer;idx:number;best:boolean;unit:string;t:T;en:boolean;prefix:string}){
 const ob=o.observation,where=[o.place.locality??o.place.canton,o.place.province].filter(Boolean).join(', ');
 return <li data-price-offer={o.place.slug} data-price-stale={ob.stale?'1':undefined} data-price-best-offer={best?'':undefined}
  className={`rounded-2xl border p-4 ${best?'border-[#009FD9] bg-[#F5FBFE] shadow-[0_8px_24px_-18px_rgba(0,159,217,0.8)]':ob.stale?'border-[#e5e7eb] bg-[#f8fafc]':'border-[#e5e7eb] bg-white'}`}>
  <div className="flex items-start gap-3">
   <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${best?'bg-[#009FD9] text-white':ob.stale?'bg-[#e5e7eb] text-[#6b7280]':'bg-[#162543] text-white'}`} aria-hidden>{idx+1}</span>
   <div className="min-w-0 flex-1">
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0">
      {best&&<span className="mb-1 inline-flex rounded-full bg-[#009FD9] px-2 py-0.5 text-[11px] font-bold text-white" data-price-best-label>{t('Mejor precio','Best price')}</span>}
      <a href={`${prefix}/lugar/${o.place.slug}`} className={`block text-[15px] font-bold leading-snug text-[#162543] hover:underline ${ring}`}>{!ob.stale?<span className="sr-only">{idx+1}. </span>:null}{o.place.name}</a>
      {where&&<p className="mt-0.5 flex items-center gap-1 text-[13px] text-[#526277]"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden/><span className="truncate">{where}</span></p>}
     </div>
     <div className="shrink-0 text-right">
      <p className={`text-xl font-extrabold leading-tight ${ob.stale?'text-[#6b7280]':'text-[#162543]'}`} data-price-value={ob.price}>{money(ob.price,ob.currency,en)}</p>
      <p className="text-[12px] font-semibold text-[#526277]" data-price-unit>{money(o.unitPrice,ob.currency,en)} {perUnitLabel(unit,en)}</p>
      {ob.stale&&<span className="mt-1 inline-flex rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#526277]">{t('desactualizado','out of date')}</span>}
     </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-[#eef2f6] pt-2 text-[12px] leading-5 text-[#526277]">
     <span data-price-updated className="font-semibold text-[#162543]">{t('Actualizado el ','Updated on ')}{crDay(ob.observedAt,en)}</span>
     <span aria-hidden>·</span><span data-price-source>{sourceLabel(ob,en)}</span>
     <span aria-hidden>·</span><span data-price-staleness>{validLine(ob,t,en)}</span>
     {ob.sourceKind.startsWith('official')&&<span data-price-confidence className="rounded-full bg-[#EBF5FB] px-2 font-semibold text-[#007fae]">{CONFIDENCE_LABEL[ob.confidence][en?'en':'es']}</span>}
     {o.provenance&&<span data-price-provenance><a href={o.provenance.sourceUrl} rel="noopener noreferrer" target="_blank" className={`inline-flex min-h-6 items-center font-semibold text-[#007fae] underline-offset-2 hover:underline ${ring}`}>{t('Ver fuente','View source')}</a></span>}
    </div>
   </div>
  </div>
 </li>;
}

/** 90-day lowest price per day: one 2px line, the last point marked, min/max labels; a compact list for screen readers. */
function Sparkline({h,t,en}:{h:PriceHistory;t:T;en:boolean}){
 const W=320,H=56,pad=6,pts=h.points;
 const first=new Date(pts[0]!.day+'T12:00:00Z').getTime(),last=new Date(pts[pts.length-1]!.day+'T12:00:00Z').getTime();
 const span=Math.max(1,last-first),vals=pts.map(p=>p.price),lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1;
 const x=(d:string)=>pad+(new Date(d+'T12:00:00Z').getTime()-first)/span*(W-2*pad);
 const y=(v:number)=>hi===lo?H/2:pad+(1-(v-lo)/range)*(H-2*pad);
 const path=pts.map((p,i)=>`${i?'L':'M'}${x(p.day).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
 const end=pts[pts.length-1]!;
 return <figure className="space-y-1" data-price-history={pts.length}>
  <figcaption className="flex items-baseline justify-between text-[12px] text-[#6b7280]">
   <span className="font-semibold">{t(`Precio más bajo por día · ${h.days} días`,`Lowest price per day · ${h.days} days`)}</span>
   <span>{money(lo,'CRC',en)} – {money(hi,'CRC',en)}</span>
  </figcaption>
  <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
   <line x1={pad} x2={W-pad} y1={y(lo)} y2={y(lo)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3"/>
   <path d={path} fill="none" stroke="#009FD9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
   {pts.map(p=><circle key={p.day} cx={x(p.day)} cy={y(p.price)} r="6" fill="transparent"><title>{`${crDay(p.day+'T12:00:00-06:00',en)}: ${money(p.price,'CRC',en)}`}</title></circle>)}
   <circle cx={x(end.day)} cy={y(end.price)} r="3.5" fill="#162543" stroke="#fff" strokeWidth="2"/>
  </svg>
  <ul className="sr-only">{pts.map(p=><li key={p.day}>{crDay(p.day+'T12:00:00-06:00',en)}: {money(p.price,'CRC',en)}</li>)}</ul>
 </figure>;
}

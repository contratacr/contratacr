import {PROPERTY_OPERATIONS,PROPERTY_TYPES,VEHICLE_FUELS,VEHICLE_TRANSMISSIONS,VEHICLE_TYPES,isListingVertical,placePriceMode,
 type DirectoryFacets,type FacetValue,type SearchSort,type SearchVertical} from '@/lib/directory/search-schemas';
import {PLACE_SECTIONS,placeSection,sectionRatingSort} from '@/lib/directory/place-verticals';
import {proMoney} from '@/lib/pro/money';
import {FiltersDisclosure} from './filters-disclosure';

/**
 * LOCAL PRO ONLY (multivertical F6): directory filters as a plain GET form (works without JavaScript; every field
 * has a visible label; groups use fieldset/legend; 44 px touch targets; one column at 390 px, two from sm).
 * Field names are the query parameters accepted by parseSearchParams (search-schemas.ts). Facet counts are optional.
 * Not imported yet (see F6 wiring notes).
 */
type Values=Record<string,string|undefined>;
const L=(es:string,en:string)=>({es,en});
const OPTION_LABELS:Record<string,{es:string;en:string}>={
 car:L('Automóvil','Car'),suv:L('SUV','SUV'),pickup:L('Pickup','Pickup'),van:L('Microbús o van','Van'),truck:L('Camión','Truck'),motorcycle:L('Motocicleta','Motorcycle'),atv:L('Cuadraciclo','ATV'),
 gasoline:L('Gasolina','Gasoline'),diesel:L('Diésel','Diesel'),hybrid:L('Híbrido','Hybrid'),plugin_hybrid:L('Híbrido enchufable','Plug-in hybrid'),electric:L('Eléctrico','Electric'),lpg:L('Gas LP','LPG'),other:L('Otro','Other'),
 manual:L('Manual','Manual'),automatic:L('Automático','Automatic'),cvt:L('CVT','CVT'),
 sale:L('Venta','For sale'),rent:L('Alquiler','For rent'),
 house:L('Casa','House'),apartment:L('Apartamento','Apartment'),condo:L('Condominio','Condo'),lot:L('Lote','Lot'),office:L('Oficina','Office'),commercial:L('Local comercial','Commercial space'),
 warehouse:L('Bodega','Warehouse'),farm:L('Finca','Farm'),room:L('Habitación','Room'),
 restaurant:L('Restaurantes','Restaurants'),fuel:L('Gasolineras','Fuel stations'),pharmacy:L('Farmacias','Pharmacies'),grocery:L('Supermercados','Supermarkets'),
 vehicle_dealer:L('Agencias de vehículos','Vehicle dealers'),real_estate:L('Inmobiliarias','Real estate agencies'),
 // 2026-11-17 sections (dir_verticals ids); their `kind` values are labelled from place-verticals.ts.
 ...Object.fromEntries(PLACE_SECTIONS.filter(x=>x.added).map(x=>[x.id,L(x.nameEs,x.nameEn)])),
};
/** Example product per product-price section (the placeholder text of the «Producto» field). */
const PRODUCT_EXAMPLE:Partial<Record<SearchVertical,[string,string]>>={farmacias:['arroz 1 kg, acetaminofén','rice 1 kg, paracetamol'],supermercados:['arroz 1 kg, acetaminofén','rice 1 kg, paracetamol'],
 pulperias:['arroz 1 kg, leche','rice 1 kg, milk'],ferreterias:['cemento 50 kg, pintura','cement 50 kg, paint'],veterinarias:['alimento para perro 2 kg','dog food 2 kg']};
const SORT_LABELS:Record<SearchSort,{es:string;en:string}>={relevance:L('Más relevantes','Most relevant'),best_rated:L('Mejor calificados','Best rated'),
 distance:L('Más cercanos','Nearest'),price_asc:L('Precio: menor a mayor','Price: low to high'),price_desc:L('Precio: mayor a menor','Price: high to low'),newest:L('Más recientes','Newest')};
export const sortLabel=(s:SearchSort,en:boolean)=>SORT_LABELS[s][en?'en':'es'];

const field='flex flex-col gap-1 text-sm font-medium';
const input='min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7fab]';
const count=(facet:FacetValue[]|undefined,value:string)=>facet?.find(f=>String(f.value)===value)?.count;

function Select({name,label,options,values,facet,en,anyLabel}:{name:string;label:string;options:readonly string[];values:Values;facet?:FacetValue[];en:boolean;anyLabel:string}){
 return <label className={field}>{label}
  <select name={name} defaultValue={values[name]??''} className={input}>
   <option value="">{anyLabel}</option>
   {options.map(o=>{const c=count(facet,o);return <option key={o} value={o}>{OPTION_LABELS[o]?.[en?'en':'es']??o}{c!=null?` (${c})`:''}</option>;})}
  </select></label>;
}
function NumberField({name,label,values,min,max,step}:{name:string;label:string;values:Values;min?:number;max?:number;step?:number}){
 return <label className={field}>{label}<input type="number" inputMode="numeric" name={name} min={min} max={max} step={step} defaultValue={values[name]??''} className={input}/></label>;
}
function Text({name,label,values,list,placeholder}:{name:string;label:string;values:Values;list?:string;placeholder?:string}){
 return <label className={field}>{label}<input type="text" name={name} maxLength={80} list={list} placeholder={placeholder} defaultValue={values[name]??''} className={input+' placeholder:text-slate-500'} autoComplete="off"/></label>;
}

/** `panel`: rendered inside the places filters drawer (places-search-view.tsx), which brings its own title and close
 * button; the fields are then always open (no «Filtros» fold) and the buttons sit side by side. */
export function SearchFilters({vertical,values,facets,locale,action,sorts,panel=false}:{vertical:SearchVertical;values:Values;facets?:DirectoryFacets['facets']|null;locale:string;action:string;sorts?:SearchSort[];panel?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,any=t('Cualquiera','Any');
 const listing=isListingVertical(vertical),priceMode=placePriceMode(vertical);
 // Price sorts: listings and restaurants always; pharmacies/supermarkets only once a product is typed; never fuel stations.
 const priceSorts=listing||priceMode==='menu'||(priceMode==='product'&&!!values.product);
 // Sections with places that take no reviews (trámites, centros comerciales, educación, transporte) never offer the rating order.
 const sortOptions=(sorts??(['relevance','best_rated','distance',...(priceSorts?['price_asc','price_desc'] as const:[]),'newest'] as SearchSort[]))
  .filter(s=>s!=='best_rated'||listing||sectionRatingSort(vertical));
 const range=facets?.price&&facets.price.min!=null&&facets.price.max!=null?facets.price:null;
 const money=(n:number)=>proMoney(Math.round(n),en);
 const provinces=facets?.province?.map(p=>String(p.value))??[];
 // Filters the person set (the free text «q» and the order are not filters): shown on the phone «Filtros (n)» button.
 const activeFilters=Object.entries(values).filter(([k,v])=>!!v&&!['q','sort','cursor','page','lat','lng'].includes(k)).length;
 const grid=panel?'grid grid-cols-1 gap-3':'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1';
 const kinds=placeSection(vertical)?.kinds??[],example=PRODUCT_EXAMPLE[vertical]??PRODUCT_EXAMPLE.supermercados!;
 return <form method="get" action={action} role="search" aria-label={t('Buscar y filtrar','Search and filter')} className={`space-y-4 text-[#162543] ${panel?'':'rounded-2xl border border-slate-200 bg-white p-4'}`} data-search-filters={vertical}>
  <label className={field}>{t('¿Qué busca?','What are you looking for?')}
   <input type="search" name="q" maxLength={100} defaultValue={values.q??''} className={input} enterKeyHint="search"/></label>
  {(()=>{const fields=<>
  <fieldset className={grid}>
   <legend className="mb-2 text-base font-bold lg:text-sm">{t('Ubicación','Location')}</legend>
   <Text name="province" label={t('Provincia','Province')} values={values} list="dir-provinces" placeholder={t('Todas las provincias','All provinces')}/>
   <Text name="canton" label={t('Cantón','Canton')} values={values} placeholder={t('Todos los cantones','All cantons')}/>
   <datalist id="dir-provinces">{provinces.map(p=><option key={p} value={p}/>)}</datalist>
   {values.lat&&values.lng&&<><input type="hidden" name="lat" value={values.lat}/><input type="hidden" name="lng" value={values.lng}/>
    <NumberField name="radiusKm" label={t('Distancia máxima (km)','Maximum distance (km)')} values={values} min={1} max={100}/></>}
  </fieldset>

  {vertical==='vehiculos'&&<fieldset className={grid}>
   <legend className="mb-2 text-base font-bold lg:text-sm">{t('Vehículo','Vehicle')}</legend>
   <Select name="type" label={t('Tipo','Type')} options={VEHICLE_TYPES} values={values} facet={facets?.type} en={en} anyLabel={any}/>
   <label className={field}>{t('Marca','Make')}
    <select name="make" defaultValue={values.make??''} className={input}><option value="">{any}</option>
     {(facets?.make??[]).map(m=><option key={String(m.value)} value={String(m.value)}>{m.label??String(m.value)} ({m.count})</option>)}</select></label>
   <Text name="model" label={t('Modelo (opcional)','Model (optional)')} values={values}/>
   <NumberField name="yearMin" label={t('Año desde','Year from')} values={values} min={1950} max={2100}/>
   <NumberField name="yearMax" label={t('Año hasta','Year to')} values={values} min={1950} max={2100}/>
   <NumberField name="priceMin" label={t('Precio mínimo (₡)','Minimum price (₡)')} values={values} min={0} step={100000}/>
   <NumberField name="priceMax" label={t('Precio máximo (₡)','Maximum price (₡)')} values={values} min={0} step={100000}/>
   <NumberField name="kmMax" label={t('Kilometraje máximo','Maximum mileage (km)')} values={values} min={0} step={1000}/>
   <Select name="fuel" label={t('Combustible','Fuel')} options={VEHICLE_FUELS} values={values} facet={facets?.fuel} en={en} anyLabel={any}/>
   <Select name="transmission" label={t('Transmisión','Transmission')} options={VEHICLE_TRANSMISSIONS} values={values} facet={facets?.transmission} en={en} anyLabel={any}/>
   <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-1">{t('Precios en dólares se comparan en colones con el tipo de cambio registrado.','Prices in US dollars are compared in colones using the recorded exchange rate.')}</p>
  </fieldset>}

  {vertical==='inmuebles'&&<fieldset className={grid}>
   <legend className="mb-2 text-base font-bold lg:text-sm">{t('Propiedad','Property')}</legend>
   <Select name="operation" label={t('Operación','Operation')} options={PROPERTY_OPERATIONS} values={values} facet={facets?.operation} en={en} anyLabel={any}/>
   <Select name="type" label={t('Tipo','Type')} options={PROPERTY_TYPES} values={values} facet={facets?.type} en={en} anyLabel={any}/>
   <NumberField name="priceMin" label={t('Precio mínimo (₡)','Minimum price (₡)')} values={values} min={0} step={100000}/>
   <NumberField name="priceMax" label={t('Precio máximo (₡)','Maximum price (₡)')} values={values} min={0} step={100000}/>
   <NumberField name="bedroomsMin" label={t('Habitaciones (mínimo)','Bedrooms (minimum)')} values={values} min={0} max={50}/>
   <NumberField name="m2Min" label={t('Área mínima (m²)','Minimum area (m²)')} values={values} min={0}/>
   <NumberField name="m2Max" label={t('Área máxima (m²)','Maximum area (m²)')} values={values} min={0}/>
  </fieldset>}

  {priceMode&&<fieldset className={grid} data-price-filters={priceMode}>
   <legend className="mb-2 text-base font-bold lg:text-sm">{t('Precio','Price')}</legend>
   {priceMode==='product'&&<div className="sm:col-span-2 lg:col-span-1"><Text name="product" label={t(`Producto (por ejemplo: ${example[0]})`,`Product (for example: ${example[1]})`)} values={values}/></div>}
   {priceMode==='product'&&!values.product
    ?null
    :<>
     <NumberField name="priceMin" label={t('Precio mínimo (₡)','Minimum price (₡)')} values={values} min={0} step={priceMode==='menu'?500:100}/>
     <NumberField name="priceMax" label={t('Precio máximo (₡)','Maximum price (₡)')} values={values} min={0} step={priceMode==='menu'?500:100}/>
     {range&&<p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-1" data-price-range>{t('En estos resultados:','In these results:')} {money(range.min!)} – {money(range.max!)}</p>}
    </>}
  </fieldset>}

  {kinds.length>0&&<fieldset className={grid} data-kind-filter={vertical}>
   <label className={field}>{t('Tipo de lugar','Kind of place')}
    <select name="kind" defaultValue={values.kind??''} className={input}>
     <option value="">{t('Todos','All')}</option>
     {kinds.map(k=>{const c=count(facets?.kind,k.value);return <option key={k.value} value={k.value}>{en?k.en:k.es}{c!=null?` (${c})`:''}</option>;})}
    </select></label>
  </fieldset>}

  {!listing&&<fieldset className="space-y-2">
   <legend className="mb-2 text-base font-bold lg:text-sm">{t('Horario','Opening hours')}</legend>
   {(vertical==='lugares'||vertical==='agencias')&&<Select name="vertical" label={t('Sección','Section')} options={vertical==='agencias'?['vehicle_dealer','real_estate']:['restaurant','fuel','pharmacy','grocery','vehicle_dealer','real_estate',...PLACE_SECTIONS.filter(x=>x.added).map(x=>x.id)]} values={values} facet={facets?.vertical} en={en} anyLabel={t('Todas','All')}/>}
   <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="openNow" value="1" defaultChecked={values.openNow==='1'||values.openNow==='true'} className="h-5 w-5"/>
    {t('Abierto ahora','Open now')}{facets?.openNow!=null?` (${facets.openNow})`:''}</label>
   <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="open24h" value="1" defaultChecked={values.open24h==='1'||values.open24h==='true'} className="h-5 w-5"/>
    {t('Abierto 24 horas','Open 24 hours')}{facets?.open24h!=null?` (${facets.open24h})`:''}</label>
  </fieldset>}

  <label className={field}>{t('Ordenar por','Sort by')}
   <select name="sort" defaultValue={values.sort??'relevance'} className={input}>
    {sortOptions.map(s=><option key={s} value={s} disabled={s==='distance'&&!values.lat}>{sortLabel(s,en)}{s==='distance'&&!values.lat?t(' (requiere su ubicación)',' (needs your location)'):''}</option>)}
   </select></label>
  </>;return panel?<div className="space-y-4">{fields}</div>:<FiltersDisclosure en={en} active={activeFilters}>{fields}</FiltersDisclosure>;})()}
  {panel
   ?<div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-[#eef2f6] bg-white px-4 pb-1 pt-3">
    <a href={action} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-bold text-[#162543] hover:border-[#009FD9]">{t('Limpiar','Clear')}</a>
    <button type="submit" className="inline-flex h-11 flex-[2] items-center justify-center rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#162543]">{t('Aplicar filtros','Apply filters')}</button>
   </div>
   :<div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
   <button type="submit" className="min-h-11 rounded-xl bg-[#162543] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7fab]">{t('Aplicar filtros','Apply filters')}</button>
   <a href={action} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold">{t('Limpiar','Clear')}</a>
  </div>}
 </form>;
}

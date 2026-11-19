import {CR_PROVINCES} from '@/lib/directory/listing-public';
import {COMPARE_SORTS,CONFIDENCE_LABEL,crDay,money,perUnitLabel,sourceLine,stalenessLine,
 type CompareSort,type PriceComparison,type PriceQuery,type PriceSearchResult} from '@/lib/directory/price-compare';
import {ChipGroup,hrefWith} from './listing-home-parts';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';

/**
 * LOCAL PRO ONLY (multivertical P3): public price comparison /precios (/en/precios). Server component, plain GET
 * form (works without JavaScript). Every price shows its source, date, staleness and confidence; unit price is
 * normalized per kg / litre / unit; the default order is the lowest unit price first (current prices before out-of-date
 * ones), ties by place name. Never payment. Prescription medicines are never searchable (filtered in SQL).
 * 2026-11-19: the order/sources/prescription explanations moved to the Terms («Directorio de lugares y negocios») and
 * /como-ordenamos; this screen keeps only the per-price labels (source, date, staleness, confidence).
 */
const field='flex flex-col gap-1 text-sm font-medium';
const input='min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7fab]';
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7fab]';
const SORT_LABEL:Record<CompareSort,[string,string]>={unit_price:['Menor precio por unidad de medida','Lowest unit price'],price:['Menor precio del producto','Lowest item price'],place:['Nombre del comercio','Store name']};

type Props={locale:string;query:PriceQuery;invalid?:boolean;unavailable?:boolean;search:PriceSearchResult|null;comparison:PriceComparison|null};

export function PriceComparePage({locale,query,invalid,unavailable,search,comparison}:Props){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,base=(en?'/en':'')+'/precios';
 const keep={q:query.q??undefined,tipo:query.verticalParam??undefined,provincia:query.province??undefined,orden:query.sort==='unit_price'?undefined:query.sort,
  precioMin:query.priceMin!=null?String(query.priceMin):undefined,precioMax:query.priceMax!=null?String(query.priceMax):undefined};
 return <main id="contenido" data-price-compare className="mx-auto max-w-6xl space-y-6 px-4 py-5 text-[#162543] sm:py-6">
  {/* Same compact title strip as the results screens (accent bar + short H1); the explanations live in the Terms. */}
  <header className="flex items-center gap-2.5">
   <span className="h-5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden/>
   <h1 className="text-lg font-bold leading-tight text-[#162543]">{t('Comparar precios','Compare prices')}</h1>
  </header>
  <form method="get" action={base} role="search" aria-label={t('Buscar un producto','Search for a product')} data-price-search-form
   className={`grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:items-end ${query.item?'lg:grid-cols-[2fr_1fr_1fr_auto]':'lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]'}`}>
   <label className={field}>{t('Producto o código de barras','Product or barcode')}
    <input type="search" name="q" maxLength={100} defaultValue={query.q??''} className={input} enterKeyHint="search" autoComplete="off"/></label>
   <label className={field}>{t('Tipo de comercio','Type of store')}
    <select name="tipo" defaultValue={query.verticalParam??''} className={`${input} ${SELECT_CLASS}`} style={SELECT_STYLE}>
     <option value="">{t('Todos','All')}</option><option value="supermercados">{t('Supermercados','Supermarkets')}</option><option value="farmacias">{t('Farmacias (venta libre)','Pharmacies (over the counter)')}</option>
    </select></label>
   <label className={field}>{t('Provincia','Province')}
    <select name="provincia" defaultValue={query.province??''} className={`${input} ${SELECT_CLASS}`} style={SELECT_STYLE}>
     <option value="">{t('Todo el país','Whole country')}</option>{CR_PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
    </select></label>
   {!query.item&&<PriceRangeFields query={query} en={en}/>}
   <button type="submit" className={`min-h-11 rounded-xl bg-[#162543] px-5 font-semibold text-white hover:bg-[#0f1a30] ${ring}`}>{t('Buscar','Search')}</button>
  </form>
  {(query.priceMin!=null||query.priceMax!=null)&&<p className="text-sm text-slate-700" data-price-range-note>{t('Rango de precio del producto: ','Product price range: ')}
   {query.priceMin!=null?money(query.priceMin,'CRC',en):t('sin mínimo','no minimum')} – {query.priceMax!=null?money(query.priceMax,'CRC',en):t('sin máximo','no maximum')}.</p>}

  {invalid&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3">{t('Revise la búsqueda e intente de nuevo.','Please check your search and try again.')}</p>}
  {unavailable&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3">{t('Los precios no están disponibles en este momento. Intente de nuevo en unos minutos.','Prices are not available right now. Please try again in a few minutes.')}</p>}

  {search&&!comparison&&<section aria-labelledby="price-results" className="space-y-3" data-price-results>
   <h2 id="price-results" className="text-lg font-bold">{t('Productos','Products')}</h2>
   {search.items.length===0
    ?<p data-price-empty>{t('No encontramos ese producto. Pruebe con otra palabra o con el código de barras.','We did not find that product. Try another word or the barcode.')}</p>
    :<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{search.items.map(i=><li key={i.slug}>
     <a href={hrefWith(base,{...keep,producto:i.slug})} data-price-search-item={i.slug} className={`block min-h-11 rounded-2xl border border-[#d7e1ea] p-4 hover:border-[#009FD9] ${ring}`}>
      <span className="block font-semibold">{i.name}{i.presentation?<span className="font-normal text-slate-600"> · {i.presentation}</span>:null}</span>
      <span className="block text-sm text-slate-700">{i.brand?`${i.brand} · `:''}{i.offers===1?t('1 comercio con precio vigente','1 store with a current price'):t(`${i.offers} comercios con precio vigente`,`${i.offers} stores with a current price`)}</span>
     </a></li>)}</ul>}
  </section>}

  {comparison&&<Comparison c={comparison} en={en} base={base} keep={keep} query={query}/>}
  {query.item&&!comparison&&!unavailable&&<p data-price-empty>{t('Ese producto no está disponible.','That product is not available.')}</p>}

 </main>;
}

/** ₡ range inputs (whole colones). On the search form they travel to the product links; on a comparison they filter it. */
function PriceRangeFields({query,en}:{query:PriceQuery;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 return <>
  <label className={field}>{t('Precio mínimo (₡)','Minimum price (₡)')}
   <input type="number" inputMode="numeric" name="precioMin" min={0} max={99999999} step={1} defaultValue={query.priceMin??''} className={input} data-price-min/></label>
  <label className={field}>{t('Precio máximo (₡)','Maximum price (₡)')}
   <input type="number" inputMode="numeric" name="precioMax" min={0} max={99999999} step={1} defaultValue={query.priceMax??''} className={input} data-price-max/></label>
 </>;
}

function Comparison({c,en,base,keep,query}:{c:PriceComparison;en:boolean;base:string;keep:Record<string,string|undefined>;query:PriceQuery}){
 const t=(es:string,english:string)=>en?english:es,unit=c.item.normalizedUnit;
 const current=c.offers.filter(o=>!o.observation.stale);
 return <section aria-labelledby="price-compare-title" className="space-y-5" data-price-comparison={c.item.slug}>
  <div className="space-y-1">
   <p><a href={hrefWith(base,{q:keep.q,tipo:keep.tipo,provincia:keep.provincia,precioMin:keep.precioMin,precioMax:keep.precioMax})} className={`text-sm font-semibold underline underline-offset-2 ${ring}`}>{t('← Volver a los productos','← Back to products')}</a></p>
   <h2 id="price-compare-title" className="text-2xl font-bold">{c.item.name}{c.item.presentation?<span className="font-normal text-slate-600"> · {c.item.presentation}</span>:null}</h2>
   <p className="text-sm text-slate-700">{c.item.brand?`${c.item.brand} · `:''}{c.item.gtin?`${t('Código de barras','Barcode')} ${c.item.gtin} · `:''}{t('Precio comparado ','Price compared ')}{perUnitLabel(unit,en)}</p>
  </div>
  <form method="get" action={base} aria-label={t('Filtrar por precio','Filter by price')} data-price-range-form
   className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
   {Object.entries({...keep,producto:c.item.slug,precioMin:undefined,precioMax:undefined}).map(([k,v])=>v?<input key={k} type="hidden" name={k} value={v}/>:null)}
   <PriceRangeFields query={query} en={en}/>
   <button type="submit" className={`min-h-11 rounded-xl border border-[#162543] px-5 font-semibold ${ring}`}>{t('Filtrar por precio','Filter by price')}</button>
  </form>
  <ChipGroup id="price-sort" title={t('Ordenar por','Sort by')} chips={COMPARE_SORTS.map(s=>({key:s,label:SORT_LABEL[s][en?1:0],
   href:hrefWith(base,{...keep,producto:c.item.slug,orden:s==='unit_price'?undefined:s}),current:c.sort===s}))}/>
  {c.regions.length>0&&<section aria-labelledby="price-regions" className="space-y-2" data-price-regions>
   <h3 id="price-regions" className="text-lg font-bold">{t('Por provincia (precios vigentes)','By province (current prices)')}</h3>
   <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">{c.regions.map(r=><li key={r.province} data-price-region={r.province} className="rounded-xl bg-[#F7FAFC] p-3 text-sm">
    <span className="block font-semibold">{r.province||t('Sin provincia','No province')}</span>
    <span className="block">{t('Desde ','From ')}{money(r.minUnitPrice,'CRC',en)} · {t('mediana ','median ')}{money(r.medianUnitPrice,'CRC',en)} {perUnitLabel(unit,en)}</span>
    <span className="block text-slate-600">{r.offers===1?t('1 comercio','1 store'):t(`${r.offers} comercios`,`${r.offers} stores`)}</span>
   </li>)}</ul>
  </section>}
  <section aria-labelledby="price-offers" className="space-y-3">
   <h3 id="price-offers" className="text-lg font-bold">{t('Precios por comercio','Prices by store')} <span className="font-normal text-slate-600">({c.total})</span></h3>
   {c.offers.length===0?<p data-price-empty>{t('Todavía no hay precios para este producto en esta zona.','There are no prices for this product in this area yet.')}</p>:
   <ol className="space-y-3" data-price-offers>{c.offers.map((o,idx)=>{const ob=o.observation;return <li key={o.place.slug} data-price-offer={o.place.slug} data-price-stale={ob.stale?'1':undefined}
    className={`rounded-2xl border p-4 ${ob.stale?'border-slate-200 bg-slate-50 text-slate-600':'border-[#d7e1ea] bg-white'}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
     <a href={`${en?'/en':''}/lugar/${o.place.slug}`} className={`text-base font-semibold underline-offset-2 hover:underline ${ring}`}>{!ob.stale&&idx<current.length?<span className="sr-only">{idx+1}. </span>:null}{o.place.name}</a>
     <p className="text-xl font-bold" data-price-value={ob.price}>{money(ob.price,ob.currency,en)}
      {ob.stale&&<span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold">{t('desactualizado','out of date')}</span>}</p>
    </div>
    <p className="text-sm">{[o.place.locality??o.place.canton,o.place.province].filter(Boolean).join(', ')}</p>
    <p className="text-sm font-semibold" data-price-unit>{money(o.unitPrice,ob.currency,en)} {perUnitLabel(unit,en)}</p>
    <p className="text-sm" data-price-source>{sourceLine(ob,en)}</p>
    <p className="text-sm" data-price-staleness>{stalenessLine(ob,en)} · {t('Confianza: ','Confidence: ')}{CONFIDENCE_LABEL[ob.confidence][en?'en':'es']}</p>
    {o.provenance&&<p className="text-sm text-slate-600" data-price-provenance>{t('Archivo oficial publicado el ','Official file published on ')}{crDay(o.provenance.publicationDate+'T12:00:00-06:00',en)} · <a href={o.provenance.sourceUrl} rel="noopener noreferrer" target="_blank" className={`inline-flex min-h-11 items-center underline sm:min-h-0 ${ring}`}>{t('ver fuente','view source')}</a></p>}
   </li>;})}</ol>}
  </section>
  <p className="text-xs text-slate-600">{t('Consultado el ','Checked on ')}{crDay(c.asOf,en)}.</p>
 </section>;
}

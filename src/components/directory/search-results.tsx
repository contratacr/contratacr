import {encodeCursor,placePriceMode,type DirectorySearchResult} from '@/lib/directory/search-schemas';
import {ListingCard} from './listing-card';
import {PlaceCard} from './place-card';
import {ResultsMapToggle} from '@/components/maps/results-map-toggle';

/**
 * LOCAL PRO ONLY (multivertical F6): result list for /restaurantes, /farmacias, /supermercados, /gasolineras,
 * /vehiculos and /inmuebles. Server component, not imported yet. Keyset pagination with a plain «Ver más» link
 * (no JavaScript needed; the link keeps every current parameter and only adds the cursor). One column at 390 px,
 * two columns from md. Used by the classified listings (/vehiculos, /inmuebles); places use places-section-home.tsx.
 */
export function SearchResults({result,locale,basePath,params,title}:{result:DirectorySearchResult;locale:string;basePath:string;params:Record<string,string|undefined>;title:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const next=result.nextCursor?(()=>{const p=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v&&k!=='cursor')p.set(k,v);p.set('cursor',encodeCursor(result.nextCursor!));return `${basePath}?${p}`;})():null;
 const reserved=result.items.some(i=>i.kind==='listing'&&i.status==='reserved');
 return <section aria-labelledby="dir-results-title" className="space-y-4 text-[#162543]" data-search-results={result.vertical}>
  <header className="space-y-1">
   <h2 id="dir-results-title" className="text-xl font-bold">{title}</h2>
   {result.priceProduct&&<p className="text-sm text-slate-700" data-price-product={result.priceProduct.slug}>{t('Precios de: ','Prices for: ')}<strong>{result.priceProduct.name}{result.priceProduct.presentation?` (${result.priceProduct.presentation})`:''}</strong>. {t('Solo precios vigentes; los comercios sin ese precio aparecen al final.','Current prices only; stores without that price are listed last.')}{' '}
    <a className="underline underline-offset-2" href={`${en?'/en':''}/precios?producto=${encodeURIComponent(result.priceProduct.slug)}`}>{t('Comparar este producto','Compare this product')}</a></p>}
   {!result.priceProduct&&params.product&&placePriceMode(result.vertical)==='product'&&<p className="text-sm text-slate-700" data-price-product-missing>
    {t(`No encontramos "${params.product}" en el catálogo de precios. Pruebe con otro nombre o con el código de barras.`,`We did not find "${params.product}" in the price catalog. Try another name or the barcode.`)}</p>}
   {reserved&&<p className="text-sm text-slate-600">{t('Los anuncios "Reservado" siguen visibles por si la negociación no se concreta.','"Reserved" listings stay visible in case the deal does not go through.')}</p>}
  </header>
  {/* Optional map of this page of results (MapLibre + OpenFreeMap, downloaded only when opened). */}
  <ResultsMapToggle locale={locale} points={result.items.flatMap(i=>i.kind==='place'&&i.location?[{id:i.slug,lat:i.location.lat,lng:i.location.lng,label:i.name,href:`${en?'/en':''}/lugar/${i.slug}`}]:[])}/>
  {result.items.length===0
   ?<p role="status" className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">{t('No encontramos resultados con estos filtros. Pruebe con menos filtros u otra zona.','No results with these filters. Try fewer filters or another area.')}</p>
   :<ol className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={t('Resultados','Results')}>
    {result.items.map(item=><li key={item.key}>{item.kind==='place'?<PlaceCard item={item} locale={locale}/>:<ListingCard item={item} locale={locale}/>}</li>)}
   </ol>}
  {next&&<nav aria-label={t('Más resultados','More results')} className="flex justify-center">
   <a href={next} rel="next" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-5 font-semibold">{t('Ver más resultados','Show more results')}</a></nav>}
 </section>;
}

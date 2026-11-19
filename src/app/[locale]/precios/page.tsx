import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PriceComparePage} from '@/components/directory/price-compare-page';
import {parsePriceQuery,type PriceComparison,type PriceQuery,type PriceSearchResult} from '@/lib/directory/price-compare';
import {comparePrices,searchPriceItems} from '@/lib/directory/price-compare-server';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical P3, development only like /lugar and the section pages): /precios and /en/precios.
// Plain GET: ?q= searches the catalogue (name, brand, barcode), ?producto= compares one product across stores,
// ?provincia= and ?tipo=supermercados|farmacias filter, ?precioMin=/?precioMax= (₡, whole colones) limit the price
// of each offer (2026-11-17), ?orden=unit_price|price|place sorts. Never payment.
export const dynamic='force-dynamic';
type SP=Record<string,string|string[]|undefined>;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/precios';
 const title=en?'Compare prices in Costa Rica':'Comparar precios en Costa Rica';
 const description=en?'Supermarket and over-the-counter pharmacy prices by store and province, with source and date.':'Precios de supermercado y farmacia (venta libre) por comercio y provincia, con fuente y fecha.';
 return {title,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},robots:{index:false,follow:true},openGraph:{title,description,type:'website'}};
}
export default async function PricesRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SP>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,parsed=parsePriceQuery(await searchParams);
 const empty:PriceQuery={q:null,item:null,province:null,vertical:null,verticalParam:null,sort:'unit_price',priceMin:null,priceMax:null};
 if(!parsed.ok)return <DirectoryShell><PriceComparePage locale={locale} query={empty} invalid search={null} comparison={null}/></DirectoryShell>;
 const query=parsed.query;
 let search:PriceSearchResult|null=null,comparison:PriceComparison|null=null,unavailable=false,invalid=false;
 if(query.item){
  const r=await comparePrices(query.item,{province:query.province,vertical:query.vertical,sort:query.sort,priceMin:query.priceMin,priceMax:query.priceMax});
  if(r.ok)comparison=r.result;else if(r.reason==='invalid')invalid=true;else unavailable=true;
 }else if(query.q){
  const r=await searchPriceItems(query.q,query.vertical);
  if(r.ok)search=r.result;else unavailable=true;
 }
 return <DirectoryShell><PriceComparePage locale={locale} query={query} invalid={invalid} unavailable={unavailable} search={search} comparison={comparison}/></DirectoryShell>;
}

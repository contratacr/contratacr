import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PriceComparePage,type PricePageData} from '@/components/directory/price-compare-page';
import {SectionHeaderTitle} from '@/components/mobile/section-header-title';
import {categoryLabel,parsePriceQuery,type PriceQuery} from '@/lib/directory/price-compare';
import {comparePrices,nationalFuelPrices,priceHistory,priceOverview,searchPriceItems} from '@/lib/directory/price-compare-server';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical P3, development only like /negocios and the section pages): /precios and /en/precios.
// Plain GET: ?q= searches the catalogue (name, brand, barcode), ?producto= compares one product across stores,
// ?categoria= lists one catalogue category, ?provincia= and ?tipo=supermercados|farmacias filter, ?precioMin=/?precioMax=
// (₡, whole colones) limit the price of each offer (2026-11-17), ?orden=unit_price|price|place sorts. Never payment.
// 2026-11-19 redesign: the landing (no q/producto) shows the categories with product counts, the products with prices,
// the national ARESEP fuel prices and the business/report invitations; a product adds its 90-day lowest-price history.
export const dynamic='force-dynamic';
type SP=Record<string,string|string[]|undefined>;
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/precios';
 const title=en?'Compare prices in Costa Rica':'Comparar precios en Costa Rica';
 const description=en?'Supermarket and over-the-counter pharmacy prices by store and province, with source and date.':'Precios de supermercado y farmacia (venta libre) por comercio y provincia, con fuente y fecha.';
 return {title:`${title} | ContrataCR`,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},robots:{index:false,follow:true},openGraph:{title,description,type:'website'}};
}
export default async function PricesRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SP>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,parsed=parsePriceQuery(await searchParams);
 const empty:PriceQuery={q:null,item:null,province:null,vertical:null,verticalParam:null,sort:'unit_price',priceMin:null,priceMax:null,category:null};
 const query=parsed.ok?parsed.query:empty;
 const data:PricePageData={invalid:!parsed.ok,unavailable:false,search:null,comparison:null,history:null,overview:null,fuel:null};
 if(parsed.ok&&query.item){
  const [r,h]=await Promise.all([
   comparePrices(query.item,{province:query.province,vertical:query.vertical,sort:query.sort,priceMin:query.priceMin,priceMax:query.priceMax}),
   priceHistory(query.item,{province:query.province,vertical:query.vertical}),
  ]);
  if(r.ok)data.comparison=r.result;else if(r.reason==='invalid')data.invalid=true;else data.unavailable=true;
  if(h.ok)data.history=h.result;
 }else if(parsed.ok&&query.q){
  const r=await searchPriceItems(query.q,query.vertical);
  if(r.ok)data.search=r.result;else data.unavailable=true;
 }
 // Landing / category / empty search: the overview (categories + products) and the national fuel prices.
 if(!query.item){
  const [o,fuel]=await Promise.all([priceOverview(query.vertical,query.category,query.category?60:12),nationalFuelPrices()]);
  if(o.ok)data.overview=o.result;
  data.fuel=fuel;
 }
 // Phones (owner 2026-11-27): a category or a product is a child screen of /precios, so the bar is «← Lácteos» /
 // «← Producto» (server-painted) and the arrow returns to the list it came from (with no history: the same address the
 // desktop back link uses). The landing and the search results keep the site bar.
 const en=locale==='en',p=(k:string,v:string|number|null|undefined)=>v!=null&&v!==''?[[k,String(v)]]:[];
 const parentOf=(extra:[string,string][])=>{const qs=new URLSearchParams([...p('q',query.q),...p('tipo',query.verticalParam),...p('provincia',query.province),...extra]).toString();return '/precios'+(qs?'?'+qs:'');};
 const child=!parsed.ok?null:query.item?{title:en?'Product':'Producto',parent:parentOf([...p('precioMin',query.priceMin),...p('precioMax',query.priceMax)] as [string,string][])}
  :query.category?{title:categoryLabel(query.category,en),parent:parentOf([])}:null;
 return <DirectoryShell section={child?{title:child.title,centrado:true}:undefined}>{child&&<SectionHeaderTitle title={child.title} fallbackHref={child.parent} tambienEnLaWeb centrado/>}<PriceComparePage locale={locale} query={query} data={data}/></DirectoryShell>;
}

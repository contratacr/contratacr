import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PlacesSectionHome} from '@/components/directory/places-section-home';
import {NationalFuelPrices} from '@/components/directory/place-prices';
import {createAdminClient} from '@/lib/supabase/admin';
import type {PublicPriceCurrent} from '@/lib/directory/price-schemas';
import {loadDirectorySearch,type SearchPageParams} from '@/lib/directory/search-server';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical F6, development only like /lugar): section page /gasolineras. dir_search with the section
// fixed by the page; plain GET filters; order never depends on payment (/como-ordenamos).
export const dynamic='force-dynamic';
export async function generateMetadata({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/gasolineras';
 const title=en?'Fuel stations in Costa Rica':'Gasolineras en Costa Rica',description=en?'Fuel stations in Costa Rica with hours, services and the national ARESEP price.':'Gasolineras de Costa Rica con horario, servicios y el precio nacional de ARESEP.';
 // Search/filter results (any query parameter: province, open now, page…) stay out of the index; the plain section is indexed.
 const filtered=Object.keys(await searchParams).length>0;
 return {title:`${title} | ContrataCR`,description,...(filtered?{robots:{index:false,follow:true}}:{}),alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title,description,type:'website'}};
}
export default async function SectionRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SearchPageParams>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,sp=await searchParams,en=locale==='en',basePath=(en?'/en':'')+'/gasolineras';
 const page=await loadDirectorySearch('gasolineras',sp);
 // Fuel prices are national (ARESEP): one banner instead of a price per station.
 const national=await createAdminClient().rpc('public_price_current',{p_place_slug:null,p_item_slug:null});
 const banner=national.error||!national.data?null:<NationalFuelPrices prices={national.data as PublicPriceCurrent} locale={locale}/>;
 return <PlacesSectionHome section="gasolineras" locale={locale} page={page} basePath={basePath} banner={banner}/>;
}

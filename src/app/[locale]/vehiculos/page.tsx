import type {Metadata} from 'next';
import {DIRECTORY_LISTINGS_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {VehiclesHome} from '@/components/directory/vehicles-home';
import {searchSlots} from '@/components/directory/search-section';
import {loadDirectorySearch,type SearchPageParams} from '@/lib/directory/search-server';

// LOCAL PRO ONLY (V4 + F6, development only like /lugar): /vehiculos landing with the shared directory search.
// Make chips: only makes with at least one public listing (neutral alphabetical order).
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/vehiculos';
 const title=en?'Vehicles in Costa Rica':'Vehículos en Costa Rica';
 const description=en?'Cars and motorcycles from dealers and private sellers in Costa Rica.':'Carros y motos de agencias y particulares en Costa Rica.';
 return {title:`${title} | ContrataCR`,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title,description,type:'website'}};
}
export default async function VehiclesRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SearchPageParams>}){
 // Classified listings are OFF by owner decision (feature-flags.ts): 404 while the flag is off.
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)notFound();
 const {locale}=await params,sp=await searchParams,en=locale==='en',basePath=(en?'/en':'')+'/vehiculos';
 const [rows,page]=await Promise.all([createAdminClient().from('public_vehicle_listings').select('make_slug,make_name').limit(2000),loadDirectorySearch('vehiculos',sp)]);
 const makes=[...new Map((rows.data??[]).map(r=>[r.make_slug as string,{slug:r.make_slug as string,name:r.make_name as string}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
 const {filters,results}=searchSlots({vertical:'vehiculos',locale,page,basePath,title:en?'Vehicles for sale':'Vehículos en venta'});
 return <DirectoryShell><VehiclesHome locale={locale} makes={makes} selected={{type:page.values.type,make:page.values.make,province:page.values.province}}
  sellHref={(en?'/en':'')+'/dashboard/pro/inventario/vehiculos'} filters={filters} results={results}/></DirectoryShell>;
}

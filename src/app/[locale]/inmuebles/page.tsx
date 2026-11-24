import type {Metadata} from 'next';
import {DIRECTORY_LISTINGS_ENABLED,DIR_ENABLED} from '@/lib/directory/feature-flags';
import {notFound} from 'next/navigation';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {PropertiesHome} from '@/components/directory/properties-home';
import {searchSlots} from '@/components/directory/search-section';
import {loadDirectorySearch,type SearchPageParams} from '@/lib/directory/search-server';

// LOCAL PRO ONLY (R1 + F6, development only like /lugar): /inmuebles landing with the shared directory search.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/inmuebles';
 const title=en?'Real estate in Costa Rica':'Inmuebles en Costa Rica';
 const description=en?'Houses, apartments and lots for sale or rent in Costa Rica.':'Casas, apartamentos y lotes en venta o alquiler en Costa Rica.';
 return {title:`${title} | ContrataCR`,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title,description,type:'website'}};
}
export default async function PropertiesRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SearchPageParams>}){
 // Classified listings are OFF by owner decision (feature-flags.ts): 404 while the flag is off.
 if(!DIR_ENABLED||!DIRECTORY_LISTINGS_ENABLED)notFound();
 const {locale}=await params,sp=await searchParams,en=locale==='en',basePath=(en?'/en':'')+'/inmuebles';
 const page=await loadDirectorySearch('inmuebles',sp),op=page.values.operation;
 const {filters,results}=searchSlots({vertical:'inmuebles',locale,page,basePath,title:en?'Properties':'Propiedades'});
 return <DirectoryShell><PropertiesHome locale={locale} selected={{operation:op==='sale'||op==='rent'?op:undefined,type:page.values.type,province:page.values.province}}
  sellHref={(en?'/en':'')+'/dashboard/pro/inventario/inmuebles'} filters={filters} results={results}/></DirectoryShell>;
}

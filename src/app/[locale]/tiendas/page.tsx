import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PlacesSectionHome} from '@/components/directory/places-section-home';
import {loadDirectorySearch,type SearchPageParams} from '@/lib/directory/search-server';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (multivertical F6, development only like /negocios): section page /tiendas (2026-11-26, OSM import, migration 537; place-verticals.ts). dir_search with the section
// fixed by the page; plain GET filters; order never depends on payment (/como-ordenamos).
export const dynamic='force-dynamic';
export async function generateMetadata({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale}=await params,en=locale==='en',path='/tiendas';
 const title=en?'Stores in Costa Rica':'Tiendas en Costa Rica',description=en?'Clothing, shoes, phones, electronics, furniture and more stores in Costa Rica, with hours and phone.':'Tiendas de ropa, zapatos, celulares, electrónica, muebles y más en Costa Rica, con horario y teléfono.';
 // Search/filter results (any query parameter: province, open now, page…) stay out of the index; the plain section is indexed.
 const filtered=Object.keys(await searchParams).length>0;
 return {title:`${title} | ContrataCR`,description,...(filtered?{robots:{index:false,follow:true}}:{}),alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},openGraph:{title,description,type:'website'}};
}
export default async function SectionRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<SearchPageParams>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,sp=await searchParams,en=locale==='en',basePath=(en?'/en':'')+'/tiendas';
 const page=await loadDirectorySearch('tiendas',sp,{defaultSort:'best_rated'});
 return <PlacesSectionHome section="tiendas" locale={locale} page={page} basePath={basePath}/>;
}

import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {businessPage} from '@/lib/directory/business-page';
import {BusinessNav} from '@/components/directory/business-nav';
import {MenuEditor} from '@/components/pro/menu-editor';
import {ClaimPlaceNextStep} from '@/components/pro/place-next-step';
import type {EditorMenu} from '@/lib/directory/menu-schemas';
import {DINING_VERTICALS} from '@/lib/directory/business-access';

// Launch without Pro (2026-11-18): menu editor of a claimed restaurant/café, free for its owner/managers (they publish
// prices: «only admin/manager publishes prices» — Pro company members keep their own route). No menu-from-photo here.
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function BusinessMenuRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{lugar?:string}>}){
 const {locale}=await params,{lugar}=await searchParams;
 const {user,db,places:all,sections,prefix,en}=await businessPage(locale,'/menu');
 const t=(es:string,english:string)=>en?english:es;
 const box=(children:ReactNode)=><main id="contenido" data-business-menu-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10"><BusinessNav locale={locale} current="menu" sections={sections}/>{children}</main>;
 const places=all.filter(p=>(DINING_VERTICALS as readonly string[]).includes(p.vertical));
 if(!places.length)return box(<><h1 className="text-2xl font-bold">{t('Menú','Menu')}</h1>
  <div data-menu-no-place><ClaimPlaceNextStep locale={locale} sections={['restaurantes','cafes']} intro={{es:'Primero reclame su restaurante o café. Luego podrá administrar el menú aquí.',en:'First claim your restaurant or café. Then you can manage the menu here.'}}/></div></>);
 const place=places.find(p=>p.slug===lugar)??places[0]!;
 const read=await db.rpc('pro_menu_read',{p_actor:user.id,p_member:null,p_place:place.id});
 if(read.error||!read.data)return box(<p role="alert">{t('No se pudo cargar el menú. Recargue la página.','Could not load the menu. Please reload the page.')}</p>);
 return box(<>
  {places.length>1&&<nav aria-label={t('Restaurantes','Restaurants')}><ul className="flex flex-wrap gap-2">{places.map(p=><li key={p.id}><a aria-current={p.id===place.id?'page':undefined} className="inline-flex min-h-11 items-center rounded-full border px-4" href={`${prefix}/dashboard/negocio/menu?lugar=${p.slug}`}>{p.name}</a></li>)}</ul></nav>}
  <MenuEditor initial={read.data as EditorMenu} locale={locale} endpoint="/api/negocio/menu" expectedActor={user.id} canPublish photoImport={false}/>
 </>);
}

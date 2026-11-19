import type {ReactNode} from 'react';
import {notFound,redirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {MenuEditor} from '@/components/pro/menu-editor';
import {proHasModule} from '@/lib/pro/api-access-module';
import type {EditorMenu} from '@/lib/directory/menu-schemas';
import {memberCan,proPlaceHubState} from '@/lib/directory/pro-place-hub';
import {PlaceModuleNav} from '@/components/pro/place-module-nav';
import {ClaimPlaceNextStep,EditionNextStep} from '@/components/pro/place-next-step';
import {proPageWorkspace} from '@/lib/pro/page-workspace';

// LOCAL PRO ONLY (P2, development only): menu editor of a claimed restaurant the account manages.
// ?lugar=<slug> picks the place when the account manages more than one. Gaps round (2026-11-17): a company member
// working in an owner's company (Equipo) edits that WORKSPACE's claimed places (actor = owner, member = person; the SQL
// re-checks menu.write and, for publishing or changing a published price, price.write = admin/manager only). Module 'menu' (edition restaurantes);
// writes go through /api/pro/menu (same SQL authorization: active manager of a claimed restaurant).
export const dynamic='force-dynamic';
export default async function MenuRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{lugar?:string}>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale}=await params,{lugar}=await searchParams,en=locale==='en',prefix=en?'/en':'',t=(es:string,english:string)=>en?english:es;
 const user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/menu'));
 const db=createAdminClient(),ws=await proPageWorkspace(db,user.id),actor=ws.actor;
 // Pending fixes round: links to the other directory modules of this account and back to Pro.
 const hub=await proPlaceHubState(db,actor,ws.member);
 const box=(children:ReactNode)=><main id="contenido" className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10"><PlaceModuleNav locale={locale} current="menu" hub={hub}/>{children}</main>;
 if(!await proHasModule(db,actor,'menu'))return box(<><h1 className="text-2xl font-bold">{t('Menú','Menu')}</h1>
  <div data-menu-module-off><EditionNextStep locale={locale} feature={{es:'el menú',en:'the menu'}} text={{es:'El menú está en la edición «Restaurantes» de ContrataCR Pro.',en:'The menu belongs to the «Restaurants» edition of ContrataCR Pro.'}}/></div></>);
 const managed=await db.from('dir_place_managers').select('place_id').eq('user_id',actor).eq('status','active');
 const ids=(managed.data??[]).map(r=>r.place_id as string);
 const rows=ids.length?(await db.from('dir_places').select('id,slug,name,vertical_id,claim_status').in('id',ids)).data??[]:[];
 const places=(rows as {id:string;slug:string;name:string;vertical_id:string;claim_status:string}[])
  .filter(p=>(p.vertical_id==='restaurant'||p.vertical_id==='cafe_bar')&&p.claim_status==='claimed').sort((a,b)=>a.name.localeCompare(b.name,'es'));
 if(!places.length)return box(<><h1 className="text-2xl font-bold">{t('Menú','Menu')}</h1>
  <div data-menu-no-place><ClaimPlaceNextStep locale={locale} sections={['restaurantes','cafes']} edition="restaurantes" intro={{es:'Primero reclame su restaurante o café. Luego podrá administrar el menú aquí.',en:'First claim your restaurant or café. Then you can manage the menu here.'}}/></div></>);
 if(ws.member&&!await memberCan(db,ws.member,actor,'menu.write'))return box(<><h1 className="text-2xl font-bold">{t('Menú','Menu')}</h1>
  <p data-menu-role-readonly role="note" className="rounded-2xl bg-slate-50 p-5">{t('Su rol en esta empresa no permite editar el menú. Pida a un administrador que le asigne el rol de colaborador o encargado.','Your role in this company does not allow editing the menu. Ask an administrator to give you the member or manager role.')}</p></>);
 const place=places.find(p=>p.slug===lugar)??places[0]!;
 const read=await db.rpc('pro_menu_read',{p_actor:actor,p_member:ws.member,p_place:place.id});
 const prices=ws.member?await memberCan(db,ws.member,actor,'price.write'):true;
 if(read.error||!read.data)return box(<p role="alert">{t('No se pudo cargar el menú. Recargue la página.','Could not load the menu. Please reload the page.')}</p>);
 return box(<>
  {places.length>1&&<nav aria-label={t('Restaurantes','Restaurants')}><ul className="flex flex-wrap gap-2">{places.map(p=><li key={p.id}><a aria-current={p.id===place.id?'page':undefined} className="inline-flex min-h-11 items-center rounded-full border px-4" href={`${prefix}/dashboard/pro/menu?lugar=${p.slug}`}>{p.name}</a></li>)}</ul></nav>}
  <MenuEditor initial={read.data as EditorMenu} locale={locale} expectedActor={actor} canPublish={prices}/>
 </>);
}

import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {MeHome,type MeCounts,type MePhoto} from '@/components/account/me-home';
import {canOffer} from '@/lib/auth/capabilities';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {EMPLEOS_VISIBLE} from '@/lib/feature-flags';

// «Yo» (Mi cuenta): the Me tab of the directory app. Needs a session; never indexed. Counters come from the person's own
// directory reviews/photos; a counter the server cannot read is hidden by the page, never faked.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params,en=locale==='en';return {title:en?'Me':'Yo',robots:{index:false,follow:false}};
}
async function count(table:string,col:string,id:string,extra?:{col:string;value:string}):Promise<number|null>{
 try{
  let q=createAdminClient().from(table).select('id',{count:'exact',head:true}).eq(col,id);
  if(extra)q=q.eq(extra.col,extra.value);
  const r=await q;return r.error?null:(r.count??0);
 }catch{return null;}
}
/** 547: the person's 12 latest place photos (any state but removed) with the place, for «Impacto · Fotos». */
async function latestPhotos(id:string):Promise<MePhoto[]>{
 try{
  const r=await createAdminClient().from('dir_place_media').select('id,status,dir_places(name,slug)').eq('uploader_id',id).neq('status','removed').order('created_at',{ascending:false}).limit(12);
  if(r.error)return [];
  return (r.data??[]).flatMap(m=>{const p=(Array.isArray(m.dir_places)?m.dir_places[0]:m.dir_places) as {name?:string;slug?:string}|null;
   return p?.slug?[{id:m.id as string,status:(m.status==='active'?'approved':m.status) as MePhoto['status'],placeName:p.name??p.slug,slug:p.slug}]:[];});
 }catch{return [];}
}
export default async function MeRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(`${prefix}/login?redirect=${encodeURIComponent(prefix+'/yo')}`);
 const [reviews,photos]=await Promise.all([count('dir_reviews','author_id',user.id,{col:'moderation_status',value:'published'}),count('dir_place_media','uploader_id',user.id,{col:'status',value:'active'})]);
 const counts:MeCounts={reviews,photos,added:null};
 const myPhotos=await latestPhotos(user.id);
 const meta=user.user_metadata??{},name=String(meta.full_name??meta.name??user.email?.split('@')[0]??(en?'Me':'Yo')).trim()||(en?'Me':'Yo');
 const isPro=canOffer(user),h=await headers(),host=h.get('host')??'localhost',proto=h.get('x-forwarded-proto')??'http';
 return <DirectoryShell><main id="contenido">
  <MeHome locale={locale} name={name} counts={counts} isPro={isPro} empleos={EMPLEOS_VISIBLE} shareUrl={`${proto}://${host}${prefix}/`} dashboardHref={isPro?'/dashboard/profesional?mode=offer':'/dashboard/profesional?mode=use'} beenCount={null} myPhotos={myPhotos}/>
 </main></DirectoryShell>;
}

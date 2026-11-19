import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {isClientProjectId} from '@/lib/pro/client-project-route';
import {ClientProjectPage} from '@/components/pro/client-project-page';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;return{title:locale==='en'?'My project | ContrataCR':'Mi proyecto | ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};}
/**
 * Fix 14: «Mi proyecto» / «My project» — the linked customer's job as its own page (Back and deep links work).
 * Development only, like the Pro job page. The server checks with the appointment detail reader that the
 * signed-in account is the CUSTOMER of this request and that the request is linked to a job; anyone else
 * (the professional, another account, a disabled account) gets a 404, never the customer's data.
 */
export default async function ClientProject({params}:{params:Promise<{locale:string;id:string}>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale,id}=await params,prefix=locale==='en'?'/en':'';
 let requestId:string;try{requestId=decodeURIComponent(id);}catch{notFound();}
 if(!isClientProjectId(requestId))notFound();
 const user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/mi-proyecto/'+requestId));
 const db=createAdminClient();
 const profile=await db.from('profiles').select('is_disabled').eq('id',user.id).maybeSingle();
 if(profile.error)throw new Error('client_project_profile');
 if(!profile.data||profile.data.is_disabled)notFound();
 const detail=await db.rpc('pro_appointment_detail',{p_actor:user.id,p_id:requestId,p_after:null});
 if(detail.error)throw new Error('client_project_detail');
 const request=(detail.data as {request?:{id?:string;side?:string;workId?:string|null;origin?:string|null}}|null)?.request;
 if(!request||request.id!==requestId||request.side!=='client'||!request.workId)notFound();
 return <ClientProjectPage requestId={requestId} origin={request.origin??null}/>;
}

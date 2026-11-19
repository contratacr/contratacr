import type {Metadata} from 'next';
import {notFound, redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {SubcontractorPortal} from '@/components/pro/subcontractor-portal';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;return{title:locale==='en'?'My subcontractor jobs | ContrataCR':'Mis trabajos como subcontratista | ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer'};}
// Round 8: subcontractor portal (any registered account). Development only; scope enforced in SQL.
export default async function SubcontractorPage({params}:{params:Promise<{locale:string}>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale}=await params,prefix=locale==='en'?'/en':'',user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/subcontratista'));
 return <SubcontractorPortal/>;
}

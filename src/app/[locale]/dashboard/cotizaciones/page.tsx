import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {PrivateEstimateClientInbox} from '@/components/pro/private-estimate-client-inbox';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;return{title:locale==='en'?'Estimates | ContrataCR':'Cotizaciones | ContrataCR',robots:{index:false,follow:false},alternates:{canonical:(locale==='en'?'/en':'')+'/dashboard/cotizaciones'}};}
export default async function CustomerEstimatesPage({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV!=='development')notFound();const {locale}=await params,prefix=locale==='en'?'/en':'',user=await safeGetUser(await createClient());if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/cotizaciones'));return <PrivateEstimateClientInbox/>;}

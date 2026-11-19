import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {ProjectInvitationAccept} from '@/components/pro/project-invitation-accept';
import {ProjectInvitationLogin} from '@/components/pro/project-invitation-login';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;return{title:locale==='en'?'Join a job | ContrataCR':'Unirse a un proyecto | ContrataCR',robots:{index:false,follow:false},referrer:'no-referrer',alternates:{canonical:(locale==='en'?'/en':'')+'/dashboard/unirse-proyecto'}};}
// Round 1: customer accepts a job invitation. Development only; the code stays in the URL fragment.
export default async function JoinProjectPage({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV!=='development')notFound();const {locale}=await params,prefix=locale==='en'?'/en':'',user=await safeGetUser(await createClient());// Round 7A: a server redirect would drop the #codigo fragment; the client keeps it for after sign-in.
if(!user)return <ProjectInvitationLogin loginPath={prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/unirse-proyecto')}/>;return <ProjectInvitationAccept/>;}

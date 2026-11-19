import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {TeamShell} from '@/components/pro/team-shell';
export const dynamic='force-dynamic';
/** Team membership is checked by the scoped API; collaborators need no paid plan. */
export default async function TeamPage({params}:{params:Promise<{locale:string}>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale}=await params,prefix=locale==='en'?'/en':'',user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/equipo'));
 return <TeamShell accountId={user.id}/>;
}

import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {TeamShell} from '@/components/pro/team-shell';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {PRO_ENABLED} from '@/lib/pro/enabled';
export const dynamic='force-dynamic';
/** Team membership is checked by the scoped API; collaborators need no paid plan. */
export default async function TeamPage({params}:{params:Promise<{locale:string}>}){
 if(!PRO_ENABLED)notFound();
 const {locale}=await params,prefix=prefijoDeIdioma(locale),user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/equipo'));
 return <TeamShell accountId={user.id}/>;
}

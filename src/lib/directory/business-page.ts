import {prefijoDeIdioma} from '../prefijo-de-idioma';
import 'server-only';
import {notFound,redirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DIR_ENABLED} from './feature-flags';
import {businessPlaces,businessSections} from './business-access';

// Launch without Pro (2026-11-18): shared start of every «Mi negocio» page (/dashboard/negocio/*): directory launch flag,
// sign-in (back to the same page), and the claimed places the account manages as itself (no Pro workspace).
export async function businessPage(locale:string,path:string){
 if(!DIR_ENABLED)notFound();
 const prefix=prefijoDeIdioma(locale);
 const user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/negocio'+path));
 const db=createAdminClient(),places=await businessPlaces(db,user.id);
 return {user,db,places,sections:businessSections(places),prefix,en:locale==='en'};
}

import 'server-only';
import {requirePro} from '@/lib/pro/server-access';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import type {ProSpaceProfile} from '@/components/pro/pro-space';
/** Pro space profile for the Pro document and the job route (Round 9: shared by both pages). */
export async function proSpaceProfile(returnTo:string,locale:string):Promise<ProSpaceProfile>{
 const user=await requirePro({returnTo,locale});
 const db=await createClient();
 // Round 7C: a company member working in this owner's company (requirePro returned the owner's id).
 const real=await safeGetUser(db),memberId=real&&real.id!==user.id?real.id:null;
 const result=await db.from('professionals').select('id,business_name,slug,allow_phone_call,call_phone,whatsapp').eq('profile_id',user.id).maybeSingle();
 if(result.error)throw new Error('Could not load Pro profile');
 const pro=result.data;
 return {actorId:user.id,name:pro?.business_name||String(user.user_metadata?.full_name||'ContrataCR Pro'),slug:pro?.slug??null,professional:!!pro?.id,callsEnabled:!!pro?.allow_phone_call&&!!(pro?.call_phone||pro?.whatsapp),memberId};
}

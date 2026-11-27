import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {DIR_HEALTH_ENABLED} from '@/lib/directory/feature-flags';
import {buildPlaceRequest,requestPlaceId,requestPlaceSlug} from '@/lib/directory/place-request';

// «Agregar mi empresa» (sign-up, «Empresa o local»; owner 2026-11-27): POST {actionId, place} → a DRAFT place with source
// `owner` (dir_place_mutate create; not public). Staff review it in /admin/directorio «Lugares nuevos». Signed-in only;
// at most a few open requests per account.
const MAX_OPEN=5;
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión para enviar la solicitud.');
 const limited=await enforceRateLimit(req,'dir-place-request-'+user.id,5,60*60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const built=buildPlaceRequest(raw);
 if(!built.ok)return dirFail(400,'invalid_'+built.field.replace(/[^a-zA-Z0-9]/g,'').slice(0,30),'Revise los datos.');
 if(!DIR_HEALTH_ENABLED&&built.place.vertical==='health')return dirFail(400,'invalid_vertical','Revise los datos.');
 const db=createAdminClient();
 const open=await db.from('dir_place_actions').select('input').eq('actor_id',user.id).eq('input->>action','create').eq('input->source->>id','owner').limit(50);
 if(open.error)return dirDbError(open.error);
 const ids=(open.data??[]).map(r=>(r.input as {placeId?:string}).placeId).filter((x):x is string=>!!x);
 if(ids.length>=MAX_OPEN){
  const drafts=await db.from('dir_places').select('id',{count:'exact',head:true}).in('id',ids).eq('status','draft');
  if((drafts.count??0)>=MAX_OPEN)return dirFail(429,'too_many_requests','Ya tiene varias solicitudes en revisión. Espere la respuesta del equipo.');
 }
 const placeId=await requestPlaceId(user.id,built.actionId);
 const r=await db.rpc('dir_place_mutate',{p_actor:user.id,p_input:{action:'create',actionId:built.actionId,placeId,revision:0,
  source:{id:'owner'},place:{...built.place,slug:requestPlaceSlug(String(built.place.name),placeId)}}});
 if(r.error)return dirDbError(r.error);
 return dirOk({ok:true,status:'pending'});
}

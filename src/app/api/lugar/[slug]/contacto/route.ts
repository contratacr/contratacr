import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {CONTACT_CHANNELS} from '@/lib/directory/review-schemas';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirContactId,dirDbError,dirDeviceId,dirEnabledOnly,dirFail,dirOk,dirPepper,dirSetContactId,hmacHex} from '@/lib/directory/public-route';

// LOCAL PRO ONLY (multivertical F5, development only): records that this device contacted the place (Llamar /
// WhatsApp) → dir_place_contact_record. No session needed. visitorHash = HMAC(DIR_VISITOR_PEPPER, device id from an
// httpOnly cookie); the contactId is kept 90 days in an httpOnly cookie per place and lets the visitor review later
// without an account. Same device + place → same contact (idempotent).
const bodySchema=z.object({channel:z.enum(CONTACT_CHANNELS)}).strict();
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-contact',30,60_000);if(limited)return limited;
 const pepper=dirPepper('DIR_VISITOR_PEPPER');if(!pepper)return dirFail(503,'unavailable');
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 let raw:unknown;try{raw=await proBoundedJson(req,512);}catch{return dirFail(400,'invalid');}
 const body=bodySchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const device=(await dirDeviceId(true))!,visitorHash=await hmacHex(pepper,'device:'+device);
 const contactId=await dirContactId(slug)??crypto.randomUUID();
 const result=await createAdminClient().rpc('dir_place_contact_record',{p_actor:null,p_slug:slug,p_input:{contactId,channel:body.data.channel,visitorHash}});
 if(result.error){
  // A stale cookie (other place, other device, other channel) starts a new contact once.
  if((result.error as {code?:string}).code==='22023'){
   const fresh=crypto.randomUUID(),retry=await createAdminClient().rpc('dir_place_contact_record',{p_actor:null,p_slug:slug,p_input:{contactId:fresh,channel:body.data.channel,visitorHash}});
   if(retry.error)return dirDbError(retry.error);
   await dirSetContactId(slug,fresh);return dirOk({ok:true});
  }
  return dirDbError(result.error);
 }
 await dirSetContactId(slug,contactId);
 return dirOk({ok:true});
}

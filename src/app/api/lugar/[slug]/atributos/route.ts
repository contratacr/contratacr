import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {ATTR_ANSWERS} from '@/lib/directory/place-questions';

// LOCAL (548, 2026-11-27): «¿Sabe si este lugar…?». POST {key, answer: yes|no|unsure} → dir_place_attribute_answer
// (signed in, not the place's managers, 60 a day). Answers {ok, state:{confirmed, answered}}.
const bodySchema=z.object({key:z.string().regex(/^[a-zA-Z]{2,40}$/),answer:z.enum(ATTR_ANSWERS)}).strict();
const HINTS:Record<string,[number,string]>={dir_attr_not_asked:[400,'not_asked'],dir_attr_own_place:[403,'own_place'],dir_attr_cap:[429,'cap']};
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-attr-answer',30,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login');
 let raw:unknown;try{raw=await proBoundedJson(req,512);}catch{return dirFail(400,'invalid');}
 const body=bodySchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const r=await createAdminClient().rpc('dir_place_attribute_answer',{p_actor:user.id,p_input:{slug,key:body.data.key,answer:body.data.answer}});
 if(r.error){const h=r.error.hint&&HINTS[r.error.hint];if(h)return dirFail(h[0],h[1]);return dirFail(r.error.code==='P0002'?404:r.error.code==='22023'?400:503,r.error.code==='P0002'?'not_found':r.error.code==='22023'?'invalid':'unavailable');}
 return dirOk(r.data);
}

import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {dirDbError,dirEnabledOnly,dirOk} from '@/lib/directory/public-route';
import {DIR_HEALTH_ENABLED} from '@/lib/directory/feature-flags';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';

// «Agregar o reclamar mi empresa» (sign-up, owner 2026-11-27): GET ?q=<name> → up to 8 published places whose name
// contains every word (dir_places.name_normalized, same normalisation as dir_normalize). A plain name lookup on purpose:
// the ranked dir_search across every section is too slow for multi-word names to answer while the person types.
// Public data only (name, section, zone); the claim itself happens on /negocios/<slug>/reclamar.
const norm=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-business-lookup',60,60_000);if(limited)return limited;
 const words=norm(new URL(req.url).searchParams.get('q')??'').split(' ').filter(w=>w.length>=2).slice(0,5);
 if(!words.length)return dirOk({items:[]});
 let query=createAdminClient().from('dir_places').select('slug,name,vertical_id,locality,admin_area_1,admin_area_2').eq('status','published');
 for(const w of words)query=query.like('name_normalized',`%${w}%`);
 if(!DIR_HEALTH_ENABLED)query=query.neq('vertical_id','health');
 const r=await query.order('name').limit(8);
 if(r.error)return dirDbError(r.error);
 const en=new URL(req.url).searchParams.get('locale')==='en';
 return dirOk({items:(r.data??[]).map(p=>{const s=PLACE_SECTIONS.find(x=>x.id===p.vertical_id);return {slug:p.slug,name:p.name,
  section:s?(en?s.nameEn:s.nameEs):'',area:[p.locality??p.admin_area_2,p.admin_area_1].filter(Boolean).join(', ')};})});
}

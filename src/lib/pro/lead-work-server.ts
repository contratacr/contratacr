import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';

type Db=ReturnType<typeof createAdminClient>;
/** Checks the Pro access of the owner and that the lead (manual opportunity or request) belongs to them. */
export async function leadAnchorExists(db:Db,owner:string,kind:'manual'|'request',leadId:string):Promise<'ok'|'missing'|'forbidden'>{
 const access=await db.rpc('pro_request_pipeline_owner',{p_actor:owner});
 if(access.error)return access.error.code==='42501'?'forbidden':(()=>{throw Error('access');})();
 const r=kind==='manual'
  ?await db.from('pro_lead_center_records').select('id').eq('owner_id',owner).eq('kind','manual').eq('id',leadId).maybeSingle()
  :await db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('id',leadId).maybeSingle();
 if(r.error)throw Error('lookup');
 return r.data?'ok':'missing';
}

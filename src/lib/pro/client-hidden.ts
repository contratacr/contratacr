import type {createAdminClient} from '@/lib/supabase/admin';

/**
 * Row 33: documents the professional hid from the customer view of a job (presentation only, never an access
 * revocation). Read through the customer reader so the owner's preview matches. Any failure shows everything:
 * hiding must never be the reason a customer cannot see something they are entitled to.
 */
export type HiddenDocuments={contract:Set<string>;quote:Set<string>;file:Set<string>};
export async function proHiddenDocuments(db:ReturnType<typeof createAdminClient>,reader:string,requestId:string):Promise<HiddenDocuments>{
 const none:HiddenDocuments={contract:new Set(),quote:new Set(),file:new Set()};
 try{
  const r=await db.rpc('pro_client_presentation_client',{p_actor:reader,p_request:requestId});
  const h=(r.data as {hidden?:Record<string,unknown>}|null)?.hidden;if(r.error||!h)return none;
  const set=(v:unknown)=>new Set(Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[]);
  return {contract:set(h.contract),quote:set(h.quote),file:set(h.file)};
 }catch{return none;}
}

import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {INSTAGRAM_IMPORT_ENABLED} from './enabled';
import {pickInstagramAdapter} from './adapter';
import type {InstagramAdapter,InstagramToken} from './types';

/**
 * Server side of "Importar desde Instagram": connection rows (instagram_connections, service role only — migration 542) and
 * the provenance log (instagram_media_imports). The access token is read here and never put in a response.
 */
type Db=ReturnType<typeof createAdminClient>;
export const igHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export const igFail=(status:number,reason:string,error='No se pudo completar la operación.')=>Response.json({error,reason},{status,headers:igHeaders});
export const IG_STATE_COOKIE='cc_ig_state';

/** null = the feature answers 404 (flag off, or a production build without the Meta variables). */
export function instagramAdapterOrNull():InstagramAdapter|null{return INSTAGRAM_IMPORT_ENABLED?pickInstagramAdapter():null;}

export type IgConnection={provider:'meta'|'sandbox';igUserId:string;username:string|null;accessToken:string;expiresAt:string|null};
export async function getConnection(db:Db,userId:string,adapter:InstagramAdapter):Promise<IgConnection|null>{
 const r=await db.from('instagram_connections').select('provider,ig_user_id,username,access_token,token_expires_at').eq('user_id',userId).maybeSingle();
 if(r.error)throw r.error;
 const row=r.data;if(!row)return null;
 // A token of the other adapter (e.g. a sandbox connection after the Meta variables were set) or an expired one is useless.
 if(row.provider!==adapter.provider||(row.token_expires_at&&Date.parse(row.token_expires_at)<Date.now()))return null;
 return{provider:row.provider,igUserId:row.ig_user_id,username:row.username,accessToken:row.access_token,expiresAt:row.token_expires_at};
}
export async function saveConnection(db:Db,userId:string,provider:InstagramAdapter['provider'],t:InstagramToken){
 const r=await db.from('instagram_connections').upsert({user_id:userId,provider,ig_user_id:t.igUserId,username:t.username,access_token:t.accessToken,
  token_expires_at:t.expiresAt,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(r.error)throw r.error;
}
export async function deleteConnection(db:Db,userId:string){
 const r=await db.from('instagram_connections').delete().eq('user_id',userId);if(r.error)throw r.error;
}

export type ImportTarget={kind:'place';placeId:string}|{kind:'portfolio';professionalId:string};
const targetId=(t:ImportTarget)=>t.kind==='place'?t.placeId:t.professionalId;

/**
 * Media ids already imported to this target whose photo still exists: a place photo still pending/active, or a portfolio URL
 * still present in the saved success cases. A photo removed afterwards (or a cancelled case draft) can be imported again.
 */
export async function liveImportedMediaIds(db:Db,userId:string,target:ImportTarget):Promise<Set<string>>{
 const log=await db.from('instagram_media_imports').select('media_id,result_ref').eq('user_id',userId).eq('target_kind',target.kind).eq('target_id',targetId(target));
 if(log.error)throw log.error;
 const rows=log.data??[];if(!rows.length)return new Set();
 if(target.kind==='place'){
  const live=await db.from('dir_place_media').select('id').eq('place_id',target.placeId).in('status',['pending','active']).in('id',rows.map(r=>r.result_ref));
  if(live.error)throw live.error;
  const ids=new Set((live.data??[]).map(r=>r.id as string));
  return new Set(rows.filter(r=>ids.has(r.result_ref)).map(r=>r.media_id));
 }
 const pro=await db.from('professionals').select('portfolio_items,portfolio_urls').eq('id',target.professionalId).maybeSingle();
 if(pro.error)throw pro.error;
 const saved=JSON.stringify([pro.data?.portfolio_items??null,pro.data?.portfolio_urls??null]);
 return new Set(rows.filter(r=>saved.includes(JSON.stringify(r.result_ref).slice(1,-1))).map(r=>r.media_id));
}
export async function recordImport(db:Db,userId:string,target:ImportTarget,m:{mediaId:string;permalink:string|null;resultRef:string}){
 const r=await db.from('instagram_media_imports').upsert({user_id:userId,target_kind:target.kind,target_id:targetId(target),media_id:m.mediaId,permalink:m.permalink,
  result_ref:m.resultRef,created_at:new Date().toISOString()},{onConflict:'user_id,target_kind,target_id,media_id'});
 if(r.error)throw r.error;
}

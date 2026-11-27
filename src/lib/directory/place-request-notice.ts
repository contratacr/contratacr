import 'server-only';
import {sendNotificationPush} from '@/lib/push/notify';
import {localizedNotificationCopy} from '@/lib/localized-notification';
import {sendLaunchEmail} from './launch-email';

// «Agregar mi empresa» (2026-11-27): when the team publishes or rejects a requested place (/admin/directorio «Lugares
// nuevos»), the person who asked hears it: an in-app notification (types place_request_published / _rejected,
// migration 545; the published one links to /lugar/<slug>/reclamar) and an e-mail through the directory e-mail
// adapter (launch-email.ts; mock outbox in local dev). Idempotent: the notification id and the e-mail key derive from
// the place and the decision, so a replayed decision never notifies twice. Never throws.
type AdminDb=ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;
export type PlaceRequestDecision='publish'|'reject';

async function derivedId(text:string){
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).slice(0,16);
 h[6]=(h[6]&0x0f)|0x50;h[8]=(h[8]&0x3f)|0x80;
 const x=Array.from(h,b=>b.toString(16).padStart(2,'0')).join('');
 return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}

export const placeRequestClaimLink=(slug:string)=>`/lugar/${encodeURIComponent(slug)}/reclamar`;

export async function notifyPlaceRequestDecision(db:AdminDb,input:{placeId:string;decision:PlaceRequestDecision}){
 try{
  const act=await db.from('dir_place_actions').select('actor_id').eq('input->>action','create').eq('input->source->>id','owner')
   .eq('input->>placeId',input.placeId).limit(1).maybeSingle();
  const userId=act.data?.actor_id as string|undefined;if(act.error||!userId)return {notified:false};
  const place=await db.from('dir_places').select('slug,name').eq('id',input.placeId).maybeSingle();
  if(place.error||!place.data)return {notified:false};
  const {slug,name}=place.data as {slug:string;name:string};
  const type=input.decision==='publish'?'place_request_published':'place_request_rejected';
  // Stored in Spanish; the list re-renders it in the reader's language (localized-notification.ts).
  const copy=localizedNotificationCopy({type,title:'',message:'',data:{place_name:name}},'es');
  const link=input.decision==='publish'?placeRequestClaimLink(slug):undefined;
  const row={id:await derivedId(`place-request-notice:${input.placeId}:${input.decision}:${userId}`),user_id:userId,type,title:copy.title,message:copy.message,
   data:{place_id:input.placeId,place_name:name,place_slug:slug,...(link?{link}:{})}};
  const ins=await db.from('notifications').upsert(row,{onConflict:'id',ignoreDuplicates:true}).select('id');
  if(ins.error){console.error('[place-request-notice] notification failed',ins.error.code);return {notified:false};}
  if(!ins.data?.length)return {notified:false,duplicate:true};
  await sendNotificationPush({userId,title:row.title,message:row.message,data:row.data}).catch(()=>{});
  const who=await db.from('profiles').select('email').eq('id',userId).maybeSingle();
  const to=(who.data?.email as string|null)??'';
  const app=(process.env.NEXT_PUBLIC_APP_URL||'https://contratacr.com').replace(/\/$/,'');
  const mail=to?await sendLaunchEmail({kind:type,locale:'es',to,eventId:`${input.placeId}:${input.decision}`,data:{placeName:name,link:link?app+link:undefined}}):null;
  return {notified:true,email:mail?.status??'no_address'};
 }catch(e){console.error('[place-request-notice] failed',e instanceof Error?e.message:'error');return {notified:false};}
}

import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Result-card extras (2026-11-19, Yelp result-card model): up to 4 approved, non-seed photos (same order as the place gallery; `photo` = the first) and a one-line snippet of the newest published review, for the places of ONE results page
 * (≤ ~25 slugs). Three bounded reads with the service client; only public data (approved photos, published reviews)
 * leaves this function. Any error → no extras (the card falls back to the section tile and no snippet).
 */
import type {PlaceHour} from './open-status';
/** `hours`: dir_place_hours rows for the Maps-like status line; `reservation`/`whatsapp`: what the owner turned on. */
export type CardExtra={photo:string|null;photos:string[];snippet:string|null;hours?:PlaceHour[];reservation?:boolean;whatsapp?:string|null;
 /** Website, only for the sections whose card shows «Sitio web» (lodging and education, owner 2026-11-26). */website?:string|null};
const MAX_PHOTOS=4;
const CARD_WEBSITE=new Set(['lodging','education']);
export async function placeCardExtras(slugs:string[]):Promise<Record<string,CardExtra>>{
 const out:Record<string,CardExtra>={};
 const list=[...new Set(slugs)].slice(0,40);if(!list.length)return out;
 try{
  const db=createAdminClient();
  const places=await db.from('dir_places').select('id,slug,vertical_id,website').in('slug',list).in('status',['published','closed_permanently']);
  if(places.error||!places.data?.length)return out;
  const bySlug=new Map(places.data.map(p=>[p.id as string,p.slug as string]));const ids=[...bySlug.keys()];
  const [media,reviews,hours,reservations,orders]=await Promise.all([
   db.from('dir_place_media').select('place_id,url,sort,created_at').in('place_id',ids).eq('kind','photo').eq('status','active').neq('origin','seed')
    .order('sort',{ascending:true}).order('created_at',{ascending:false}).limit(ids.length*MAX_PHOTOS),
   db.from('dir_reviews').select('place_id,comment,created_at').in('place_id',ids).eq('moderation_status','published')
    .order('created_at',{ascending:false}).limit(ids.length*3),
   db.from('dir_place_hours').select('place_id,weekday,opens,closes').in('place_id',ids).limit(ids.length*21),
   db.from('dir_reservation_settings').select('place_id').in('place_id',ids).eq('enabled',true),
   db.from('dir_place_order_links').select('place_id,channel,value').in('place_id',ids).eq('channel','whatsapp'),
  ]);
  const ensure=(s:string)=>(out[s]??={photo:null,photos:[],snippet:null});
  for(const p of places.data)if(CARD_WEBSITE.has(p.vertical_id as string)&&typeof p.website==='string'&&/^https?:\/\//i.test(p.website))ensure(p.slug as string).website=p.website;
  for(const h of hours.data??[]){const s=bySlug.get(h.place_id as string);if(!s)continue;const e=ensure(s);(e.hours??=[]).push({weekday:Number(h.weekday),opens:String(h.opens).slice(0,5),closes:String(h.closes).slice(0,5)});}
  for(const r of reservations.data??[]){const s=bySlug.get(r.place_id as string);if(s)ensure(s).reservation=true;}
  for(const o of orders.data??[]){const s=bySlug.get(o.place_id as string);if(s)ensure(s).whatsapp=String(o.value);}
  for(const m of media.data??[]){const s=bySlug.get(m.place_id as string);if(!s)continue;out[s]??={photo:null,photos:[],snippet:null};if(out[s].photos.length>=MAX_PHOTOS)continue;out[s].photos.push(String(m.url));out[s].photo??=String(m.url);}
  for(const r of reviews.data??[]){const s=bySlug.get(r.place_id as string);if(!s)continue;out[s]??={photo:null,photos:[],snippet:null};out[s].snippet??=String(r.comment);}
 }catch{/* extras are optional */}
 return out;
}

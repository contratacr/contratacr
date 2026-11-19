import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';

/**
 * Result-card extras (2026-11-19, Yelp result-card model): the cover photo (first approved, non-seed photo, same order
 * as the place gallery) and a one-line snippet of the newest published review, for the places of ONE results page
 * (≤ ~25 slugs). Three bounded reads with the service client; only public data (approved photos, published reviews)
 * leaves this function. Any error → no extras (the card falls back to the section tile and no snippet).
 */
export type CardExtra={photo:string|null;snippet:string|null};
export async function placeCardExtras(slugs:string[]):Promise<Record<string,CardExtra>>{
 const out:Record<string,CardExtra>={};
 const list=[...new Set(slugs)].slice(0,40);if(!list.length)return out;
 try{
  const db=createAdminClient();
  const places=await db.from('dir_places').select('id,slug').in('slug',list).in('status',['published','closed_permanently']);
  if(places.error||!places.data?.length)return out;
  const bySlug=new Map(places.data.map(p=>[p.id as string,p.slug as string]));const ids=[...bySlug.keys()];
  const [media,reviews]=await Promise.all([
   db.from('dir_place_media').select('place_id,url,sort,created_at').in('place_id',ids).eq('kind','photo').eq('status','active').neq('origin','seed')
    .order('sort',{ascending:true}).order('created_at',{ascending:false}).limit(ids.length*3),
   db.from('dir_reviews').select('place_id,comment,created_at').in('place_id',ids).eq('moderation_status','published')
    .order('created_at',{ascending:false}).limit(ids.length*3),
  ]);
  for(const m of media.data??[]){const s=bySlug.get(m.place_id as string);if(!s)continue;out[s]??={photo:null,snippet:null};out[s].photo??=String(m.url);}
  for(const r of reviews.data??[]){const s=bySlug.get(r.place_id as string);if(!s)continue;out[s]??={photo:null,snippet:null};out[s].snippet??=String(r.comment);}
 }catch{/* extras are optional */}
 return out;
}

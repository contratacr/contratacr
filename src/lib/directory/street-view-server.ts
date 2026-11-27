import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {mapillaryImageUrl,streetViewSrc,type StreetView} from './street-view';

/**
 * «Vista de la calle» (Mapillary, CC BY-SA 4.0) for places without photos: cached choice of
 * scripts/directory/mapillary-streetview.mjs (dir_place_street_view, migration 543). Only 'found' rows of the given places;
 * the image itself is served by /api/vista-calle/<placeId>. Any error → no street views (the page shows no photo).
 */
export async function placeStreetViews(placeIds:string[],db=createAdminClient()):Promise<Map<string,StreetView>>{
 const out=new Map<string,StreetView>();
 const ids=[...new Set(placeIds)].slice(0,60);if(!ids.length)return out;
 try{
  const r=await db.from('dir_place_street_view').select('place_id,image_id,creator,captured_at').in('place_id',ids).eq('status','found');
  if(r.error)return out;
  for(const x of r.data??[]){
   if(!x.image_id||!x.creator)continue;
   out.set(x.place_id as string,{imageId:String(x.image_id),creator:String(x.creator),capturedAt:x.captured_at?String(x.captured_at):null,
    pageUrl:mapillaryImageUrl(String(x.image_id)),src:streetViewSrc(x.place_id as string)});
  }
 }catch{/* optional */}
 return out;
}

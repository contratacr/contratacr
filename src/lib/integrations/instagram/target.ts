import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';
import {placePhotoActor} from '@/lib/directory/place-photo-add';
import type {ImportTarget} from './server';

type Db=ReturnType<typeof createAdminClient>;
export type ResolvedTarget=
 |{kind:'place';target:ImportTarget&{kind:'place'};slug:string;actor:string;member:string|null}
 |{kind:'portfolio';target:ImportTarget&{kind:'portfolio'}};
/**
 * Where an import goes, and whether this person may put photos there: a directory place they manage (or manage for the Pro
 * company they work in, role with listing.publish), or their own professional profile (success cases).
 */
export async function resolveImportTarget(db:Db,userId:string,kind:unknown,slug:unknown):Promise<ResolvedTarget|{error:number;reason:string}>{
 if(kind==='place'){
  if(!DIR_ENABLED)return{error:404,reason:'not_found'};
  const s=placeSlugSchema.safeParse(slug);if(!s.success)return{error:404,reason:'not_found'};
  const place=await db.from('dir_places').select('id').eq('slug',s.data).maybeSingle();
  if(place.error)return{error:503,reason:'unavailable'};if(!place.data)return{error:404,reason:'not_found'};
  const who=await placePhotoActor(db,userId,place.data.id as string);
  if(!who.manager)return{error:403,reason:'not_manager'};
  return{kind:'place',target:{kind:'place',placeId:place.data.id as string},slug:s.data,actor:who.actor,member:who.member};
 }
 if(kind==='portfolio'){
  const pro=await db.from('professionals').select('id').eq('profile_id',userId).maybeSingle();
  if(pro.error)return{error:503,reason:'unavailable'};if(!pro.data)return{error:404,reason:'not_found'};
  return{kind:'portfolio',target:{kind:'portfolio',professionalId:pro.data.id as string}};
 }
 return{error:400,reason:'invalid'};
}

import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import type {ListSuggestion} from '@/components/directory/my-lists-tabs';
import type {DirectorySearchResult} from '@/lib/directory/search-schemas';
import {withoutDisabledVerticals} from '@/lib/directory/feature-flags';

/** «¿Ya ha estado aquí?» suggestions of «Mis listas» (best rated places), for /listas and the «Mi panel» section. */
export async function listSuggestions(en:boolean):Promise<ListSuggestion[]>{
 try{
  const r=await createAdminClient().rpc('dir_search',{p_vertical:'lugares',p_q:null,p_filters:{},p_lat:null,p_lng:null,p_radius_km:null,p_sort:'best_rated',p_cursor:null,p_limit:14});
  if(r.error||!r.data)return [];
  return withoutDisabledVerticals((r.data as DirectorySearchResult).items).flatMap(i=>i.kind==='place'?[{slug:i.slug,name:i.name,area:i.address.locality??i.address.adminArea2??'',kinds:en?i.vertical.nameEn:i.vertical.nameEs}]:[]);
 }catch{return [];}
}

import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadDirectorySearch} from './search-server';
import {comparePrices,searchPriceItems} from './price-compare-server';
import {directoryAnswer,type DirectoryToolBackend,type DirectoryToolResult,type ToolLocale} from './assistant-tools';
import type {PlaceSearchItem} from './search-schemas';
import type {PublicPlace} from './types';

// LOCAL PRO ONLY (multivertical A1/A2): server backend of the assistant directory tools. Calls the same server functions
// as the public pages (dir_search through loadDirectorySearch, dir_place_public, public_price_search/compare), never the
// HTTP API. Development only, like the directory pages it links to.
export const DIRECTORY_ASSISTANT_ENABLED=process.env.NODE_ENV==='development';

export const directoryToolBackend:DirectoryToolBackend={
 async searchPlaces({vertical,province,openNow,q,limit}){
  const page=await loadDirectorySearch(vertical,{province,openNow:openNow?'1':undefined,q,limit:String(limit)});
  if(!page.ok)return null;
  return page.result.items.filter((i):i is PlaceSearchItem=>i.kind==='place');
 },
 async getPlace(slug){
  const r=await createAdminClient().rpc('dir_place_public',{p_slug:slug});
  return r.error?null:(r.data as PublicPlace|null);
 },
 async searchPriceItems(q,vertical){const r=await searchPriceItems(q,vertical,5);return r.ok?r.result:null;},
 async comparePrices(item,{province,vertical}){const r=await comparePrices(item,{province,vertical,sort:'unit_price',limit:10});return r.ok?r.result:null;},
};

export async function directoryAssistantAnswer(message:string,locale:ToolLocale):Promise<DirectoryToolResult|null>{
 if(!DIRECTORY_ASSISTANT_ENABLED)return null;
 try{return await directoryAnswer(message,directoryToolBackend,locale);}
 catch(error){console.error('[ai-assistant] directory tools failed',error instanceof Error?error.message:String(error));return null;}
}

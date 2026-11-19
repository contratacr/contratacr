import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import type {CompareSort,CompareVertical,PriceComparison,PriceSearchResult} from './price-compare';

// LOCAL PRO ONLY (multivertical P3): server readers of the price comparison (service role, like every directory
// reader). Used by /precios and by the assistant tools (never through the HTTP API). Prescription medicines are
// filtered in SQL (Decreto 36868-S); the order is computed in SQL from price only (never payment).
export type PriceReadError={ok:false;reason:'unavailable'};

export async function searchPriceItems(q:string,vertical:CompareVertical|null,limit=20):Promise<{ok:true;result:PriceSearchResult}|PriceReadError>{
 const r=await createAdminClient().rpc('public_price_search',{p_q:q,p_vertical:vertical,p_limit:limit});
 if(r.error){console.error('[precios] search failed',(r.error as {code?:string}).code);return {ok:false,reason:'unavailable'};}
 return {ok:true,result:(r.data as PriceSearchResult|null)??{q,vertical,items:[]}};
}

export async function comparePrices(item:string,{province=null,vertical=null,sort='unit_price',limit=60,priceMin=null,priceMax=null}
 :{province?:string|null;vertical?:CompareVertical|null;sort?:CompareSort;limit?:number;priceMin?:number|null;priceMax?:number|null}={})
 :Promise<{ok:true;result:PriceComparison|null}|PriceReadError|{ok:false;reason:'invalid'}>{
 const r=await createAdminClient().rpc('public_price_compare',{p_item_slug:item,p_province:province,p_vertical:vertical,p_sort:sort,p_limit:limit,p_price_min:priceMin,p_price_max:priceMax});
 if(r.error){
  const code=(r.error as {code?:string}).code;if(code==='22023')return {ok:false,reason:'invalid'};
  console.error('[precios] compare failed',code);return {ok:false,reason:'unavailable'};
 }
 return {ok:true,result:r.data as PriceComparison|null};
}

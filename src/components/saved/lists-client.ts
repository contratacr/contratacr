'use client';
import type {SavedList} from '@/lib/directory/place-features';

/**
 * Client helpers for «Mis listas» (WS4). The directory keeps named lists per person; the two Yelp-style tabs "He estado"
 * and "Quiero ir" are two reserved list names (no extra tables, no migration), created lazily on first use. Everything
 * goes through /api/listas (CAS by revision, idempotent actionId). The «He estado» count is account data: it stays in
 * memory for this page only (never in browser storage, so it cannot pass to another account on a shared device).
 */
export const BEEN_NAME='He estado';
export const WANT_NAME='Quiero ir';
export const isSystemList=(name:string)=>name===BEEN_NAME||name===WANT_NAME;
export const LISTS_EVENT='ccr:lists-changed';
let beenHereCount=0;
export const BEEN_GOAL=5;

export async function fetchLists(slug?:string|null):Promise<SavedList[]|null>{
 try{
  const r=await fetch(`/api/listas${slug?`?slug=${encodeURIComponent(slug)}`:''}`,{cache:'no-store'});
  if(!r.ok)return null;
  const j=await r.json().catch(()=>null) as {items?:SavedList[]}|null;
  return Array.isArray(j?.items)?j.items:null;
 }catch{return null;}
}

export function rememberBeenHereCount(lists:SavedList[]){
 const n=lists.find(l=>l.name===BEEN_NAME)?.count??0;
 beenHereCount=n;
 return n;
}
/** Synchronous, endpoint-free reader of the last count read in this page (0 when unknown). */
export function getBeenHereCount():number{return beenHereCount;}
/** Re-reads the real count from the saved lists (one request) and caches it. */
export async function refreshBeenHereCount():Promise<number|null>{
 const lists=await fetchLists();if(!lists)return null;return rememberBeenHereCount(lists);
}
export function announceListsChanged(){try{window.dispatchEvent(new CustomEvent(LISTS_EVENT));}catch{/* no window */}}

export type MutateResult={ok:boolean;reason?:string;data?:{listId?:string;revision?:number}};
export async function postListChange(body:Record<string,unknown>):Promise<MutateResult>{
 try{
  const r=await fetch('/api/listas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,actionId:crypto.randomUUID()})});
  const j=await r.json().catch(()=>({})) as {reason?:string};
  return r.ok?{ok:true,data:j as MutateResult['data']}:{ok:false,reason:j.reason??'unavailable'};
 }catch{return {ok:false,reason:'unavailable'};}
}

/** Puts a place into / takes it out of one of the two reserved lists, creating the list on first use. */
export async function setSystemList(name:typeof BEEN_NAME|typeof WANT_NAME,slug:string,on:boolean):Promise<MutateResult>{
 let lists=await fetchLists(slug);if(!lists)return {ok:false,reason:'unavailable'};
 let list=lists.find(l=>l.name===name);
 if(!list){
  if(!on)return {ok:true};
  const made=await postListChange({action:'create',listId:crypto.randomUUID(),name});if(!made.ok)return made;
  lists=await fetchLists(slug);list=lists?.find(l=>l.name===name);if(!list)return {ok:false,reason:'unavailable'};
 }
 if(!!list.hasPlace===on)return {ok:true};
 const r=await postListChange({action:on?'add':'remove',listId:list.listId,revision:list.revision,slug});
 if(r.ok){const after=await fetchLists();if(after)rememberBeenHereCount(after);announceListsChanged();}
 return r;
}

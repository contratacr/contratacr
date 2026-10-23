"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InitialAvailability } from "@/hooks/use-profesional-con-app";
import { feedKey, type FeedFilters, type FeedPage, type FeedSection } from "@/lib/marketplace/feed";

function contactSnapshots(page:FeedPage<unknown>|undefined):Record<string,InitialAvailability>{const snapshot=page?.contactAvailability;return snapshot?Object.fromEntries(Object.keys(snapshot.values).map(id=>[id,snapshot])):{};}
type State<T>={contacts?:Record<string,InitialAvailability>;key:string;page:FeedPage<T>|undefined;loading:boolean;feedback:boolean;error:boolean;replacing:boolean};
export function useMarketplaceFeed<T extends {id:string}>(section:FeedSection,initial:FeedPage<T>|undefined,filters:FeedFilters,locale:string){
  const key=feedKey(filters);const initialKey=initial?feedKey(initial.filters):"";
  const [state,setState]=useState<State<T>>(()=>({contacts:contactSnapshots(initial),key:initialKey,page:initial,loading:false,feedback:false,error:false,replacing:false}));
  const stateRef=useRef(state);
  const sentinel=useRef<HTMLDivElement|null>(null);
  const generation=useRef(0);const busy=useRef(false);const controller=useRef<AbortController|null>(null);
  const mounted=useRef(true);const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const registerSentinel=useCallback((node:HTMLDivElement|null)=>{sentinel.current=node;},[]);
  const filtersRef=useRef(filters);
  const currentKey=useRef(key);
  const initialRef=useRef(initial);
  useLayoutEffect(()=>{stateRef.current=state;filtersRef.current=filters;currentKey.current=key;initialRef.current=initial;});
  useEffect(()=>()=>{mounted.current=false;controller.current?.abort();if(feedbackTimer.current)clearTimeout(feedbackTimer.current);},[]);
  const request=useCallback(async(replacing=false)=>{
    if(!initialRef.current||busy.current)return;
    const previous=stateRef.current;
    if(!replacing&&!previous.page?.nextCursor)return;
    const requestKey=currentKey.current;
    const token=++generation.current;
    busy.current=true;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const params=new URLSearchParams({section,locale,...Object.fromEntries(Object.entries(filtersRef.current).filter(([,v])=>!!v))});
    if(!replacing&&previous.page){params.set("asOf",previous.page.asOf);params.set("cursor",previous.page.nextCursor!);}
    const selected=initialRef.current.selected?.id;if(selected)params.set("selected",selected);
    setState(s=>({...s,key:requestKey,page:replacing?undefined:s.page,loading:true,feedback:false,error:false,replacing}));
    if(feedbackTimer.current)clearTimeout(feedbackTimer.current);
    feedbackTimer.current=setTimeout(()=>{if(mounted.current&&generation.current===token)setState(s=>({...s,feedback:true}));},500);
    try{
      const response=await fetch(`/api/marketplace/results?${params}`,{cache:"no-store",signal:abort.signal});
      if(!response.ok)throw new Error(`marketplace-${response.status}`);
      const next=await response.json() as FeedPage<T>;
      if(!Array.isArray(next.items)||next.items.length>20||typeof next.total!=="number")throw new Error("invalid-marketplace-page");
      if(abort.signal.aborted||!mounted.current||generation.current!==token||currentKey.current!==requestKey)return;
      const existing=replacing?[]:previous.page?.items??[];const seen=new Set(existing.map(i=>i.id));
      const fresh=next.items.filter(i=>!seen.has(i.id));
      const page={...next,items:[...existing,...fresh],nextCursor:!replacing&&fresh.length===0?null:next.nextCursor};
      setState({contacts:{...(!replacing?previous.contacts:{}),...contactSnapshots(next)},key:requestKey,page,loading:false,feedback:false,error:false,replacing:false});
    }catch(error){
      if(!abort.signal.aborted&&mounted.current&&generation.current===token&&currentKey.current===requestKey){console.error("[marketplace] load failed",error);setState(s=>({...s,loading:false,feedback:false,error:true,replacing}));}
    }finally{if(generation.current===token){busy.current=false;if(feedbackTimer.current)clearTimeout(feedbackTimer.current);}}
  },[locale,section]);
  const load=useRef(request);useLayoutEffect(()=>{load.current=request;},[request]);
  // Filter edits start a fresh server search; late responses cannot append to it.
  useEffect(()=>{
    if(!initial)return;
    mounted.current=true;
    generation.current++;controller.current?.abort();busy.current=false;
    if(feedbackTimer.current)clearTimeout(feedbackTimer.current);
    const epoch=generation.current;
    queueMicrotask(()=>{if(mounted.current&&generation.current===epoch)setState(key===initialKey?{contacts:contactSnapshots(initial),key,page:initial,loading:false,feedback:false,error:false,replacing:false}:{key,page:undefined,loading:true,feedback:false,error:false,replacing:true});});
    if(key===initialKey)return;
    const scroll=sentinel.current?.closest<HTMLElement>(".ccr-lista-tablero");if(scroll)scroll.scrollTop=0;
    const timer=setTimeout(()=>void load.current(true),180);
    return()=>clearTimeout(timer);
  },[key,initialKey,initial]);
  const replacing=!!initial&&(state.key!==key||state.replacing);
  const page=state.key===key?state.page:undefined;
  const hasMore=!!page?.nextCursor;
  useEffect(()=>{
    const node=sentinel.current;if(!initial||!node||!hasMore||state.loading||state.error||replacing)return;
    let root:HTMLElement|null=node.parentElement;
    while(root&&!(getComputedStyle(root).overflowY.match(/auto|scroll/)&&root.scrollHeight>root.clientHeight+1))root=root.parentElement;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void load.current();},{root,rootMargin:"500px 0px"});observer.observe(node);
    const nearEnd=()=>{
      const viewport=root?root.getBoundingClientRect():{top:0,bottom:window.innerHeight};const rect=node.getBoundingClientRect();
      if(rect.top<viewport.bottom+500&&rect.bottom>viewport.top-500)void load.current();
    };
    root?.addEventListener("scroll",nearEnd,{passive:true});window.addEventListener("scroll",nearEnd,{passive:true});
    return()=>{observer.disconnect();root?.removeEventListener("scroll",nearEnd);window.removeEventListener("scroll",nearEnd);};
  },[initial,hasMore,state.loading,state.error,replacing,page?.items.length]);
  return {enabled:!!initial,items:page?.items,total:page?.total??0,catalogTotal:page?.catalogTotal??initial?.catalogTotal??0,
    contactFor:(id:string)=>state.contacts?.[id],
    selected:page?.selected,suggestions:page?.suggestions??initial?.suggestions??[],locations:page?.locations??initial?.locations??[],
    replacing,loading:!!initial&&(state.loading||state.key!==key),showSkeleton:!!initial&&state.feedback,error:!!initial&&state.error,hasMore,sentinel:registerSentinel,
    retry:()=>void load.current(replacing||!page),};
}

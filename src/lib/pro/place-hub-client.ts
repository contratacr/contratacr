'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '@/hooks/use-auth';
import {PRO_BEFORE_PATH_CHANGE} from './navigation';
import type {ProPlaceHub} from './hub-sections';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17): directory entries of the Pro hub. One request per account and page
// load (shared by the «Inicio» cards and the sidebar); a failure simply shows no directory entries.
const cache=new Map<string,Promise<ProPlaceHub|null>>();
function load(account:string){
 let p=cache.get(account);
 if(!p){p=fetch('/api/pro/place-hub',{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<ProPlaceHub>:null).catch(()=>null);cache.set(account,p);}
 return p;
}
export function useProPlaceHub(enabled=true){
 const user=useAuth().user,account=enabled?user?.id:undefined;
 const [hub,setHub]=useState<{account:string;value:ProPlaceHub|null}|null>(null);
 useEffect(()=>{
  if(!account)return;let alive=true;
  void load(account).then(value=>{if(alive)setHub({account,value});});
  return()=>{alive=false;};
 },[account]);
 return hub&&hub.account===account?hub.value:null;
}
/** Opens a Pro module page outside the Pro space, asking the open editors' navigation guard first. */
export function openProModulePage(href:string){
 if(!window.dispatchEvent(new CustomEvent(PRO_BEFORE_PATH_CHANGE,{cancelable:true,detail:{path:href}})))return;
 window.location.assign(href);
}

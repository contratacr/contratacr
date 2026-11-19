'use client';
import {useEffect,useState} from 'react';

// Launch without Pro (2026-11-18): true when the signed-in account manages at least one claimed place, so the account
// menu can offer «Mi negocio» (/dashboard/negocio) to business owners who are not professionals. One GET /api/negocio
// per page load (shared promise); any error, 401 or 404 (directory off) → false, so the entry stays hidden.
let pending:Promise<boolean>|null=null;
export function useManagesBusiness(signedIn:boolean){
 const [manages,setManages]=useState(false);
 useEffect(()=>{
  if(!signedIn){pending=null;return;}
  let alive=true;
  pending??=fetch('/api/negocio',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>Array.isArray(j?.places)&&j.places.length>0).catch(()=>false);
  void pending.then(v=>{if(alive)setManages(v);});
  return ()=>{alive=false;};
 },[signedIn]);
 return signedIn&&manages;
}

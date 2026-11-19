'use client';

import {createContext,useCallback,useContext,useId,useLayoutEffect,useMemo,useState,type ReactNode} from 'react';

type Scope={actorId:string;workId:string;view:string};
type Claim={token:string;scope:string};
type Host=Claim&{element:HTMLDivElement};
type FooterContext={enabled:boolean;scope:string;claim:Claim|null;host:Host|null;acquire:(claim:Claim)=>void;release:(claim:Claim)=>void;attach:(claim:Claim,element:HTMLDivElement|null)=>void};
const Context=createContext<FooterContext|null>(null);
const scopeKey=(scope:Scope)=>JSON.stringify([scope.actorId,scope.workId,scope.view]);
const matches=(a:Claim|null,b:Claim)=>a?.token===b.token&&a.scope===b.scope;

/** Local opt-in for a form inside an existing Pro detail modal. Stores ownership,
 * never rendered controls or form data. A late cleanup can release only its token. */
export function ProFormFooterProvider({scope,enabled,children}:{scope:Scope;enabled:boolean;children:ReactNode}){
 const key=scopeKey(scope),[claim,setClaim]=useState<Claim|null>(null),[host,setHost]=useState<Host|null>(null);
 const acquire=useCallback((next:Claim)=>setClaim(previous=>matches(previous,next)?previous:next),[]);
 const release=useCallback((previous:Claim)=>{setClaim(current=>matches(current,previous)?null:current);setHost(current=>matches(current,previous)?null:current);},[]);
 const attach=useCallback((owner:Claim,element:HTMLDivElement|null)=>{setHost(current=>element?(matches(current,owner)&&current?.element===element?current:{...owner,element}):matches(current,owner)?null:current);},[]);
 const activeClaim=enabled&&claim?.scope===key?claim:null;
 const value=useMemo<FooterContext>(()=>({enabled,scope:key,claim:activeClaim,host:activeClaim&&matches(host,activeClaim)?host:null,acquire,release,attach}),[enabled,key,activeClaim,host,acquire,release,attach]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ProFormFooterSlot({fallback}:{fallback:ReactNode}){
 const context=useContext(Context),token=context?.claim?.token,scope=context?.claim?.scope,attach=context?.attach;
 const target=useCallback((element:HTMLDivElement|null)=>{if(token&&scope&&attach)attach({token,scope},element);},[token,scope,attach]);
 if(!context?.enabled||!context.claim)return <div data-pro-form-footer-fallback className="flex w-full justify-end">{fallback}</div>;
 return <div key={context.claim.token+context.claim.scope} ref={target} data-pro-form-footer className="flex w-full min-w-0 justify-end"/>;
}

/** An active form hides its inline actions as soon as this matching host is
 * available. The layout claim and target ref complete the portal before paint. */
export function useProFormFooter({actorId,workId,view,active}:{actorId:string;workId:string;view:string;active:boolean}){
 const context=useContext(Context),token=useId(),scope=scopeKey({actorId,workId,view}),acquire=context?.acquire,release=context?.release;
 const hosted=!!context&&context.enabled&&context.scope===scope&&active;
 useLayoutEffect(()=>{if(!hosted||!acquire||!release)return;const owner={token,scope};acquire(owner);return()=>release(owner);},[hosted,token,scope,acquire,release]);
 const target=hosted&&context?.claim?.token===token&&context.host?.token===token&&context.host.scope===scope?context.host.element:null;
 return{hosted,target};
}

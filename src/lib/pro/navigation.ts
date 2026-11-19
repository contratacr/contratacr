// Pro navigation owns only its namespace; Next retains its router tree/history fields.
export const PRO_PATH_CHANGED='ccr:pro-path-changed';
export const PRO_BEFORE_PATH_CHANGE='ccr:pro-before-path-change';
// Round 9: listeners always see the query (canonical) form, also for job routes.
function permitPath(path:string){return window.dispatchEvent(new CustomEvent(PRO_BEFORE_PATH_CHANGE,{cancelable:true,detail:{path:proCanonicalPath(path)}}));}
let account: string | null = null;
const key = 'ccrProNavigation';
function externalState(){
 const state={...window.history.state};
 // Next treats these flags as an internal call and skips URL synchronization.
 // Its public history wrapper restores them and the router tree automatically.
 delete state.__NA;delete state._N;return state;
}
/** Round 9: the job page is its own route, /[en/]dashboard/pro/trabajo/<id>[/<section>].
 * Pro screens keep reading one canonical (query) address — tab=pro_agenda&cita=<id>&vistaTrabajo=<section>
 * — and every move is translated to the route form here, so guards and history stay in one place. */
const jobRoutePattern=/^\/(?:(es|en)\/)?dashboard\/pro\/trabajo\/([^/?#]+)(?:\/([a-z]{1,20}))?\/?$/;
const proSpacePattern=/^\/(?:(es|en)\/)?dashboard\/pro$/;
export function proJobRoute(pathname:string):{prefix:string;id:string;section:string|null}|null{
 const match=jobRoutePattern.exec(pathname);if(!match)return null;
 let id:string;try{id=decodeURIComponent(match[2]);}catch{return null;}
 if(!id||id.length>160||/[\u0000-\u001f]/.test(id))return null;
 return {prefix:match[1]==='en'?'/en':match[1]==='es'?'/es':'',id,section:match[3]??null};
}
/** Query form of any Pro address (identity for everything but a job route). */
// Only same-origin absolute paths are translated; anything else is returned untouched so the
// existing validation (proDashboardPath) still rejects it (e.g. //host/…, backslashes, full URLs).
const translatable=(path:string)=>typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\')&&path.length<=12000;
export function proCanonicalPath(path:string){
 if(!translatable(path))return path;
 const url=new URL(path,'http://local.invalid'),job=proJobRoute(url.pathname);
 if(!job)return url.pathname+url.search;
 const params=new URLSearchParams({tab:'pro_agenda',cita:job.id});
 if(job.section&&job.section!=='summary')params.set('vistaTrabajo',job.section);
 for(const [name,value] of new URLSearchParams(url.search))if(!['tab','cita','vistaTrabajo'].includes(name))params.append(name,value);
 return job.prefix+'/dashboard/pro?'+params;
}
/** Route form of a Pro space address: a job of the Pro space becomes /dashboard/pro/trabajo/<id>/<section>. */
export function proRoutedPath(path:string){
 if(!translatable(path))return path;
 const url=new URL(path,'http://local.invalid'),match=proSpacePattern.exec(url.pathname);
 if(!match)return url.pathname+url.search;
 const params=new URLSearchParams(url.search),id=params.get('cita');
 if(params.get('tab')!=='pro_agenda'||!id||id.length>160||/[\u0000-\u001f]/.test(id))return url.pathname+url.search;
 const section=params.get('vistaTrabajo');params.delete('tab');params.delete('cita');
 const routed=!!section&&/^[a-z]{1,20}$/.test(section);if(routed||!section)params.delete('vistaTrabajo');
 const rest=params.toString();
 return (match[1]==='en'?'/en':match[1]==='es'?'/es':'')+'/dashboard/pro/trabajo/'+encodeURIComponent(id)+(routed&&section!=='summary'?'/'+section:'')+(rest?'?'+rest:'');
}
/** The current address in query form (what Pro screens read). */
export function currentCanonicalProPath(){return proCanonicalPath(window.location.pathname+window.location.search);}
/** Same document: a job route keeps its document across its sections. */
function documentKey(pathname:string){const job=proJobRoute(pathname);return job?'job:'+job.prefix+':'+job.id:pathname;}
export type ProNavigationEntry = {account:string;parent:string;id:string};
type Entry = ProNavigationEntry;
type SectionNavigator=(path:string,entry:ProNavigationEntry|null)=>void;
let sectionNavigator:SectionNavigator|null=null;
let pendingSection:{path:string;entry:ProNavigationEntry|null;account:string|null}|null=null;
/** The independent Pro route uses Next's public router for section transitions.
 * Query-only editors and the original professional panel retain their history. */
export function registerProSectionNavigator(navigate:SectionNavigator){sectionNavigator=navigate;return()=>{if(sectionNavigator===navigate)sectionNavigator=null;};}
export function completeProSectionNavigation(path:string,entry:ProNavigationEntry|null){
 if(proDashboardPath(path)!==currentProPath()||entry!==null&&(entry.account!==account||!proDashboardPath(entry.parent)))return false;
 // The router has committed this URL. Attach only our namespace, leaving its
 // opaque tree and flags intact; this is not a second navigation.
 window.history.replaceState({...window.history.state,[key]:entry},'',path);
 window.dispatchEvent(new Event(PRO_PATH_CHANGED));return true;
}
export function completePendingProSectionNavigation(actorId:string){
 const target=pendingSection;
 if(!target||actorId!==account||target.account!==actorId)return false;
 pendingSection=null;
 if(completeProSectionNavigation(target.path,target.entry))return true;
 if(pendingSection===null)pendingSection=target;
 return false;
}
export function cancelPendingProSectionNavigation(){pendingSection=null;}
let entryPreserved=false;
/** Next rewrites the current entry after committing an RSC payload (e.g. the
 * refetch that follows a browser traversal) with only its own fields unless the
 * action opted into custom state (app-router.js HistoryUpdater). That dropped
 * this namespace, so a later close replaced instead of returning to its parent.
 * Keep our entry only for Next-internal (__NA) rewrites of the same URL. */
/** Next keeps its router tree in every history entry and restores it on
 * Back/Forward. Entries written before a reload carry the previous document's
 * tree, which this document has not cached: Next then fetches it again, and
 * pushes copy that stale tree, so the next query-only screen fetches too. When
 * Back interrupted one of those fetches Next recorded two mismatches in a row
 * and fell back to a full page load of the stale URL ~250 ms later, yanking a
 * user who had already moved on (or aborting the page they were opening).
 * The professional panel is one client page whose query-only screens never need
 * server data, so a same-pathname traversal there restores with the tree this
 * document last committed instead. The independent /dashboard/pro route keeps
 * Next's default (its sections use the public router). */
const routerTreeKey='__PRIVATE_NEXTJS_INTERNALS_TREE';
let committedTree:{path:string;value:unknown}|null=null;
function rememberRouterTree(data:unknown,url?:string|URL|null){
 if(!data||typeof data!=='object'||(data as Record<string,unknown>).__NA!==true)return;
 const value=(data as Record<string,unknown>)[routerTreeKey];if(!value||typeof value!=='object')return;
 let path=window.location.pathname;if(url!==undefined&&url!==null){try{path=new URL(String(url),window.location.href).pathname;}catch{return;}}
 committedTree={path,value};
}
function reuseCommittedTreeOnTraversal(event:PopStateEvent){
 const state=event.state as Record<string,unknown>|null;
 if(!committedTree||!state||typeof state!=='object'||state.__NA!==true||!state[routerTreeKey])return;
 if(documentKey(committedTree.path)!==documentKey(window.location.pathname)||!/^\/(?:es\/|en\/)?dashboard\/profesional$/.test(window.location.pathname)&&!proJobRoute(window.location.pathname))return;
 // Next reads event.state in its own (later, bubbling) popstate listener.
 state[routerTreeKey]=committedTree.value;
}
function preserveProEntryOnRouterRewrites(){
 if(entryPreserved||typeof window==='undefined')return;entryPreserved=true;
 const history=window.history,replace=history.replaceState,push=history.pushState;
 rememberRouterTree(history.state);
 history.replaceState=function(this:History,data:unknown,unused:string,url?:string|URL|null){
  const current=history.state?.[key] as Entry|undefined;
  if(current&&data&&typeof data==='object'&&(data as Record<string,unknown>).__NA===true&&!(key in data)){
   let same=url===undefined||url===null;if(!same){try{same=new URL(String(url),window.location.href).href===window.location.href;}catch{same=false;}}
   if(same)data={...(data as Record<string,unknown>),[key]:current};
  }
  rememberRouterTree(data,url);
  return replace.call(this,data,unused,url);
 };
 history.pushState=function(this:History,data:unknown,unused:string,url?:string|URL|null){rememberRouterTree(data,url);return push.call(this,data,unused,url);};
 // Capture runs before Next's bubbling listener on window.
 window.addEventListener('popstate',reuseCommittedTreeOnTraversal,true);
}
export function setProNavigationAccount(id:string|null){account=id;preserveProEntryOnRouterRewrites();if(id!==null&&pendingSection?.account!==id)pendingSection=null;}
export function proDashboardPath(value:unknown):string|null{
 if(typeof value!=='string'||value.length>12000||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null;
 try{const url=new URL(value,window.location.origin);if(url.origin!==window.location.origin||!/^\/(?:es\/|en\/)?dashboard\/(?:profesional|pro)$/.test(url.pathname)&&!proJobRoute(url.pathname)||url.username||url.password)return null;return url.pathname+url.search;}catch{return null;}
}
export function currentProPath(){return window.location.pathname+window.location.search;}
function crossesPath(target:string){return documentKey(new URL(target,window.location.origin).pathname)!==documentKey(window.location.pathname);}
export function pushProPath(path:string){
 const target=proDashboardPath(proRoutedPath(path)),parent=proDashboardPath(currentProPath());if(!target||!parent)return;
 if(target===parent||!permitPath(target))return;
 // History-only updates cannot mount the other route's server/client shell.
 if(crossesPath(target)){window.location.assign(target);return;}
 const state=externalState();
 // The origin entry keeps its own parent. The new entry remembers this exact path.
 const entry:Entry|null=account?{account,parent,id:crypto.randomUUID()}:null;
 window.history.pushState({...state,[key]:entry},'',target);window.dispatchEvent(new Event(PRO_PATH_CHANGED));
}
export function navigatePro(tab:string,extra:Record<string,string>={}){
 // Round 7B: the team page (/dashboard/pro/equipo) shows the Pro side menu too;
 // its entries open the section in the Pro space as a document load.
 if(/^\/(?:es\/|en\/)?dashboard\/pro\/equipo$/.test(window.location.pathname)){
  const target=window.location.pathname.replace(/\/equipo$/,'')+'?'+new URLSearchParams({tab,...extra});
  if(permitPath(target))window.location.assign(target);return;
 }
 const job=proJobRoute(window.location.pathname);
 const path=(job?job.prefix+'/dashboard/pro':window.location.pathname)+'?'+new URLSearchParams({tab,...extra});
 // Round 9: opening a job leaves the Pro space document for the job's own route.
 if(proRoutedPath(path)!==path){pushProPath(path);return;}
 if(sectionNavigator&&/^\/(?:es\/|en\/)?dashboard\/pro$/.test(window.location.pathname)){
  const target=proDashboardPath(path),parent=proDashboardPath(currentProPath());if(!target||!parent||target===parent||!permitPath(target))return;
  const entry=account?{account,parent,id:crypto.randomUUID()}:null;
  pendingSection={path:target,entry,account};sectionNavigator(target,entry);return;
 }
 pushProPath(path);
}
export function replaceProPath(path:string){const target=proDashboardPath(proRoutedPath(path));if(!target||!permitPath(target))return;if(crossesPath(target)){window.location.replace(target);return;}window.history.replaceState(externalState(),'',target);window.dispatchEvent(new Event(PRO_PATH_CHANGED));}
export function replaceProParams(changes:Record<string,string|null>){
 const current=new URL(currentCanonicalProPath(),window.location.origin),params=current.searchParams;for(const [name,value] of Object.entries(changes)){if(value===null||value==='')params.delete(name);else params.set(name,value);}
 replaceProPath(current.pathname+'?'+params);
}
export function pushProParams(changes:Record<string,string|null>){
 const current=new URL(currentCanonicalProPath(),window.location.origin),params=current.searchParams;for(const [name,value] of Object.entries(changes)){if(value===null||value==='')params.delete(name);else params.set(name,value);}
 pushProPath(current.pathname+'?'+params);
}
export function backPro(fallback?:string):boolean{
 const entry=window.history.state?.[key] as Entry|undefined;
 const parent=entry?.account===account&&account?proDashboardPath(entry.parent):null;
 if(parent&&parent!==currentProPath()&&window.history.length>1){if(crossesPath(parent)&&!permitPath(parent))return false;window.history.back();return true;}
 const target=parent??(typeof fallback==='string'?proDashboardPath(proRoutedPath(fallback)):null);
 if(!target||!permitPath(target))return false;
 if(crossesPath(target)){window.location.replace(target);return true;}
 window.history.replaceState({...externalState(),[key]:null},'',target);window.dispatchEvent(new Event(PRO_PATH_CHANGED));return true;
}
export function closeProStep(...names:string[]){
 const current=new URL(currentCanonicalProPath(),window.location.origin),params=current.searchParams;for(const name of names)params.delete(name);
 backPro(current.pathname+'?'+params);
}

// A labelled return must reach its named section without adding a circular entry.
export function returnProTo(tab:string){
 const target=new URL(currentCanonicalProPath(),window.location.origin).pathname+'?'+new URLSearchParams({tab});
 const entry=window.history.state?.[key] as Entry|undefined;
 const parent=entry?.account===account&&account?proDashboardPath(entry.parent):null;
 if(parent&&new URL(proCanonicalPath(parent),window.location.origin).searchParams.get('tab')===tab){backPro(target);return;}
 replaceProPath(target);
}
/** Round 7B: open a section of the independent Pro space from anywhere (job
 * dialogs in Mi panel included), through the same guards as other moves. */
export function openProSection(tab:string,extra:Record<string,string>={},en=false){
 if(/^\/(?:es\/|en\/)?dashboard\/pro$/.test(window.location.pathname)||proJobRoute(window.location.pathname)){navigatePro(tab,extra);return;}
 pushProPath((en?'/en':'')+'/dashboard/pro?'+new URLSearchParams({tab,...extra}));
}

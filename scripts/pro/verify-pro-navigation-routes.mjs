// Pure route/history regression. No browser, network, application server or DB.
import assert from 'node:assert/strict';
const nav=await import('../../src/lib/pro/navigation.ts');
const owner=crypto.randomUUID(),other=crypto.randomUUID(),origin='http://127.0.0.1:3185';
function environment(path,state=null,length=1){
 const target=new EventTarget(),calls=[];let current=new URL(path,origin);
 const location={get origin(){return current.origin;},get pathname(){return current.pathname;},get search(){return current.search;},assign:path=>calls.push(['assign',path]),replace:path=>calls.push(['replace',path])};
 const history={state,length,pushState(state,_title,path){this.state=state;this.length++;current=new URL(path,origin);calls.push(['push',path]);},replaceState(state,_title,path){this.state=state;current=new URL(path,origin);calls.push(['replaceState',path]);},back:()=>calls.push(['back'])};
 globalThis.window={location,history,dispatchEvent:event=>target.dispatchEvent(event)};
 return {calls,history,location,block(){target.addEventListener(nav.PRO_BEFORE_PATH_CHANGE,event=>event.preventDefault());},onChange(callback){target.addEventListener(nav.PRO_PATH_CHANGED,callback);}};
}
nav.setProNavigationAccount(owner);environment('/dashboard/pro');
for(const prefix of ['', '/es','/en'])for(const route of ['pro','profesional']){
 const path=prefix+'/dashboard/'+route+'?tab=pro_clients&cliente=legacy';assert.equal(nav.proDashboardPath(path),path);
}
for(const input of [null,{},'', '//evil.invalid/dashboard/pro','https://evil.invalid/dashboard/pro','/dashboard/pro/child','/dashboard/profesional/child','/dashboard/professional','/dashboard/pro-extra','/login','/api/pro/access','/dashboard%2fpro','/en/dashboard/pro/','/\\evil.invalid/dashboard/pro','/'.repeat(6001)])assert.equal(nav.proDashboardPath(input),null);
for(const path of ['/dashboard/pro','/dashboard/profesional','/en/dashboard/pro','/en/dashboard/profesional']){
 const e=environment(path+'?tab=pro_tools',{__NA:true,tree:'next-tree',ccrProNavigation:null});let changed=0;e.onChange(()=>changed++);
 nav.navigatePro('pro_clients',{cliente:'legacy-contact'});assert.equal(e.calls[0][0],'push');assert.equal(e.location.pathname,path);assert.equal(e.history.state.tree,'next-tree');assert.equal(e.history.state.__NA,undefined);assert.equal(e.history.state.ccrProNavigation.account,owner);assert.equal(e.history.state.ccrProNavigation.parent,path+'?tab=pro_tools');assert.equal(changed,1);
 nav.replaceProParams({cliente:null});assert.equal(e.calls.at(-1)[0],'replaceState');assert.equal(changed,2);
}
for(const [from,to] of [['/dashboard/profesional','/dashboard/pro'],['/dashboard/pro','/dashboard/profesional'],['/en/dashboard/pro','/dashboard/pro']]){
 const e=environment(from+'?tab=pro_tools',{tree:'original'});let changed=0;e.onChange(()=>changed++);
 nav.pushProPath(to+'?tab=pro_agenda');assert.deepEqual(e.calls,[['assign',to+'?tab=pro_agenda']]);assert.deepEqual(e.history.state,{tree:'original'});assert.equal(changed,0);
 e.calls.length=0;nav.replaceProPath(to+'?tab=quotes');assert.deepEqual(e.calls,[['replace',to+'?tab=quotes']]);assert.equal(changed,0);
}
for(const operation of ['push','replace','fallback','back']){
 const e=environment('/dashboard/pro?tab=pro_tools',operation==='back'?{ccrProNavigation:{account:owner,parent:'/dashboard/profesional?tab=profile',id:crypto.randomUUID()}}:null,operation==='back'?2:1);e.block();
 if(operation==='push')nav.pushProPath('/dashboard/profesional?tab=profile');else if(operation==='replace')nav.replaceProPath('/dashboard/profesional?tab=profile');else assert.equal(nav.backPro('/dashboard/profesional?tab=profile'),false);
 assert.deepEqual(e.calls,[]);
}
{
 const e=environment('/dashboard/pro?tab=quotes');assert.equal(nav.backPro('/dashboard/profesional?tab=profile'),true);assert.deepEqual(e.calls,[['replace','/dashboard/profesional?tab=profile']]);
}
{
 const e=environment('/en/dashboard/pro?tab=quotes',{tree:'next',ccrProNavigation:{account:other,parent:'/dashboard/profesional?tab=profile',id:crypto.randomUUID()}},2);assert.equal(nav.backPro('/en/dashboard/pro?tab=pro_tools'),true);assert.deepEqual(e.calls,[['replaceState','/en/dashboard/pro?tab=pro_tools']]);assert.equal(e.history.state.tree,'next');assert.equal(e.history.state.ccrProNavigation,null);
}
{
 const e=environment('/dashboard/pro?tab=pro_clients',{ccrProNavigation:{account:owner,parent:'/dashboard/pro?tab=pro_tools',id:crypto.randomUUID()}},2);assert.equal(nav.backPro(),true);assert.deepEqual(e.calls,[['back']]);
}
{
 const e=environment('/dashboard/pro?tab=pro_clients',{ccrProNavigation:{account:owner,parent:'/dashboard/profesional?tab=profile',id:crypto.randomUUID()}},2);assert.equal(nav.backPro(),true);assert.deepEqual(e.calls,[['back']]);
}
{
 const e=environment('/dashboard/pro?tab=quotes');nav.pushProPath('//evil.invalid/dashboard/pro');nav.replaceProPath('/dashboard/pro/child');assert.equal(nav.backPro('/login'),false);assert.deepEqual(e.calls,[]);
}
console.log('PASS Pro routes: exact ES/EN allowlist, query-only history/account scope, real cross-route transitions, pre-navigation guards, back fallback and unsafe-path rejection. No browser or data access.');

// Public-router adapter: mocked commits are deliberately separate from intent.
// No Next/React/browser internals are executed in this pure verifier.
let adapterPassed=0;
function adapterCase(name,run){nav.cancelPendingProSectionNavigation();nav.setProNavigationAccount(owner);run();adapterPassed++;console.log('PASS Pro router adapter: '+name);}
const nextCommit=(e,path)=>e.history.pushState({__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:{opaque:'committed-tree'},tree:{preserved:true},foreignNamespace:{kept:1}},'',path);
adapterCase('supported Pro sections defer history until the registered router commits',()=>{
 for(const prefix of ['', '/es','/en']){
  const source=prefix+'/dashboard/pro?tab=pro_tools&q=actual-source',e=environment(source,{__NA:true,tree:'source-tree'}),requests=[];
  const remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
  try{
   nav.navigatePro('pro_clients',{q:'Álvarez'});assert.equal(requests.length,1);assert.deepEqual(e.calls,[]);assert.equal(e.history.length,1);assert.equal(nav.currentProPath(),source);assert.equal(e.history.state.tree,'source-tree');const target=requests[0];assert.equal(target.path,prefix+'/dashboard/pro?tab=pro_clients&q=%C3%81lvarez');assert.equal(target.entry.account,owner);assert.equal(target.entry.parent,source);assert.match(target.entry.id,/^[a-f0-9-]{36}$/);assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.deepEqual(e.calls,[]);
   nextCommit(e,target.path);const length=e.history.length;assert.equal(nav.completePendingProSectionNavigation(other),false);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.equal(e.history.length,length);assert.equal(e.calls.filter(call=>call[0]==='push').length,1);assert.equal(e.calls.filter(call=>call[0]==='replaceState').length,1);assert.deepEqual(e.history.state,{__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:{opaque:'committed-tree'},tree:{preserved:true},foreignNamespace:{kept:1},ccrProNavigation:target.entry});const completedCalls=e.calls.length;assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(e.calls.length,completedCalls);
  }finally{remove();nav.cancelPendingProSectionNavigation();}
 }
});
adapterCase('completion rejects a different URL, account and unsafe parent',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{
  nav.navigatePro('pro_clients');const request=requests[0];nextCommit(e,'/dashboard/pro?tab=quotes');assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(e.history.state.ccrProNavigation,undefined);nextCommit(e,request.path);assert.equal(nav.completeProSectionNavigation(request.path,{...request.entry,account:other}),false);assert.equal(nav.completeProSectionNavigation(request.path,{...request.entry,parent:'//evil.invalid/dashboard/pro'}),false);assert.equal(nav.completeProSectionNavigation('/dashboard/pro?tab=statistics',request.entry),false);assert.equal(e.history.state.ccrProNavigation,undefined);assert.equal(nav.completePendingProSectionNavigation(owner),true);
 }finally{remove();}
});
adapterCase('rapid section intents are last-wins and retain their actual source parent',()=>{
 const source='/en/dashboard/pro?tab=pro_tools',e=environment(source),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{
  nav.navigatePro('pro_clients');nav.navigatePro('pro_tasks');assert.equal(requests.length,2);assert.deepEqual(e.calls,[]);assert.equal(requests[0].entry.parent,source);assert.equal(requests[1].entry.parent,source);nextCommit(e,requests[0].path);assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(e.history.state.ccrProNavigation,undefined);nextCommit(e,requests[1].path);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.deepEqual(e.history.state.ccrProNavigation,requests[1].entry);
 }finally{remove();}
});
adapterCase('pop cancellation discards pending metadata without cancelling future intents',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{
  nav.navigatePro('pro_clients');nav.cancelPendingProSectionNavigation();nextCommit(e,requests[0].path);assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(e.history.state.ccrProNavigation,undefined);nav.navigatePro('pro_tasks');assert.equal(requests[1].entry.parent,requests[0].path);nextCommit(e,requests[1].path);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.deepEqual(e.history.state.ccrProNavigation,requests[1].entry);
 }finally{remove();}
});
adapterCase('switching account clears pending intent rather than reusing it later',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{
  nav.navigatePro('pro_clients');nav.setProNavigationAccount(other);nextCommit(e,requests[0].path);assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(nav.completePendingProSectionNavigation(other),false);nav.setProNavigationAccount(owner);assert.equal(nav.completePendingProSectionNavigation(owner),false);assert.equal(e.history.state.ccrProNavigation,undefined);
 }finally{remove();}
});
adapterCase('cleanup of an old registration cannot disable its newer replacement',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),old=[],current=[],removeOld=nav.registerProSectionNavigator((path,entry)=>old.push({path,entry})),removeCurrent=nav.registerProSectionNavigator((path,entry)=>current.push({path,entry}));
 try{
  removeOld();nav.navigatePro('pro_clients');assert.equal(old.length,0);assert.equal(current.length,1);assert.deepEqual(e.calls,[]);removeOld();nextCommit(e,current[0].path);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.deepEqual(e.history.state.ccrProNavigation,current[0].entry);removeCurrent();e.calls.length=0;nav.navigatePro('quotes');assert.equal(current.length,1);assert.equal(e.calls[0][0],'push');
 }finally{removeOld();removeCurrent();}
});
adapterCase('blocked section intent invokes neither router nor native history',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{e.block();nav.navigatePro('pro_clients');assert.deepEqual(requests,[]);assert.deepEqual(e.calls,[]);assert.equal(nav.completePendingProSectionNavigation(owner),false);}finally{remove();}
});
adapterCase('professional legacy navigation and independent query editors bypass the section adapter',()=>{
 const requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));
 try{
  const legacy=environment('/en/dashboard/profesional?tab=home',{__NA:true,tree:'legacy-tree'});nav.navigatePro('pro_clients');assert.equal(legacy.calls[0][0],'push');assert.equal(legacy.history.state.tree,'legacy-tree');assert.deepEqual(requests,[]);
  const editor=environment('/en/dashboard/pro?tab=pro_clients',{__NA:true,tree:'editor-tree'});nav.pushProParams({cliente:'known-client',editar:'known-client'});assert.equal(editor.calls[0][0],'push');assert.equal(editor.history.state.tree,'editor-tree');assert.equal(editor.history.state.ccrProNavigation.parent,'/en/dashboard/pro?tab=pro_clients');assert.deepEqual(requests,[]);
  const cross=environment('/en/dashboard/pro?tab=pro_tools',{__NA:true,tree:'cross-tree'});nav.pushProPath('/en/dashboard/profesional?tab=home');assert.deepEqual(cross.calls,[['assign','/en/dashboard/profesional?tab=home']]);assert.deepEqual(cross.history.state,{__NA:true,tree:'cross-tree'});assert.deepEqual(requests,[]);
 }finally{remove();}
});
adapterCase('a completion observer may synchronously schedule the next intent without losing it',()=>{
 const e=environment('/dashboard/pro?tab=pro_tools'),requests=[],remove=nav.registerProSectionNavigator((path,entry)=>requests.push({path,entry}));let observed=false;
 e.onChange(()=>{if(observed)return;observed=true;nav.navigatePro('pro_tasks');});
 try{
  nav.navigatePro('pro_clients');nextCommit(e,requests[0].path);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.equal(observed,true);assert.equal(requests.length,2);assert.equal(requests[1].entry.parent,requests[0].path);assert.deepEqual(e.history.state.ccrProNavigation,requests[0].entry);assert.equal(nav.completePendingProSectionNavigation(owner),false);nextCommit(e,requests[1].path);assert.equal(nav.completePendingProSectionNavigation(owner),true);assert.deepEqual(e.history.state.ccrProNavigation,requests[1].entry);assert.equal(e.calls.filter(call=>call[0]==='push').length,2);
 }finally{remove();}
});
nav.cancelPendingProSectionNavigation();
console.log(`PASS ${adapterPassed} public-router adapter contracts. Legacy route assertions above remain intact. No browser, server or database.`);

import {test,expect} from 'playwright/test';
import {emptyBusiness,saveClient,saveProduct,moveStock} from '../../src/lib/pro/business';
import {validateWorkspaceTransition} from '../../src/lib/pro/validate-transition';
import {build} from 'esbuild';
test('server rejects rewritten history, stock changes and duplicate IDs',()=>{
 let state=saveClient(emptyBusiness(),{id:'c',name:'Cliente',email:'',phone:'',notes:'',archived:false});
 state=saveProduct(state,{id:'p',sku:'A',name:'Cable',stock:5,minimum:1,cost:10,price:20,archived:false});
 expect(validateWorkspaceTransition(emptyBusiness(),state).clients).toHaveLength(1);
 expect(()=>validateWorkspaceTransition(state,{...state,clients:[]})).toThrow();
 expect(()=>validateWorkspaceTransition(state,{...state,clients:[...state.clients,...state.clients]})).toThrow();
 expect(()=>validateWorkspaceTransition(state,{...state,products:[{...state.products[0],stock:100}]})).toThrow();
 const next=moveStock(state,'p',-1,'Servicio','m',new Date().toISOString());
 expect(validateWorkspaceTransition(state,next).products[0].stock).toBe(4);
 expect(()=>validateWorkspaceTransition(next,{...next,movements:[]})).toThrow();
});
test('API access refuses anonymous, expired Pro, invalid origin and admin without MFA',async()=>{
 const bundle=await build({stdin:{contents:`export {proApiAccess} from './src/lib/pro/api-access';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'auth-fixtures',setup(b){
 b.onResolve({filter:/^@\/lib\/(supabase\/(server|admin|get-user)|auth\/admin|pro\/workspace-user)$/},args=>({path:args.path,namespace:'fixture'}));// Round 7C: api-access reads the account through workspace-user (same fixture user)
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('get-user')||args.path.endsWith('workspace-user')?'exports.safeGetUser=async()=>globalThis.proFixture.user;':args.path.endsWith('auth/admin')?'exports.getApiAdmin=async()=>globalThis.proFixture.mfa?{id:"u"}:null;':args.path.endsWith('/server')?'exports.createClient=async()=>({});':`exports.createAdminClient=()=>({from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='profiles'?globalThis.proFixture.profile:globalThis.proFixture.grant}),limit:async()=>({data:table==='professionals'?[{is_banned:false}]:[],error:null})})})})});`,loader:'js'}));
 }}]});
 // Isolated compiled module; no credentials or network.
 const fixture={user:null as null|{id:string},profile:{role:'professional',is_disabled:false},grant:null as null|{status:string,expires_at:null},mfa:false};
 const globals=globalThis as typeof globalThis & {proFixture?:typeof fixture};globals.proFixture=fixture;
 const compiled={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(compiled,compiled.exports,()=>({}));
 const api=(compiled.exports as {proApiAccess:(r:Request,a?:boolean)=>Promise<{error?:Response}>}).proApiAccess;
 const before=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'development'});
 try{
 const req=()=>new Request('http://localhost/api/pro/workspace');
 expect((await api(req())).error?.status).toBe(401);fixture.user={id:'u'};
 expect((await api(req())).error?.status).toBe(403);fixture.grant={status:'active',expires_at:null};expect((await api(req())).error).toBeUndefined();
 expect((await api(new Request('http://localhost/api/pro/workspace',{method:'PUT',headers:{origin:'https://evil.example'}}))).error?.status).toBe(403);
 expect((await api(new Request('http://localhost:3185/api/pro/workspace',{method:'PUT',headers:{host:'127.0.0.1:3185',origin:'http://127.0.0.1:3185'}}))).error).toBeUndefined();
 expect((await api(req(),true)).error?.status).toBe(403);fixture.profile.role='admin';expect((await api(req(),true)).error?.status).toBe(403);fixture.mfa=true;expect((await api(req(),true)).error).toBeUndefined();
 Object.assign(process.env,{NODE_ENV:'production'});expect((await api(req())).error?.status).toBe(404);
 }finally{Object.assign(process.env,{NODE_ENV:before});delete globals.proFixture;}
});
test('account-backed workspace loads, saves revision and shows conflict without discarding draft',async({page})=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ProWorkspace}from'./src/components/pro/pro-workspace';createRoot(document.getElementById('root')).render(<ProWorkspace server/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,define:{'process.env':JSON.stringify({NODE_ENV:'test'})},platform:'browser',format:'iife',jsx:'automatic'});
 let revision=0;let document=emptyBusiness();let conflict=false;
 await page.route('**/api/pro/workspace',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{document,revision}});
  const body=route.request().postDataJSON();expect(body.revision).toBe(revision);expect(body.userId).toBeUndefined();
  if(conflict)return route.fulfill({status:409,json:{error:'Los datos cambiaron. Recargue antes de guardar.'}});
  document=body.document;revision++;return route.fulfill({json:{revision}});
 });
 await page.route('**/account-pro-harness',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('/account-pro-harness');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'Nuevo cliente'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Cuenta A');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('heading',{name:'Cuenta A'})).toBeVisible();
 expect(document.clients[0].name).toBe('Cuenta A');expect(revision).toBe(1);
 conflict=true;await page.getByRole('button',{name:'Nuevo cliente'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Borrador conservado');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Recargue');await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('Borrador conservado');expect(document.clients).toHaveLength(1);
});
test('subscription verification refuses mismatched amounts, currencies and live responses',async()=>{
 const {canActivateSubscription}=await import('../../src/lib/pro/billing/contracts');
 const order={id:'o',userId:'a',amountMinor:100000,currency:'CRC' as const,provider:'tilopay' as const,environment:'test' as const};
 const paid={orderId:'o',amountMinor:100000,currency:'CRC',status:'approved' as const,environment:'test',transactionId:'t'};
 expect(canActivateSubscription(order,paid)).toBe(true);
 for(const mismatch of [{amountMinor:1},{currency:'USD'},{orderId:'other'},{environment:'live'},{transactionId:''},{status:'pending' as const}])expect(canActivateSubscription(order,{...paid,...mismatch})).toBe(false);
});

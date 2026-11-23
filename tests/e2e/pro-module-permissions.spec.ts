import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {moduleOfCapability,normalizeDenies,routeAction,modulePermissionsMutationSchema,isDenied,moduleLabel,actionLabel,PERMISSION_MODULES,PERMISSION_ACTIONS} from '../../src/lib/pro/module-permissions';

// Row 17 (migration 404): fine permissions by module and action. Pure helpers first, then the SQL gate
// (pro_team_route_authorize) against local Supabase with a real owner and member: denials only take away, the
// Administrator is never restricted, a custom role is a separate subject, CAS and replay hold.
test.describe('module permissions: pure helpers',()=>{
 test('route action follows the HTTP method and export paths',()=>{
  expect(routeAction('GET','/api/pro/invoices')).toBe('view');
  expect(routeAction('get','/api/pro/invoice-print')).toBe('export');
  expect(routeAction('GET','/api/pro/accounting-export')).toBe('export');
  expect(routeAction('POST','/api/pro/invoice-drafts')).toBe('edit');
  expect(routeAction('DELETE','/api/pro/catalog')).toBe('delete');
 });
 test('capability to module mapping and labels exist in both languages',()=>{
  expect(moduleOfCapability('finance.write')).toBe('finance');expect(moduleOfCapability('listing.publish')).toBe('listing');expect(moduleOfCapability('team.manage')).toBeNull();expect(moduleOfCapability('read')).toBeNull();
  for(const m of PERMISSION_MODULES){expect(moduleLabel(m,false)).not.toBe(m);expect(moduleLabel(m,true)).not.toBe(m);}
  for(const a of PERMISSION_ACTIONS){expect(actionLabel(a,false)).not.toBe(a);expect(actionLabel(a,true)).not.toBe(a);}
 });
 test('normalize drops empties and duplicates, and never hides jobs',()=>{
  expect(normalizeDenies({member:{finance:['delete','delete','export'],sales:[],work:['view','delete']}})).toEqual({member:{finance:['delete','export'],work:['delete']}});
  expect(isDenied({finance:['export']},'finance','export')).toBe(true);expect(isDenied(undefined,'finance','export')).toBe(false);
  expect(()=>modulePermissionsMutationSchema.parse({action:'save',actionId:crypto.randomUUID(),revision:0,denies:{member:{bogus:['view']}}})).toThrow();
  expect(modulePermissionsMutationSchema.parse({action:'save',actionId:crypto.randomUUID(),revision:0,denies:{member:{finance:['view']}}}).revision).toBe(0);
 });
});

test('module permissions SQL gate: deny only, per role and custom role, CAS and replay',async()=>{
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'pro-modperm-owner'}),member=await createDisposableAccount({prefix:'pro-modperm-member'}),other=await createDisposableAccount({prefix:'pro-modperm-other'});
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Permisos locales',slug:'modperm-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const m=await db.from('pro_company_members').insert([{owner_id:owner.id,member_user_id:member.id,member_name:'Gerente Prueba',member_email:member.email,role:'manager'}]).select('id').single();expect(m.error).toBeNull();
  const authorize=async(method:string,path:string)=>{const r=await db.rpc('pro_team_route_authorize',{p_member:member.id,p_owner:owner.id,p_method:method,p_path:path});expect(r.error).toBeNull();return r.data as {allowed:boolean;reason?:string;module?:string;action?:string};};
  // No matrix yet: the manager keeps what its role allows.
  expect((await authorize('POST','/api/pro/invoice-drafts')).allowed).toBe(true);
  // Only an Administrator (team.manage) can save; a manager cannot.
  const refused=await db.rpc('pro_module_permissions_mutate',{p_actor:member.id,p_owner:owner.id,p_input:{action:'save',actionId:crypto.randomUUID(),revision:0,denies:{manager:{finance:['edit']}}}});expect(refused.error?.code).toBe('42501');
  const id1=crypto.randomUUID(),input={action:'save',actionId:id1,revision:0,denies:{manager:{finance:['edit','export','edit']}}};
  const saved=await db.rpc('pro_module_permissions_mutate',{p_actor:owner.id,p_owner:owner.id,p_input:input});expect(saved.error).toBeNull();expect(saved.data).toMatchObject({revision:1,denies:{manager:{finance:['edit','export']}},replayed:false});
  const replay=await db.rpc('pro_module_permissions_mutate',{p_actor:owner.id,p_owner:owner.id,p_input:input});expect(replay.data).toMatchObject({revision:1,replayed:true});
  const stale=await db.rpc('pro_module_permissions_mutate',{p_actor:owner.id,p_owner:owner.id,p_input:{...input,actionId:crypto.randomUUID()}});expect(stale.error?.code).toBe('40001');
  expect((await db.rpc('pro_module_permissions_mutate',{p_actor:owner.id,p_owner:owner.id,p_input:{action:'save',actionId:crypto.randomUUID(),revision:1,denies:{manager:{work:['view']}}}})).error?.code).toBe('22023');
  expect((await db.rpc('pro_module_permissions_mutate',{p_actor:owner.id,p_owner:owner.id,p_input:{action:'save',actionId:crypto.randomUUID(),revision:1,denies:{ghost:{finance:['edit']}}}})).error?.code).toBe('22023');
  // The gate now refuses finance edits and exports for the manager, but not views or other modules.
  expect(await authorize('POST','/api/pro/invoice-drafts')).toMatchObject({allowed:false,reason:'module_action',module:'finance',action:'edit'});
  expect(await authorize('GET','/api/pro/invoice-print')).toMatchObject({allowed:false,reason:'module_action',action:'export'});
  expect((await authorize('GET','/api/pro/invoice-drafts')).allowed).toBe(true);
  expect((await authorize('POST','/api/pro/lead-board')).allowed).toBe(true);
  // The resolved workspace carries the denied list for the interface.
  const ws=await db.rpc('pro_team_workspace_resolve',{p_member:member.id,p_owner:owner.id});expect((ws.data as {denied:Record<string,string[]>}).denied).toEqual({finance:['edit','export']});
  // Read the matrix (any member can read; only admin manages).
  const read=await db.rpc('pro_module_permissions_read',{p_actor:member.id,p_owner:owner.id});expect(read.data).toMatchObject({revision:1,canManage:false});
  expect((await db.rpc('pro_module_permissions_read',{p_actor:other.id,p_owner:owner.id})).error?.code).toBe('42501');
  // An Administrator member is never restricted, even with a matching key.
  await db.from('pro_company_members').update({role:'admin'}).eq('owner_id',owner.id).eq('id',m.data!.id).throwOnError();
  expect((await authorize('POST','/api/pro/invoice-drafts')).allowed).toBe(true);
  // History is append-only.
  const hist=await db.from('pro_company_module_permission_history').select('action_id').eq('owner_id',owner.id);expect(hist.data).toHaveLength(1);
  expect((await db.from('pro_company_module_permission_history').update({actor_id:member.id}).eq('owner_id',owner.id)).error).not.toBeNull();
 }finally{await cleanupDisposableAccount(other);await cleanupDisposableAccount(member);await cleanupDisposableAccount(owner);}
});

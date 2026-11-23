import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {conditionFromWmo,openMeteoProvider,readWeather,resolveWeatherProvider,sandboxProvider} from '../../src/lib/pro/weather';
import {dailyLogSettingsSaveSchema} from '../../src/lib/pro/daily-log-automation';

// Row 20 (migration 405): weather provider adapter and automatic daily log drafts. Adapter specs never touch the
// network (injected fetch); the SQL spec uses local Supabase only.
const q={latitude:9.93,longitude:-84.08,date:'2026-11-20',workId:'w1',en:false};
test.describe('weather adapter (no network)',()=>{
 test('auto resolves to the labelled sample unless the server default says otherwise; manual gives nothing',async()=>{
  expect(resolveWeatherProvider('auto',undefined)?.id).toBe('mock');expect(resolveWeatherProvider('auto','open-meteo')?.id).toBe('open-meteo');expect(resolveWeatherProvider('auto','sandbox')?.id).toBe('sandbox');
  expect(resolveWeatherProvider('manual','open-meteo')).toBeNull();expect(await readWeather('manual',q)).toBeNull();
  expect((await readWeather('auto',q,undefined))!.source).toBe('mock');
 });
 test('sandbox provider is deterministic and labelled',async()=>{
  const a=await sandboxProvider.read(q),b=await sandboxProvider.read(q);expect(a).toEqual(b);expect(a.source).toBe('sandbox');expect(a.note).toContain('prueba');
  expect((await sandboxProvider.read({...q,en:true})).note).toContain('sandbox');
 });
 test('WMO codes map to daily log conditions',()=>{
  expect(conditionFromWmo(0)).toBe('clear');expect(conditionFromWmo(3)).toBe('cloudy');expect(conditionFromWmo(63)).toBe('rain');expect(conditionFromWmo(95)).toBe('rain');expect(conditionFromWmo(71)).toBe('other');expect(conditionFromWmo(1,4)).toBe('rain');
 });
 test('Open-Meteo reading is parsed from the provider payload; failures fall back to the labelled sample',async()=>{
  let called='';const ok=(async(url:string)=>{called=String(url);return new Response(JSON.stringify({daily:{time:['2026-11-20'],weather_code:[61],temperature_2m_mean:[23.6],precipitation_sum:[5.2]}}),{status:200});}) as unknown as typeof fetch;
  const r=await openMeteoProvider.read(q,ok);expect(r).toMatchObject({condition:'rain',temperatureC:24,source:'open-meteo'});expect(called).toContain('start_date=2026-11-20');expect(called).toContain('America%2FCosta_Rica');
  const bad=(async()=>new Response('x',{status:500})) as unknown as typeof fetch,fell=await readWeather('open-meteo',q,undefined,bad);expect(fell).toMatchObject({source:'mock'});expect(fell!.note).toContain('no se pudo consultar');
  const missing=(async()=>new Response(JSON.stringify({daily:{time:['2026-11-19'],weather_code:[1],temperature_2m_mean:[20]}}),{status:200})) as unknown as typeof fetch;
  expect((await readWeather('open-meteo',{...q,en:true},undefined,missing))!.note).toContain('could not be reached');
 });
 test('settings contract rejects unknown providers and out-of-range values',()=>{
  expect(()=>dailyLogSettingsSaveSchema.parse({kind:'weather',revision:0,provider:'bogus',latitude:9,longitude:-84,place:''})).toThrow();
  expect(()=>dailyLogSettingsSaveSchema.parse({kind:'automation',revision:0,enabled:true,includeWeather:true,lookbackDays:9})).toThrow();
  expect(dailyLogSettingsSaveSchema.parse({kind:'automation',revision:0,enabled:true,includeWeather:true,lookbackDays:3}).kind).toBe('automation');
 });
});

test('daily log settings and automatic private drafts (SQL, local)',async()=>{
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'pro-autolog-owner'});
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Bitacora local',slug:'autolog-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const read=await db.rpc('pro_daily_log_settings_read',{p_owner:owner.id});expect(read.error).toBeNull();expect(read.data).toMatchObject({weather:{provider:'auto',revision:0},automation:{enabled:false,lookbackDays:2,revision:0}});
  const w=await db.rpc('pro_daily_log_settings_save',{p_owner:owner.id,p_input:{kind:'weather',revision:0,provider:'sandbox',latitude:10.5,longitude:-85.1,place:'Obra Norte'}});expect(w.data).toMatchObject({weather:{provider:'sandbox',place:'Obra Norte',revision:1}});
  expect((await db.rpc('pro_daily_log_settings_save',{p_owner:owner.id,p_input:{kind:'weather',revision:0,provider:'auto',latitude:10,longitude:-85,place:''}})).error?.code).toBe('40001');
  expect((await db.rpc('pro_daily_log_settings_save',{p_owner:owner.id,p_input:{kind:'weather',revision:1,provider:'bogus',latitude:10,longitude:-85,place:''}})).error?.code).toBe('22023');
  // Automation off: nothing is drafted and creating is refused.
  const today='2026-11-23',workId=crypto.randomUUID();
  expect((await db.rpc('pro_daily_log_auto_candidates',{p_owner:owner.id,p_today:today})).data).toMatchObject({enabled:false,items:[]});
  expect((await db.rpc('pro_daily_log_auto_create',{p_owner:owner.id,p_today:today,p_input:{workId,date:'2026-11-22',title:'x',summary:'y',minutes:null,weather:null}})).error?.code).toBe('42501');
  const on=await db.rpc('pro_daily_log_settings_save',{p_owner:owner.id,p_input:{kind:'automation',revision:0,enabled:true,includeWeather:true,lookbackDays:2}});expect(on.data).toMatchObject({automation:{enabled:true,revision:1}});
  // Unknown job: nothing created (no invented rows).
  expect(((await db.rpc('pro_daily_log_auto_create',{p_owner:owner.id,p_today:today,p_input:{workId,date:'2026-11-22',title:'x',summary:'y',minutes:null,weather:null}})).data)).toMatchObject({created:false,reason:'no_work'});
  // Out of the lookback window.
  expect(((await db.rpc('pro_daily_log_auto_create',{p_owner:owner.id,p_today:today,p_input:{workId,date:'2026-11-10',title:'x',summary:'y',minutes:null,weather:null}})).data)).toMatchObject({created:false,reason:'out_of_window'});
  // A real job with a stopped time entry yesterday becomes a candidate and one private draft, only once.
  await db.from('pro_work').insert({user_id:owner.id,id:workId,client_id:null,client:'Cliente',service:'Obra de prueba',stage:'scheduled',start:'2026-11-20T09:00:00-06:00',end:'2026-11-22T11:00:00-06:00'}).throwOnError();
  const cand=await db.rpc('pro_daily_log_auto_candidates',{p_owner:owner.id,p_today:today});expect(cand.error).toBeNull();expect((cand.data as {items:unknown[]}).items.length).toBeGreaterThanOrEqual(0);
  const make=()=>db.rpc('pro_daily_log_auto_create',{p_owner:owner.id,p_today:today,p_input:{workId,date:'2026-11-22',title:'Borrador automático: Obra de prueba',summary:'Borrador automático',minutes:120,weather:{condition:'rain',temperatureC:22,note:'Clima del proveedor de pruebas'}}});
  const first=await make();expect(first.error).toBeNull();expect(first.data).toMatchObject({created:true});
  expect((await make()).data).toMatchObject({created:false,reason:'exists'});
  const log=await db.from('pro_daily_logs').select('*').eq('owner_id',owner.id).eq('work_id',workId).single();expect(log.data).toMatchObject({revision:1,published_revision:null,archived:false,sections:{weather:true,time:true,plan:false,tasks:false}});
  expect((await db.from('pro_daily_log_versions').select('log_id').eq('owner_id',owner.id)).data).toHaveLength(0);
  expect((await db.from('pro_daily_log_history').select('action').eq('owner_id',owner.id).eq('log_id',log.data!.id)).data).toEqual([{action:'create'}]);
  // Archiving the draft does not recreate it.
  await db.from('pro_daily_logs').update({archived:true}).eq('owner_id',owner.id).eq('id',log.data!.id).throwOnError();
  expect((await make()).data).toMatchObject({created:false,reason:'exists'});
 }finally{await cleanupDisposableAccount(owner);}
});

import { test,expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as platform from "../../src/lib/analytics/platform";
import * as contract from "../../src/lib/analytics/growth-contract";
import { NextRequest, NextResponse } from "next/server";
import { peticionAutomatizada } from "../../src/lib/analytics/trafico-automatizado";
import * as measurement from "../../src/lib/privacy/measurement-request";
import * as minimal from "../../src/lib/analytics/meta-minimal";
const requireNode=createRequire(`${process.cwd()}/tests/e2e/meta-growth-runtime.spec.ts`);
function load<T>(file: string, mocks: Record<string,unknown>, globals: Record<string,unknown>={}) {
 const source=readFileSync(`${process.cwd()}/${file}`,"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const moduleBox={exports:{} as T};
 runInNewContext(code,{module:moduleBox,exports:moduleBox.exports,require:(name:string)=>name in mocks?mocks[name]:name === "@/lib/privacy/measurement-request" ? measurement : requireNode(name),console:{warn:()=>{},log:()=>{}},URL,Date,process:{env:{META_CAPI_ENABLED:"true"}},...globals});
 return moduleBox.exports;
}
const request=(cookie="cc_analytics_sid=visitor; ccr_ads_consent_v2=accepted; _fbp=fb.1.1792500000000.123456",host="contratacr.com",ua="Mozilla/5.0")=>new Request(`https://${host}/api/projects`,{headers:{cookie,"user-agent":ua}});
test("server consent, native, bots, test domains and attribution use real runtime guards",()=>{
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{COOKIE_ADMIN_EXCLUDED:"ccr_admin_analytics_excluded",esPeticionAutomatizada:(cookie:string,ua:string)=>cookie==="1"||ua.includes("Headless")},"@/lib/supabase/admin":{createAdminClient:()=>{throw new Error("unexpected DB");}}});
 expect(lib.growthContext(request()).allowed).toBe(true);
 for(const req of [request("cc_analytics_sid=x"),request("cc_analytics_sid=x; ccr_meta_consent=enabled"),request("cc_analytics_sid=x; ccr_ads_consent_v2=declined"),request("cc_analytics_sid=x; ccr_ads_consent_v2=accepted; ccr_admin_analytics_excluded=1"),request("cc_analytics_sid=x; ccr_ads_consent_v2=accepted; ccr_platform=native"),request(undefined,"test.contratacr.com"),request(undefined,"localhost"),request(undefined,undefined,"HeadlessChrome")])expect(lib.growthContext(req).allowed).toBe(false);
 const attribution=encodeURIComponent(JSON.stringify({source:"meta",campaign:"clientes",content:"one",capturedAt:new Date().toISOString(),privateText:"secret"}));
 const context=lib.growthContext(request(`cc_analytics_sid=x; ccr_ads_consent_v2=accepted; ccr_statistics_consent_v1=accepted; ccr_action_attribution=${attribution}`));
 expect(context.attribution.campaign).toBe("clientes");expect(context.attribution.privateText).toBeUndefined();expect(context.actorHash).not.toBe("x");
});
test("only the first successful business receipt queues a minimal CAPI payload",async()=>{
 type StoredRow={ event_id:string; status:string; payload: { event_id:string; custom_data:Record<string,unknown> } | null };
 const rows:StoredRow[]=[];const seen=new Set<string>();
 const db={from:()=>({insert:async(row:StoredRow)=>{if(seen.has(row.event_id))return{error:{code:"23505"}};seen.add(row.event_id);rows.push(row);return{error:null};}})};
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{COOKIE_ADMIN_EXCLUDED:"ccr_admin_analytics_excluded",esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}});
 const first=await lib.recordServiceContact(request(),"professional");
 if (!first) throw new Error("expected successful conversion receipt");
 expect(first.eventName).toBe("Contact");expect(rows[0].payload?.event_id).toBe(first.eventId);expect(rows[0].payload?.custom_data).toEqual({action:"service_contact",audience:"client",measurement_version:"minimal-optin-2026-10-29"});
 expect(await lib.recordServiceContact(request(),"professional")).toBeNull();expect(rows).toHaveLength(1);
 expect(JSON.stringify(rows[0].payload)).not.toMatch(/email|cedula|description|message|budget/);
 await lib.recordGrowthConversion(request("cc_analytics_sid=visitor; ccr_ads_consent_v2=declined; ccr_statistics_consent_v1=accepted"),"project_published","project");
 expect(rows[1]).toMatchObject({status:"suppressed",payload:null});
});
test("browser business receipts cannot create a duplicate or leak free-text parameters",()=>{
 const calls:unknown[]=[];
 const lib=load<typeof import("../../src/lib/analytics/meta-pixel")>("src/lib/analytics/meta-pixel.ts",{
 "./native-measurement":{trackNativeMeasurement:()=>{},trackNativeConversion:()=>{}},
 "@/lib/privacy/optional-consent":{advertisingMeasurementEnabled:()=>true,syncAdvertisingCookie:()=>{}},
 "@/hooks/use-native-app":{isNativeAppRuntime:()=>false},
 "@/lib/analytics/trafico-automatizado":{esNavegadorAutomatizado:()=>false}
 },{fetch:(...args:unknown[])=>{calls.push(args);}});
 lib.trackMetaConversion({eventName:"Contact",eventId:"stable-id",params:{action:"service_contact",audience:"client"}});
 lib.trackMetaEvent("Search",{search_string:"private text"});expect(calls).toHaveLength(0);
});

test("missing direct delivery configuration never pretends browser delivery succeeded",async()=>{
 type Row={ event_id:string;status:string;payload:unknown };
 const rows:Row[]=[];
 const db={from:()=>({insert:async(row:Row)=>{rows.push(row);return{error:null};}})};
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{COOKIE_ADMIN_EXCLUDED:"ccr_admin_analytics_excluded",esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}},{process:{env:{}}});
 const lead=await lib.recordGrowthConversion(request(),"project_published","project","client");
 expect(lead).toBeNull();expect(rows[0]).toMatchObject({status:"suppressed",payload:null});
 const winner=await lib.recordGrowthConversion(request(),"professional_project_accepted","project","professional",{metaAllowed:false});
 expect(winner).toBeNull();expect(rows[1]).toMatchObject({status:"suppressed",payload:null});
});

test("administrator actions never create conversion receipts or Meta delivery", async () => {
 let dbCalls = 0;
 const lib = load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts", {
  "@/lib/analytics/admin-activity": { analyticsActor: async () => ({ id: "admin-account", excluded: true }) },
  "server-only": {}, "./platform": platform, "./growth-contract": contract, "./meta-minimal": minimal,
  "./trafico-automatizado": { esPeticionAutomatizada: () => false },
  "@/lib/supabase/admin": { createAdminClient: () => { dbCalls++; throw new Error("admin conversion must not be written"); } },
 });
 expect(await lib.recordGrowthConversion(request(), "project_published", "project", "admin-account")).toBeNull();
 expect(await lib.recordServiceContact(request(), "professional", "admin-account")).toBeNull();
 expect(dbCalls).toBe(0);
});

test("landing measurement sends only event and opaque ID, expires and respects refusal/native guards",async()=>{
 const storage=new Map<string,string>();const requests:Record<string,unknown>[]=[];let declined=false;let native=false;let serial=0;
 const cookies=new Map<string,string>();
 const document={get cookie(){return [...cookies].map(([k,v])=>`${k}=${v}`).join('; ');},set cookie(value:string){const pair=value.split(';')[0];const index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}};
 const window={location:{hostname:'contratacr.com',search:'?email=private@example.com'},crypto:{getRandomValues:(a:Uint32Array)=>{a[0]=123;return a;},randomUUID:()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`},sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}};
 const lib=load<typeof import('../../src/lib/analytics/meta-pixel')>('src/lib/analytics/meta-pixel.ts',{
 './native-measurement':{trackNativeMeasurement:()=>{},trackNativeConversion:()=>{}},
 '@/lib/privacy/optional-consent':{advertisingMeasurementEnabled:()=>!declined,syncAdvertisingCookie:()=>{}},
 '@/hooks/use-native-app':{isNativeAppRuntime:()=>native},
 '@/lib/analytics/trafico-automatizado':{esNavegadorAutomatizado:()=>false},
 },{window,document,URLSearchParams,Uint32Array,fetch:async(_url:string,init:RequestInit)=>{requests.push(JSON.parse(String(init.body)));return {ok:true};}});
 lib.trackMetaPageView();await Promise.resolve();await Promise.resolve();
 expect(requests).toEqual([{event:'PageView',id:'00000000-0000-4000-8000-000000000001'}]);
 lib.trackMetaPageView();expect(requests).toHaveLength(1);
 storage.set('ccr:meta-minimal:PageView:at',String(Date.now()-31*60*1000));
 lib.trackMetaPageView();await Promise.resolve();await Promise.resolve();expect(requests).toHaveLength(2);
 declined=true;lib.trackMetaEvent('CompleteRegistration');expect(requests).toHaveLength(2);
 declined=false;native=true;lib.trackMetaEvent('CompleteRegistration');expect(requests).toHaveLength(2);
 expect(JSON.stringify(requests)).not.toContain('private');
});

test("queue erases delivered matching data and does not count revoked or reclaimed receipts", async () => {
 for (const scenario of ["delivered", "withdrawn-before-send", "reclaimed", "withdrawn-during-send"] as const) {
  const row = { event_id: "0123456789abcdef", payload: { synthetic: true }, attempts: 1, locked_at: "2026-10-22T12:00:00Z" };
  let sends = 0;
  let mutation: Record<string, unknown> | undefined;
  const filters: [string,unknown][] = [];
  const current = { status: scenario === "withdrawn-before-send" ? "suppressed" : "sending", attempts: scenario === "reclaimed" ? 2 : 1, locked_at: row.locked_at };
  const db = {
   rpc: async (name: string) => ({ data: name === "claim_growth_conversions" ? [row] : null, error: null }),
   from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }) }),
    update: (patch: Record<string,unknown>) => {
     mutation = patch;
     const chain = { eq: (key: string, value: unknown) => { filters.push([key,value]); return chain; }, select: async () => ({ data: scenario === "withdrawn-during-send" ? [] : [{event_id: row.event_id}], error: null }) };
     return chain;
    },
   }),
  };
  const route = load<typeof import("../../src/app/api/internal/meta/drain/route")>("src/app/api/internal/meta/drain/route.ts", {
   "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body,init) } },
   "@/lib/supabase/admin": { createAdminClient: () => db },
   "@/lib/push/worker-auth": { isAuthorizedPushWorkerRequest: () => true },
   "@/lib/analytics/meta-delivery": { metaTestEventCode: () => undefined, sendMetaConversion: async () => { sends++; return "sent"; } },
  }, {process:{env:{META_CAPI_ENABLED:"true",NEXT_PUBLIC_META_PIXEL_ID:"123",META_CAPI_ACCESS_TOKEN:"synthetic",META_GRAPH_API_VERSION:"v99.0"}}});
  const response = await route.POST(new Request("https://contratacr.com/api/internal/meta/drain",{method:"POST"}));
  expect(response.status).toBe(200);
  expect((await response.json()).sent).toBe(scenario === "delivered" ? 1 : 0);
  expect(sends).toBe(scenario === "withdrawn-before-send" || scenario === "reclaimed" ? 0 : 1);
  if (sends) {
   expect(mutation).toMatchObject({status:"sent",payload:null,locked_at:null});
   expect(filters).toContainEqual(["attempts",row.attempts]);
   expect(filters).toContainEqual(["locked_at",row.locked_at]);
  }
 }
});


test("signed-out operator browser stays excluded while a fresh guest remains measurable", () => {
 const make = (cookie: string) => new NextRequest("https://contratacr.com/api/analytics/journey", {headers:{cookie,"user-agent":"Mozilla/5.0"}});
 expect(peticionAutomatizada(make("ccr_admin_analytics_excluded=1"))).toBe(true);
 expect(peticionAutomatizada(make("ccr_admin_analytics_excluded=0"))).toBe(false);
 expect(peticionAutomatizada(make(""))).toBe(false);
});


test("only a verified admin role sets the persistent exclusion cookie", async () => {
 for (const administrator of [true, false]) {
  const route = load<typeof import("../../src/app/api/analytics/usage/route")>("src/app/api/analytics/usage/route.ts", {
   "next/server": { NextResponse },
   "@/lib/analytics/admin-activity": { analyticsActor: async () => ({id:"operator",excluded:true,administrator}) },
   "@/lib/analytics/platform": platform,
   "@/lib/analytics/trafico-automatizado": {COOKIE_ADMIN_EXCLUDED:"ccr_admin_analytics_excluded",peticionAutomatizada:()=>false},
   "@/lib/rate-limit": { enforceRateLimit: () => null },
   "@/lib/supabase/server": {createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"operator"}}})}})},
   "@/lib/supabase/admin": {createAdminClient:()=>({rpc:async()=>({error:null})})},
  },{process:{env:{NODE_ENV:"production"}}});
  const response = await route.POST(new NextRequest("https://contratacr.com/api/analytics/usage", {method:"POST",headers:{cookie:"ccr_statistics_consent_v1=accepted"},body:JSON.stringify({session:"00000000-0000-4000-8000-000000000001",screen:"00000000-0000-4000-8000-000000000002",path:"/"})}));
  expect(response.status).toBe(204);
  expect(response.headers.get("x-analytics-excluded")).toBe("1");
  const cookie = response.headers.get("set-cookie") ?? "";
  if (administrator) {
   expect(cookie).toContain("ccr_admin_analytics_excluded=1");
   expect(cookie).toContain("Max-Age=31536000");
   expect(cookie).not.toContain("operator");
  } else expect(cookie).toBe("");
 }
});


test("follow-up records a hire only on the client's explicit confirmation", async () => {
 for (const action of ["not_now", "not_hired", "no_response", "hired"]) {
  const conversions: unknown[][] = [];
  const followup = {id:"followup-test",client_id:"client",professional_id:"professional",status:"contacted",contacted_at:new Date().toISOString()};
  const builder: Record<string, unknown> = {};
  for (const method of ["select","eq","is","neq","in","lte","update"]) builder[method] = () => builder;
  builder.maybeSingle = async () => ({data:followup,error:null});
  builder.then = (resolve: (value: unknown) => void) => resolve({error:null});
  const route = load<typeof import("../../src/app/api/contact/follow-up/route")>("src/app/api/contact/follow-up/route.ts", {
   "next/server":{NextRequest,NextResponse},
   "@/lib/analytics/growth-server":{recordGrowthConversion:async (...args:unknown[])=>{conversions.push(args);return null;}},
   "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>builder})},
   "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"client"}}})}})},
   "@/lib/contact-followup":{contactCookieValue:()=>"token",hashContactToken:()=>"hash",setContactCookie:()=>{}},
  });
  const response = await route.PATCH(new NextRequest("https://contratacr.com/api/contact/follow-up",{method:"PATCH",body:JSON.stringify({id:"followup-test",action})}));
  expect(response.status).toBe(200);
  expect(conversions).toHaveLength(action === "hired" ? 1 : 0);
  if (action === "hired") expect(conversions[0].slice(1)).toEqual(["service_hire_confirmed","followup:followup-test","client"]);
 }
});

 test("declined or missing statistics never reach analytics storage", async () => {
 for (const file of ["usage", "journey", "interaction"]) {
 const route=load<{POST:(req:NextRequest)=>Promise<Response>}>(`src/app/api/analytics/${file}/route.ts`, {
 "next/server":{NextResponse}, "@/lib/analytics/admin-activity":{}, "@/lib/analytics/platform":platform,
 "@/lib/analytics/trafico-automatizado":{}, "@/lib/rate-limit":{},
 "@/lib/supabase/server":{createClient:()=>{throw new Error("must not read account");}},
 "@/lib/supabase/admin":{createAdminClient:()=>{throw new Error("must not record");}}
 });
 for(const cookie of ["", "ccr_statistics_consent_v1=declined", "ccr_ads_consent_v2=accepted"]) {
 const response=await route.POST(new NextRequest(`https://contratacr.com/api/analytics/${file}`,{method:"POST",headers:{cookie}}));
 expect(response.status).toBe(204);expect(response.headers.get("set-cookie")).toBeNull();
 }
 }
 });

 test("native advertising configuration does not require statistics and cleanup is same-origin HttpOnly", async () => {
 let lookups=0;
 const route=load<typeof import("../../src/app/api/privacy/measurement/route")>("src/app/api/privacy/measurement/route.ts",{
 "next/server":{NextResponse}, "@/lib/analytics/admin-activity":{analyticsActor:async()=>{lookups++;return {excluded:false};}},
 "@/lib/analytics/trafico-automatizado":{COOKIE_ADMIN_EXCLUDED:"ccr_admin_analytics_excluded",peticionAutomatizada:()=>false}
 });
 const request=(cookie:string,origin="https://contratacr.com")=>new NextRequest("https://contratacr.com/api/privacy/measurement",{headers:{cookie,origin}});
 expect(await (await route.GET(request(""))).json()).toMatchObject({excluded:true});expect(lookups).toBe(0);
 expect(await (await route.GET(request("ccr_ads_consent_v2=accepted"))).json()).toMatchObject({excluded:false});expect(lookups).toBe(1);
 expect((await route.DELETE(request("","https://other.test"))).status).toBe(403);
 const response=await route.DELETE(request(""));expect(response.status).toBe(204);
 expect(response.headers.get("set-cookie")).toMatch(/cc_analytics_sid=;.*Max-Age=0.*HttpOnly/i);
 });

 test("requested contacts remain in connections without optional interaction events", async () => {
 const tables:Record<string,unknown[]>={whatsapp_contact_followups:[{professional_id:"pro",contacted_at:"2026-10-29T00:00:00Z"}],professionals:[{id:"pro",profiles:{full_name:"Professional"},verification_status:"verified"}]};
 const db={from:(table:string)=>{ const chain:Record<string,unknown>={};for(const method of ["select","eq","in","not"]) chain[method]=()=>chain;chain.then=(resolve:(value:unknown)=>void)=>resolve({data:tables[table]??[],error:null});return chain;}};
 const route=load<typeof import("../../src/app/api/client/connections/route")>("src/app/api/client/connections/route.ts",{
 "next/server":{NextResponse},"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"client"}}})}})},"@/lib/display-name":{getProfessionalDisplayName:(name:string)=>({primaryDesktop:name})},"@/lib/data/categories":{getCategoryLabel:()=>null},"@/lib/text/repair-visible-text":{repairVisibleText:(s:string)=>s}
 });
 const result=await (await route.GET()).json();expect(result.connections).toHaveLength(1);expect(result.connections[0]).toMatchObject({professionalId:"pro",source:"contact",count:1});
 });

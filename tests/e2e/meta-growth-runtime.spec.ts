import { test,expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../../src/lib/analytics/growth-contract";
const requireNode=createRequire(`${process.cwd()}/tests/e2e/meta-growth-runtime.spec.ts`);
function load<T>(file: string, mocks: Record<string,unknown>, globals: Record<string,unknown>={}) {
 const source=readFileSync(`${process.cwd()}/${file}`,"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const moduleBox={exports:{} as T};
 runInNewContext(code,{module:moduleBox,exports:moduleBox.exports,require:(name:string)=>name in mocks?mocks[name]:requireNode(name),console:{warn:()=>{},log:()=>{}},URL,Date,process:{env:{META_CAPI_ENABLED:"true"}},...globals});
 return moduleBox.exports;
}
const request=(cookie="cc_analytics_sid=visitor; ccr_meta_consent=enabled",host="contratacr.com",ua="Mozilla/5.0")=>new Request(`https://${host}/api/projects`,{headers:{cookie,"user-agent":ua}});
test("server consent, native, bots, test domains and attribution use real runtime guards",()=>{
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"server-only":{},"./growth-contract":contract,"./trafico-automatizado":{esPeticionAutomatizada:(cookie:string,ua:string)=>cookie==="1"||ua.includes("Headless")},"@/lib/supabase/admin":{createAdminClient:()=>{throw new Error("unexpected DB");}}});
 expect(lib.growthContext(request()).allowed).toBe(true);
 for(const req of [request("cc_analytics_sid=x"),request("cc_analytics_sid=x; ccr_meta_consent=declined"),request("cc_analytics_sid=x; ccr_meta_consent=enabled; ccr_platform=native"),request(undefined,"test.contratacr.com"),request(undefined,"localhost"),request(undefined,undefined,"HeadlessChrome")])expect(lib.growthContext(req).allowed).toBe(false);
 const attribution=encodeURIComponent(JSON.stringify({source:"meta",campaign:"clientes",content:"one",capturedAt:new Date().toISOString(),privateText:"secret"}));
 const context=lib.growthContext(request(`cc_analytics_sid=x; ccr_meta_consent=enabled; ccr_action_attribution=${attribution}`));
 expect(context.attribution.campaign).toBe("clientes");expect(context.attribution.privateText).toBeUndefined();expect(context.actorHash).not.toBe("x");
});
test("only first receipt emits browser conversion and CAPI payload shares its stable ID",async()=>{
 type StoredRow={ event_id:string; status:string; payload: { event_id:string; custom_data:Record<string,unknown> } | null };
 const rows:StoredRow[]=[];const seen=new Set<string>();
 const db={from:()=>({insert:async(row:StoredRow)=>{if(seen.has(row.event_id))return{error:{code:"23505"}};seen.add(row.event_id);rows.push(row);return{error:null};}})};
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"server-only":{},"./growth-contract":contract,"./trafico-automatizado":{esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}});
 const first=await lib.recordServiceContact(request(),"professional");
 if (!first) throw new Error("expected successful conversion receipt");
 expect(first.eventName).toBe("Contact");expect(rows[0].payload?.event_id).toBe(first.eventId);expect(rows[0].payload?.custom_data).toEqual({action:"service_contact",audience:"client"});
 expect(await lib.recordServiceContact(request(),"professional")).toBeNull();expect(rows).toHaveLength(1);
 expect(JSON.stringify(rows[0].payload)).not.toMatch(/email|cedula|description|message|budget/);
 await lib.recordGrowthConversion(request("cc_analytics_sid=visitor; ccr_meta_consent=declined"),"project_published","project");
 expect(rows[1]).toMatchObject({status:"suppressed",payload:null});
});
test("Pixel queues and flushes same eventID once and excludes declined/native/test traffic",()=>{
 const store=new Map<string,string>();const calls:unknown[][]=[];let declined=false;let native=false;
 const fbq=Object.assign((...args:unknown[])=>calls.push(args),{} as {callMethod?:()=>void});
 const window={location:{hostname:"contratacr.com"},fbq,localStorage:{getItem:()=>declined?"declined":null},sessionStorage:{getItem:(key:string)=>store.get(key)||null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)}};
 const lib=load<typeof import("../../src/lib/analytics/meta-pixel")>("src/lib/analytics/meta-pixel.ts",{"./growth-contract":contract,"@/hooks/use-native-app":{isNativeAppRuntime:()=>native},"@/lib/analytics/trafico-automatizado":{esNavegadorAutomatizado:()=>false}},{window});
 const event: import("../../src/lib/analytics/growth-contract").MetaConversion={eventName:"Contact",eventId:"id",params:{action:"service_contact",audience:"client"}};
 lib.trackMetaConversion(event);lib.trackMetaConversion(event);expect(calls).toHaveLength(0);
 fbq.callMethod=()=>{};lib.enviarEventosMetaPendientes();expect(calls).toEqual([["track","Contact",event.params,{eventID:"id"}]]);
 declined=true;lib.trackMetaConversion({...event,eventId:"declined"});expect(calls).toHaveLength(1);
 declined=false;native=true;lib.trackMetaConversion({...event,eventId:"native"});expect(calls).toHaveLength(1);
 native=false;window.location.hostname="localhost";lib.trackMetaConversion({...event,eventId:"test"});expect(calls).toHaveLength(1);
});

test("existing Pixel/CAPI connection works without a second direct sender or storing matching payloads",async()=>{
 type Row={ event_id:string;status:string;payload:unknown };
 const rows:Row[]=[];
 const db={from:()=>({insert:async(row:Row)=>{rows.push(row);return{error:null};}})};
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"server-only":{},"./growth-contract":contract,"./trafico-automatizado":{esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}},{process:{env:{}}});
 const lead=await lib.recordGrowthConversion(request(),"project_published","project","client");
 expect(lead?.eventName).toBe("Lead");expect(rows[0]).toMatchObject({status:"browser_only",payload:null});expect(rows[0].event_id).toBe(lead?.eventId);
 const winner=await lib.recordGrowthConversion(request(),"professional_project_accepted","project","professional",{metaAllowed:false});
 expect(winner).toBeNull();expect(rows[1]).toMatchObject({status:"suppressed",payload:null});
});

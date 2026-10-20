import { test,expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as platform from "../../src/lib/analytics/platform";
import * as contract from "../../src/lib/analytics/growth-contract";
import * as minimal from "../../src/lib/analytics/meta-minimal";
const requireNode=createRequire(`${process.cwd()}/tests/e2e/meta-growth-runtime.spec.ts`);
function load<T>(file: string, mocks: Record<string,unknown>, globals: Record<string,unknown>={}) {
 const source=readFileSync(`${process.cwd()}/${file}`,"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const moduleBox={exports:{} as T};
 runInNewContext(code,{module:moduleBox,exports:moduleBox.exports,require:(name:string)=>name in mocks?mocks[name]:requireNode(name),console:{warn:()=>{},log:()=>{}},URL,Date,process:{env:{META_CAPI_ENABLED:"true"}},...globals});
 return moduleBox.exports;
}
const request=(cookie="cc_analytics_sid=visitor; ccr_ads_consent_v1=limited; _fbp=fb.1.1792500000000.123456",host="contratacr.com",ua="Mozilla/5.0")=>new Request(`https://${host}/api/projects`,{headers:{cookie,"user-agent":ua}});
test("server consent, native, bots, test domains and attribution use real runtime guards",()=>{
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{esPeticionAutomatizada:(cookie:string,ua:string)=>cookie==="1"||ua.includes("Headless")},"@/lib/supabase/admin":{createAdminClient:()=>{throw new Error("unexpected DB");}}});
 expect(lib.growthContext(request()).allowed).toBe(true);
 for(const req of [request("cc_analytics_sid=x"),request("cc_analytics_sid=x; ccr_meta_consent=enabled"),request("cc_analytics_sid=x; ccr_ads_consent_v1=declined"),request("cc_analytics_sid=x; ccr_ads_consent_v1=accepted; ccr_platform=native"),request(undefined,"test.contratacr.com"),request(undefined,"localhost"),request(undefined,undefined,"HeadlessChrome")])expect(lib.growthContext(req).allowed).toBe(false);
 const attribution=encodeURIComponent(JSON.stringify({source:"meta",campaign:"clientes",content:"one",capturedAt:new Date().toISOString(),privateText:"secret"}));
 const context=lib.growthContext(request(`cc_analytics_sid=x; ccr_ads_consent_v1=accepted; ccr_action_attribution=${attribution}`));
 expect(context.attribution.campaign).toBe("clientes");expect(context.attribution.privateText).toBeUndefined();expect(context.actorHash).not.toBe("x");
});
test("only the first successful business receipt queues a minimal CAPI payload",async()=>{
 type StoredRow={ event_id:string; status:string; payload: { event_id:string; custom_data:Record<string,unknown> } | null };
 const rows:StoredRow[]=[];const seen=new Set<string>();
 const db={from:()=>({insert:async(row:StoredRow)=>{if(seen.has(row.event_id))return{error:{code:"23505"}};seen.add(row.event_id);rows.push(row);return{error:null};}})};
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}});
 const first=await lib.recordServiceContact(request(),"professional");
 if (!first) throw new Error("expected successful conversion receipt");
 expect(first.eventName).toBe("Contact");expect(rows[0].payload?.event_id).toBe(first.eventId);expect(rows[0].payload?.custom_data).toEqual({action:"service_contact",audience:"client",measurement_version:"minimal-2026-10-20"});
 expect(await lib.recordServiceContact(request(),"professional")).toBeNull();expect(rows).toHaveLength(1);
 expect(JSON.stringify(rows[0].payload)).not.toMatch(/email|cedula|description|message|budget/);
 await lib.recordGrowthConversion(request("cc_analytics_sid=visitor; ccr_ads_consent_v1=declined"),"project_published","project");
 expect(rows[1]).toMatchObject({status:"suppressed",payload:null});
});
test("browser business receipts cannot create a duplicate or leak free-text parameters",()=>{
 const calls:unknown[]=[];
 const lib=load<typeof import("../../src/lib/analytics/meta-pixel")>("src/lib/analytics/meta-pixel.ts",{
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
 const lib=load<typeof import("../../src/lib/analytics/growth-server")>("src/lib/analytics/growth-server.ts",{"@/lib/analytics/admin-activity":{analyticsActor:async (id:string)=>({id,excluded:false})},"@/lib/privacy/optional-consent":{OPTIONAL_CONSENT_VERSION:"2026-10-19"},"server-only":{},"./platform":platform,"./growth-contract":contract,"./meta-minimal":minimal,"./trafico-automatizado":{esPeticionAutomatizada:()=>false},"@/lib/supabase/admin":{createAdminClient:()=>db}},{process:{env:{}}});
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
